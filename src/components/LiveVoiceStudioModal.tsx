import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Sparkles,
  Square,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { MovieRecapProject } from '../data/recapCatalog';
import {
  formatShortTime,
  recalculateSmartSyncUnits,
} from '../utils/smartSyncEngine';

interface LiveVoiceStudioModalProps {
  isOpen: boolean;
  project: MovieRecapProject;
  onClose: () => void;
  onUpdateProject: (updated: MovieRecapProject) => void;
}

type LiveVoicePersona = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
type DirectorMode = 'narrator_coach' | 'story_analyst' | 'live_interpreter';

interface TranscriptTurn {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: string;
}

const VOICE_OPTIONS: Array<{
  id: LiveVoicePersona;
  label: string;
  tone: string;
}> = [
  { id: 'Zephyr', label: 'Zephyr', tone: 'Balanced Studio Director' },
  { id: 'Kore', label: 'Kore', tone: 'Warm Narrative Coach' },
  { id: 'Charon', label: 'Charon', tone: 'Deep Cinematic Baritone' },
  { id: 'Fenrir', label: 'Fenrir', tone: 'Dramatic Thriller Tone' },
  { id: 'Puck', label: 'Puck', tone: 'Fast-Paced Dynamic' },
];

const MODE_OPTIONS: Array<{
  id: DirectorMode;
  label: string;
  subtitle: string;
}> = [
  {
    id: 'narrator_coach',
    label: 'Burmese Narrator Coach',
    subtitle: 'Spoken မြန်မာနောက်ခံစကားပြော pacing & dramatic hook coaching',
  },
  {
    id: 'live_interpreter',
    label: 'Live EN → MM Interpreter',
    subtitle: 'Speak English recap lines & hear natural spoken Burmese translation',
  },
  {
    id: 'story_analyst',
    label: 'Story Context Analyst',
    subtitle: 'Character name consistency, plot state & timeline Q&A',
  },
];

// Manual 16-bit PCM little-endian encoder (Float32 -> base64 PCM 16kHz)
function float32ToPcm16Base64(float32Samples: Float32Array): string {
  const int16 = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Samples[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

// Manual 16-bit PCM little-endian decoder (base64 PCM 24kHz -> Float32Array)
function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = window.atob(base64);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

function nowTimeStr(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

export const LiveVoiceStudioModal: React.FC<LiveVoiceStudioModalProps> = ({
  isOpen,
  project,
  onClose,
  onUpdateProject,
}) => {
  const [selectedVoice, setSelectedVoice] =
    useState<LiveVoicePersona>('Zephyr');
  const [directorMode, setDirectorMode] =
    useState<DirectorMode>('narrator_coach');
  const [selectedSegmentId, setSelectedSegmentId] = useState<number>(
    project.units[0]?.id || 1
  );

  const [connectionState, setConnectionState] = useState<
    'idle' | 'connecting' | 'connected' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState<boolean>(false);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [outputLevel, setOutputLevel] = useState<number>(0);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [promptInput, setPromptInput] = useState<string>('');
  const [appliedTurnId, setAppliedTurnId] = useState<string | null>(null);

  // Refs for audio contexts, WebSocket, and gapless playback scheduling (to avoid stale closures)
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMicMutedRef = useRef<boolean>(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    if (project.units.length > 0) {
      setSelectedSegmentId(project.units[0].id);
    }
  }, [project.id]);

  // Session elapsed timer
  useEffect(() => {
    if (connectionState !== 'connected') {
      setSessionSeconds(0);
      return;
    }
    const interval = window.setInterval(() => {
      setSessionSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [connectionState]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const stopAllOutputPlayback = useCallback(() => {
    activeSourceNodesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    });
    activeSourceNodesRef.current.clear();
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsModelSpeaking(false);
    setOutputLevel(0);
  }, []);

  const cleanupLiveSession = useCallback(() => {
    stopAllOutputPlayback();

    if (processorRef.current) {
      try {
        processorRef.current.onaudioprocess = null;
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    setMicLevel(0);
    setOutputLevel(0);
    setIsModelSpeaking(false);
  }, [stopAllOutputPlayback]);

  useEffect(() => {
    if (!isOpen) {
      cleanupLiveSession();
      setConnectionState('idle');
    }
    return () => {
      cleanupLiveSession();
    };
  }, [isOpen, cleanupLiveSession]);

  // Schedule 24kHz PCM chunk for gapless playback
  const scheduleOutputPcmChunk = useCallback((base64Pcm: string) => {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx) return;

    const floatSamples = pcm16Base64ToFloat32(base64Pcm);
    if (floatSamples.length === 0) return;

    // Compute RMS output meter level
    let sumSq = 0;
    for (let i = 0; i < floatSamples.length; i += 8) {
      sumSq += floatSamples[i] * floatSamples[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, floatSamples.length / 8));
    setOutputLevel(Math.min(100, Math.round(rms * 340)));

    const audioBuffer = outCtx.createBuffer(1, floatSamples.length, 24000);
    audioBuffer.getChannelData(0).set(floatSamples);

    const sourceNode = outCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startTime = Math.max(now, nextStartTimeRef.current);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    activeSourceNodesRef.current.add(sourceNode);
    setIsModelSpeaking(true);

    sourceNode.onended = () => {
      activeSourceNodesRef.current.delete(sourceNode);
      if (activeSourceNodesRef.current.size === 0) {
        setIsModelSpeaking(false);
        setOutputLevel(0);
      }
    };

    sourceNode.start(startTime);
  }, []);

  const appendOrMergeTranscript = useCallback(
    (role: 'user' | 'model' | 'system', deltaText: string) => {
      const cleaned = deltaText.trim();
      if (!cleaned) return;

      setTurns((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role && role !== 'system') {
          const updatedLast: TranscriptTurn = {
            ...last,
            text: `${last.text} ${cleaned}`.replace(/\s+/g, ' ').trim(),
          };
          return [...prev.slice(0, -1), updatedLast];
        }
        return [
          ...prev,
          {
            id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role,
            text: cleaned,
            timestamp: nowTimeStr(),
          },
        ];
      });
    },
    []
  );

  const startLiveVoiceSession = async () => {
    if (connectionState === 'connecting' || connectionState === 'connected') {
      return;
    }

    cleanupLiveSession();
    setErrorMessage(null);
    setConnectionState('connecting');

    try {
      // 1. Initialize 16kHz input AudioContext & 24kHz output AudioContext
      const inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      const outputAudioCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputAudioCtx;
      outputAudioCtxRef.current = outputAudioCtx;
      nextStartTimeRef.current = outputAudioCtx.currentTime;

      // 2. Request user microphone stream
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = micStream;
      } catch {
        // Allow session to still connect in text-to-voice mode if microphone permission is unavailable
        setIsMicMuted(true);
        isMicMutedRef.current = true;
      }

      // 3. Connect WebSocket to /live on our Express + HTTP server
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        voice: selectedVoice,
        mode: directorMode,
        projectTitle: project.englishTitle,
        myanmarTitle: project.myanmarTitle,
      });
      const wsUrl = `${proto}//${window.location.host}/live?${params.toString()}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Setup 16kHz PCM mic streaming once socket opens
        if (micStream && inputAudioCtxRef.current) {
          const source =
            inputAudioCtxRef.current.createMediaStreamSource(micStream);
          const processor = inputAudioCtxRef.current.createScriptProcessor(
            4096,
            1,
            1
          );
          processorRef.current = processor;

          source.connect(processor);
          processor.connect(inputAudioCtxRef.current.destination);

          processor.onaudioprocess = (e) => {
            if (isMicMutedRef.current) {
              setMicLevel(0);
              return;
            }
            const channelData = e.inputBuffer.getChannelData(0);
            let sumSq = 0;
            for (let i = 0; i < channelData.length; i += 8) {
              sumSq += channelData[i] * channelData[i];
            }
            const rms = Math.sqrt(sumSq / Math.max(1, channelData.length / 8));
            setMicLevel(Math.min(100, Math.round(rms * 380)));

            if (ws.readyState === WebSocket.OPEN) {
              const base64Audio = float32ToPcm16Base64(channelData);
              ws.send(JSON.stringify({ audio: base64Audio }));
            }
          };
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.status === 'connected') {
            setConnectionState('connected');
            appendOrMergeTranscript(
              'system',
              `Connected to gemini-3.8-live (${msg.voiceName} voice · 16kHz Mic / 24kHz Audio). Speak into your microphone or send a segment below.`
            );

            // Send initial concise project story context to prime the Live session
            const activeUnit =
              project.units.find((u) => u.id === selectedSegmentId) ||
              project.units[0];
            if (ws.readyState === WebSocket.OPEN && activeUnit) {
              ws.send(
                JSON.stringify({
                  text: `Context loaded for movie "${project.englishTitle}" (${project.myanmarTitle}). Characters: ${project.storyContext.characters.join(', ')}. Active segment #${activeUnit.id}: "${activeUnit.source_text}". Greet the director briefly in 1 short sentence.`,
                })
              );
            }
          }

          if (msg.audio) {
            scheduleOutputPcmChunk(msg.audio);
          }

          if (msg.inputTranscript) {
            appendOrMergeTranscript('user', msg.inputTranscript);
          }

          if (msg.outputTranscript) {
            appendOrMergeTranscript('model', msg.outputTranscript);
          } else if (msg.modelText) {
            appendOrMergeTranscript('model', msg.modelText);
          }

          if (msg.interrupted) {
            stopAllOutputPlayback();
          }

          if (msg.error) {
            setErrorMessage(String(msg.error));
            setConnectionState('error');
          }

          if (msg.status === 'disconnected') {
            cleanupLiveSession();
            setConnectionState('idle');
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onerror = () => {
        setErrorMessage(
          'WebSocket connection to /live encountered an error. Please retry.'
        );
        setConnectionState('error');
      };

      ws.onclose = () => {
        cleanupLiveSession();
        setConnectionState((prev) => (prev === 'error' ? 'error' : 'idle'));
      };
    } catch (err: unknown) {
      cleanupLiveSession();
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to start Gemini Live voice session.'
      );
      setConnectionState('error');
    }
  };

  const handleSendTextToLive = (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean) return;
    if (
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN ||
      connectionState !== 'connected'
    ) {
      setErrorMessage(
        'Please click "Start Live Voice Session" first to connect to gemini-3.8-live.'
      );
      return;
    }

    appendOrMergeTranscript('user', clean);
    wsRef.current.send(JSON.stringify({ text: clean }));
    setPromptInput('');
  };

  const activeUnit =
    project.units.find((u) => u.id === selectedSegmentId) || project.units[0];

  const handleApplyTurnToSegment = (turn: TranscriptTurn) => {
    if (!activeUnit) return;
    const nextUnits = project.units.map((u) =>
      u.id === activeUnit.id
        ? { ...u, translation: turn.text, auditStatus: 'VERIFIED' as const }
        : u
    );
    onUpdateProject({
      ...project,
      units: recalculateSmartSyncUnits(nextUnits, {
        edgeRatePercent: project.edgeRatePercent,
        shortPauses: project.overlays.shortPauses,
        maxVideoSpeed: project.maxVideoSpeed,
        maxVideoSlow: project.maxVideoSlow,
      }),
    });
    setAppliedTurnId(turn.id);
    window.setTimeout(() => setAppliedTurnId(null), 2000);
  };

  if (!isOpen) return null;

  const formatSessionTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-4xl border border-[#242B3A] bg-[#11151E] rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Top Broadcast Console Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#1E2430] bg-[#0D1118]">
          <div className="flex items-center gap-3">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-[#4ADE80] animate-pulse'
                  : connectionState === 'connecting'
                  ? 'bg-[#FBBF24] animate-pulse'
                  : 'bg-[#64748B]'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Live Voice Director & Burmese Narrator Studio
                </h2>
                <span className="text-xs font-mono-tabular text-[#60A5FA]">
                  gemini-3.8-live · 16kHz/24kHz PCM
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] font-myanmar">
                {project.englishTitle} — {project.myanmarTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {connectionState === 'connected' && (
              <div className="px-3 py-1 rounded-lg bg-[#0F291E] border border-[#16A34A]/50 text-xs font-mono-tabular text-[#4ADE80] flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>ON AIR · {formatSessionTimer(sessionSeconds)}</span>
              </div>
            )}

            <button
              onClick={() => {
                cleanupLiveSession();
                onClose();
              }}
              className="text-[#94A3B8] hover:text-white cursor-pointer p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main 2-Column Studio Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* LEFT PANE (5 cols): Live Audio Visualizer, Voice/Mode Setup & Active Segment Cue */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#1E2430] bg-[#0B0E14] p-5 space-y-4 overflow-y-auto">
            {/* Primary Connect / Disconnect Call Control */}
            <div className="border border-[#1E2430] bg-[#11151E] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">
                  Real-Time Voice Channel
                </span>
                <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
                  {connectionState === 'connected'
                    ? isModelSpeaking
                      ? 'GEMINI SPEAKING (24kHz)'
                      : isMicMuted
                      ? 'MIC MUTED'
                      : 'LISTENING (16kHz)'
                    : 'STANDBY'}
                </span>
              </div>

              {/* Dual 16-Bar Studio Level Meters (Mic Input & Gemini Output) */}
              <div className="space-y-2.5 bg-[#080A0F] border border-[#1A202C] rounded-lg p-3">
                {/* Mic Input Meter */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                    <span className="text-[#94A3B8] flex items-center gap-1.5">
                      <Mic className="w-3 h-3 text-[#4ADE80]" />
                      <span>MIC IN (16kHz PCM)</span>
                    </span>
                    <span className="text-[#CBD5E1]">
                      {isMicMuted ? 'MUTED' : `${micLevel}%`}
                    </span>
                  </div>
                  <div className="grid grid-cols-16 gap-1 h-2">
                    {Array.from({ length: 16 }).map((_, idx) => {
                      const threshold = ((idx + 1) / 16) * 100;
                      const active =
                        connectionState === 'connected' &&
                        !isMicMuted &&
                        micLevel >= threshold;
                      return (
                        <div
                          key={idx}
                          className={`rounded-xs transition-colors duration-75 ${
                            active
                              ? idx > 12
                                ? 'bg-[#F59E0B]'
                                : 'bg-[#4ADE80]'
                              : 'bg-[#182030]'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Gemini Live Output Meter */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                    <span className="text-[#94A3B8] flex items-center gap-1.5">
                      <Volume2 className="w-3 h-3 text-[#60A5FA]" />
                      <span>GEMINI 3.8 LIVE (24kHz PCM)</span>
                    </span>
                    <span className="text-[#60A5FA]">
                      {isModelSpeaking ? 'SPEAKING' : 'IDLE'}
                    </span>
                  </div>
                  <div className="grid grid-cols-16 gap-1 h-2">
                    {Array.from({ length: 16 }).map((_, idx) => {
                      const threshold = ((idx + 1) / 16) * 100;
                      const active =
                        connectionState === 'connected' &&
                        isModelSpeaking &&
                        Math.max(25, outputLevel) >= threshold;
                      return (
                        <div
                          key={idx}
                          className={`rounded-xs transition-colors duration-75 ${
                            active ? 'bg-[#3B82F6]' : 'bg-[#182030]'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Start / Stop & Mute Controls */}
              <div className="flex items-center gap-2">
                {connectionState !== 'connected' ? (
                  <button
                    type="button"
                    onClick={startLiveVoiceSession}
                    disabled={connectionState === 'connecting'}
                    className="flex-1 py-2.5 px-4 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    {connectionState === 'connecting' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Connecting gemini-3.8-live...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        <span>Start Live Voice Session</span>
                      </>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsMicMuted((m) => !m)}
                      className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                        isMicMuted
                          ? 'bg-[#3B1D24] border-[#6E303D] text-[#FCA5A5]'
                          : 'bg-[#19202E] border-[#2B3548] text-white hover:bg-[#232C3F]'
                      }`}
                    >
                      {isMicMuted ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" />
                          <span>Unmute</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5 text-[#4ADE80]" />
                          <span>Mute Mic</span>
                        </>
                      )}
                    </button>

                    {isModelSpeaking && (
                      <button
                        type="button"
                        onClick={stopAllOutputPlayback}
                        className="px-3 py-2.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-xs font-medium text-[#CBD5E1] rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        <span>Interrupt</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        cleanupLiveSession();
                        setConnectionState('idle');
                      }}
                      className="flex-1 py-2.5 px-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      <span>End Session</span>
                    </button>
                  </>
                )}
              </div>

              {errorMessage && (
                <div className="p-2.5 rounded-lg bg-[#3B1D24] border border-[#6E303D] text-xs text-[#FCA5A5]">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Voice Persona & Director Mode Configuration */}
            <div className="border border-[#1E2430] bg-[#11151E] rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-white mb-1.5">
                  Live Voice Persona (Prebuilt Voice)
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {VOICE_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={connectionState === 'connected'}
                      onClick={() => setSelectedVoice(v.id)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors disabled:opacity-60 ${
                        selectedVoice === v.id
                          ? 'bg-[#3B82F6] border-[#3B82F6] text-white'
                          : 'bg-[#0B0E14] border-[#242B3A] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white mb-1.5">
                  Director Coaching Mode
                </label>
                <div className="space-y-1.5">
                  {MODE_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={connectionState === 'connected'}
                      onClick={() => setDirectorMode(m.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-60 ${
                        directorMode === m.id
                          ? 'bg-[#161F30] border-[#3B82F6] text-white'
                          : 'bg-[#0B0E14] border-[#1E2430] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.label}</div>
                      <div className="text-[11px] text-[#94A3B8] font-myanmar">
                        {m.subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active Segment Cue Card */}
            {activeUnit && (
              <div className="border border-[#1E2430] bg-[#11151E] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">
                    Target Segment for Live Coaching
                  </span>
                  <select
                    value={selectedSegmentId}
                    onChange={(e) =>
                      setSelectedSegmentId(Number(e.target.value))
                    }
                    className="px-2 py-1 bg-[#0B0E14] border border-[#242B3A] rounded text-xs font-mono-tabular text-white"
                  >
                    {project.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        ID {String(u.id).padStart(5, '0')} (
                        {formatShortTime(u.start)}–{formatShortTime(u.end)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-2.5 rounded bg-[#0B0E14] border border-[#1E2430] space-y-1">
                  <div className="text-[11px] text-[#94A3B8]">
                    EN: &ldquo;{activeUnit.source_text}&rdquo;
                  </div>
                  <div className="text-xs text-[#E2E8F0] font-myanmar">
                    MM: {activeUnit.translation || '—'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleSendTextToLive(
                      `Please give me a dramatic spoken Burmese movie narrator translation (မြန်မာနောက်ခံစကားပြော) for Segment #${activeUnit.id}: "${activeUnit.source_text}" that fits a ${(
                        activeUnit.end - activeUnit.start
                      ).toFixed(1)}s window.`
                    )
                  }
                  className="w-full py-2 px-3 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded-lg text-xs font-medium text-[#60A5FA] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Ask Live Director to Rehearse Segment #{activeUnit.id}</span>
                </button>
              </div>
            )}
          </div>

          {/* RIGHT PANE (7 cols): Real-Time Live Voice Transcript & Interactive Cues */}
          <div className="lg:col-span-7 flex flex-col bg-[#11151E] h-[520px] lg:h-auto">
            {/* Quick Voice Conversation Prompts */}
            <div className="px-5 py-3 border-b border-[#1E2430] bg-[#0E121B] flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[#94A3B8] mr-1">
                Quick Cues:
              </span>
              <button
                type="button"
                onClick={() =>
                  handleSendTextToLive(
                    `How can we make the opening Burmese hook for "${project.englishTitle}" (${project.myanmarTitle}) more suspenseful?`
                  )
                }
                className="px-2.5 py-1 bg-[#161C28] hover:bg-[#1F2737] border border-[#263042] rounded text-[11px] text-[#CBD5E1] cursor-pointer"
              >
                Suspenseful Burmese Hook
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendTextToLive(
                    `Check our character name consistency rules: ${project.storyContext.name_consistency.join('; ')}. Read them aloud in Burmese.`
                  )
                }
                className="px-2.5 py-1 bg-[#161C28] hover:bg-[#1F2737] border border-[#263042] rounded text-[11px] text-[#CBD5E1] cursor-pointer"
              >
                Rehearse Cast Names
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendTextToLive(
                    `Give me a 1-sentence cliffhanger ending in spoken Burmese for Episode 1 of "${project.myanmarTitle}".`
                  )
                }
                className="px-2.5 py-1 bg-[#161C28] hover:bg-[#1F2737] border border-[#263042] rounded text-[11px] text-[#CBD5E1] cursor-pointer"
              >
                Episode Cliffhanger
              </button>
            </div>

            {/* Live Streaming Transcript Feed */}
            <div className="flex-1 p-5 space-y-3 overflow-y-auto">
              {turns.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#161F30] border border-[#2B3B55] flex items-center justify-center text-[#60A5FA]">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 max-w-md">
                    <h3 className="text-sm font-semibold text-white">
                      Real-Time Voice Conversation with Gemini 3.8 Live
                    </h3>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      Click <strong>Start Live Voice Session</strong> on the left to open a low-latency bi-directional audio stream (`gemini-3.8-live`). Speak naturally in English or Burmese to rehearse movie recap lines, refine pacing, or audit story continuity.
                    </p>
                  </div>
                </div>
              ) : (
                turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex flex-col ${
                      turn.role === 'user'
                        ? 'items-end'
                        : turn.role === 'system'
                        ? 'items-center'
                        : 'items-start'
                    }`}
                  >
                    {turn.role === 'system' ? (
                      <div className="px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2430] text-[11px] font-mono-tabular text-[#94A3B8]">
                        {turn.text}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] rounded-xl p-3.5 space-y-2 border ${
                          turn.role === 'user'
                            ? 'bg-[#1D4ED8]/25 border-[#3B82F6]/40 text-white'
                            : 'bg-[#0B0E14] border-[#1E2430] text-[#E7EAF0]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[10px] font-mono-tabular text-[#94A3B8]">
                          <span>
                            {turn.role === 'user'
                              ? 'YOU (VOICE / CUE)'
                              : `GEMINI 3.8 LIVE (${selectedVoice.toUpperCase()})`}
                          </span>
                          <span>{turn.timestamp}</span>
                        </div>

                        <p className="text-xs font-myanmar leading-relaxed whitespace-pre-wrap">
                          {turn.text}
                        </p>

                        {turn.role === 'model' && activeUnit && (
                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleApplyTurnToSegment(turn)}
                              className="px-2.5 py-1 rounded bg-[#161C28] hover:bg-[#232C3F] border border-[#2B3548] text-[11px] text-[#60A5FA] flex items-center gap-1 cursor-pointer"
                            >
                              {appliedTurnId === turn.id ? (
                                <>
                                  <Check className="w-3 h-3 text-[#4ADE80]" />
                                  <span className="text-[#4ADE80]">
                                    Applied to ID #{activeUnit.id}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span>
                                    Apply to Segment #{activeUnit.id}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Bottom Text-to-Live Voice Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendTextToLive(promptInput);
              }}
              className="p-4 border-t border-[#1E2430] bg-[#0B0E14] flex items-center gap-2.5"
            >
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder={
                  connectionState === 'connected'
                    ? 'Speak into your mic or type a cue for Gemini Live...'
                    : 'Start Live Voice Session to speak or send cues...'
                }
                className="flex-1 px-3.5 py-2 bg-[#11151E] border border-[#242B3A] rounded-lg text-xs text-white font-myanmar focus:outline-none focus:border-[#3B82F6]"
              />
              <button
                type="submit"
                disabled={!promptInput.trim()}
                className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-40 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send to Live</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
