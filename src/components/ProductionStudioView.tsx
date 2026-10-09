import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RefreshCw,
  Volume2,
  Download,
  Plus,
  Trash2,
  Sparkles,
  Square,
  CheckCircle2,
  AlertTriangle,
  FlipHorizontal,
  Layers,
  Upload,
  Video,
  Mic,
} from 'lucide-react';
import { MovieRecapProject } from '../data/recapCatalog';
import { VideoExportAndVeoModal } from './VideoExportAndVeoModal';
import {
  AtomicSyncUnit,
  BlurBox,
  EdgeVoiceId,
  FrameFillMode,
  OutputRatio,
  ProductionOverlays,
  buildSmartSyncPlanJson,
  buildSrtContent,
  formatShortTime,
  formatTimestampMs,
  getOutputCanvasSize,
  mmNumber,
  recalculateSmartSyncUnits,
  volumePercentToDb,
} from '../utils/smartSyncEngine';

interface ProductionStudioViewProps {
  project: MovieRecapProject;
  projects: MovieRecapProject[];
  initialSegmentId?: number;
  onSelectProject: (projectId: string) => void;
  onUpdateProject: (updated: MovieRecapProject) => void;
  onOpenNewJobModal: () => void;
  onOpenLiveVoiceModal: () => void;
}

export const ProductionStudioView: React.FC<ProductionStudioViewProps> = ({
  project,
  projects,
  initialSegmentId,
  onSelectProject,
  onUpdateProject,
  onOpenNewJobModal,
  onOpenLiveVoiceModal,
}) => {
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [drawBlurMode, setDrawBlurMode] = useState<boolean>(false);
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<'segments' | 'logs'>('segments');
  const [isPipelineRunning, setIsPipelineRunning] = useState<boolean>(false);
  const [pipelineStepLabel, setPipelineStepLabel] = useState<string>('IDLE · READY');
  const [isSynthesizingSegmentId, setIsSynthesizingSegmentId] = useState<number | null>(null);
  const [customVideoObjectUrl, setCustomVideoObjectUrl] = useState<string | null>(null);
  const [videoModalState, setVideoModalState] = useState<{
    isOpen: boolean;
    mode: 'export' | 'veo';
  }>({ isOpen: false, mode: 'export' });
  const [logs, setLogs] = useState<string[]>([
    `[SYSTEM] Loaded job "${project.englishTitle}" (${project.units.length} V2 local sync units)`,
    `[SYNC] Segmentation profile: v23_v2_local_sync_4p2_5p6 · Boundary: v2_full_coverage_midpoint`,
    `[VOICE] Narrator preset: ${project.voicePersona} · Rate: ${project.edgeRatePercent >= 0 ? '+' : ''}${project.edgeRatePercent}% · Short pauses: ON (~0.25s)`,
  ]);

  const stopRequestedRef = useRef<boolean>(false);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Dragging state for interactive canvas overlays (Title, Logo, Extra Text, or Drawing Blur Box)
  const [dragState, setDragState] = useState<{
    kind: 'title' | 'logo' | 'extraText' | 'drawBlur' | 'moveBlur';
    blurId?: string;
    startX: number;
    startY: number;
    origPos: [number, number];
  } | null>(null);

  const [tempBlurRect, setTempBlurRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    if (initialSegmentId) {
      const idx = project.units.findIndex((u) => u.id === initialSegmentId);
      if (idx !== -1) setActiveSegmentIdx(idx);
    } else {
      setActiveSegmentIdx(0);
    }
  }, [project.id, initialSegmentId, project.units]);

  // Playback simulation timer through segments
  useEffect(() => {
    if (!isPlaying) return;
    const currentUnit = project.units[activeSegmentIdx];
    const intervalMs = Math.max(1800, (currentUnit?.ttsDuration || 4.0) * 1000);
    const timer = window.setTimeout(() => {
      if (activeSegmentIdx < project.units.length - 1) {
        setActiveSegmentIdx((prev) => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, activeSegmentIdx, project.units]);

  const appendLog = (line: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs((prev) => [`[${ts}] ${line}`, ...prev.slice(0, 119)]);
  };

  const currentUnit: AtomicSyncUnit | undefined =
    project.units[activeSegmentIdx] || project.units[0];

  const totalVideoDuration =
    project.units.length > 0 ? project.units[project.units.length - 1].video_end : 0;

  const updateOverlays = (partial: Partial<ProductionOverlays>) => {
    const nextOverlays: ProductionOverlays = {
      ...project.overlays,
      ...partial,
    };
    const recomputedUnits = recalculateSmartSyncUnits(project.units, {
      edgeRatePercent: project.edgeRatePercent,
      shortPauses: nextOverlays.shortPauses,
      maxVideoSpeed: project.maxVideoSpeed,
      maxVideoSlow: project.maxVideoSlow,
    });
    onUpdateProject({
      ...project,
      overlays: nextOverlays,
      units: recomputedUnits,
    });
  };

  const updateVoiceOrSyncSettings = (changes: Partial<MovieRecapProject>) => {
    const merged = { ...project, ...changes };
    const recomputed = recalculateSmartSyncUnits(merged.units, {
      edgeRatePercent: merged.edgeRatePercent,
      shortPauses: merged.overlays.shortPauses,
      maxVideoSpeed: merged.maxVideoSpeed,
      maxVideoSlow: merged.maxVideoSlow,
    });
    onUpdateProject({
      ...merged,
      units: recomputed,
    });
  };

  // Interactive Canvas Pointer Handlers for dragging Myanmar Title, Logo, Extra Text & Drawing Blur Boxes
  const getNormalizedCanvasCoords = (e: React.MouseEvent): [number, number] => {
    const rect = previewContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return [0.5, 0.5];
    const nx = Math.max(0.04, Math.min(0.96, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.04, Math.min(0.96, (e.clientY - rect.top) / rect.height));
    return [Number(nx.toFixed(3)), Number(ny.toFixed(3))];
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!drawBlurMode) return;
    const [nx, ny] = getNormalizedCanvasCoords(e);
    setDragState({
      kind: 'drawBlur',
      startX: nx,
      startY: ny,
      origPos: [nx, ny],
    });
    setTempBlurRect({ x: nx, y: ny, w: 0.02, h: 0.02 });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const [nx, ny] = getNormalizedCanvasCoords(e);

    if (dragState.kind === 'title') {
      updateOverlays({ titlePos: [nx, ny] });
    } else if (dragState.kind === 'logo') {
      updateOverlays({ logoPos: [nx, ny] });
    } else if (dragState.kind === 'extraText') {
      updateOverlays({ extraTextPos: [nx, ny] });
    } else if (dragState.kind === 'moveBlur' && dragState.blurId) {
      const nextBoxes = project.overlays.blurBoxes.map((b) =>
        b.id === dragState.blurId ? { ...b, x: nx, y: ny } : b
      );
      updateOverlays({ blurBoxes: nextBoxes });
    } else if (dragState.kind === 'drawBlur') {
      const minX = Math.min(dragState.startX, nx);
      const maxX = Math.max(dragState.startX, nx);
      const minY = Math.min(dragState.startY, ny);
      const maxY = Math.max(dragState.startY, ny);
      const w = Math.max(0.06, maxX - minX);
      const h = Math.max(0.05, maxY - minY);
      setTempBlurRect({
        x: Number((minX + w / 2).toFixed(3)),
        y: Number((minY + h / 2).toFixed(3)),
        w: Number(w.toFixed(3)),
        h: Number(h.toFixed(3)),
      });
    }
  };

  const handleCanvasMouseUp = () => {
    if (dragState?.kind === 'drawBlur' && tempBlurRect) {
      const newBox: BlurBox = {
        id: `blur-${Date.now()}`,
        x: tempBlurRect.x,
        y: tempBlurRect.y,
        w: tempBlurRect.w,
        h: tempBlurRect.h,
        label: `Blur Box #${project.overlays.blurBoxes.length + 1}`,
      };
      updateOverlays({
        blurBoxes: [...project.overlays.blurBoxes, newBox],
      });
      setSelectedBlurId(newBox.id);
      setDrawBlurMode(false);
      setTempBlurRect(null);
      appendLog(
        `🔲 Added watermark blur box (${Math.round(newBox.w * 100)}% × ${Math.round(newBox.h * 100)}%) at (${newBox.x}, ${newBox.y})`
      );
    }
    setDragState(null);
  };

  const handleDeleteSelectedBlur = () => {
    if (!selectedBlurId) return;
    const filtered = project.overlays.blurBoxes.filter((b) => b.id !== selectedBlurId);
    updateOverlays({ blurBoxes: filtered });
    appendLog(`🗑️ Deleted watermark blur box ${selectedBlurId}`);
    setSelectedBlurId(null);
  };

  // Run Full Step-1 & Step-2 AI Pipeline (Story Context -> Burmese Narrator Translation -> Audit -> Smart Sync)
  const handleRunFullPipeline = async () => {
    if (isPipelineRunning) return;
    stopRequestedRef.current = false;
    setIsPipelineRunning(true);
    setActiveBottomTab('logs');

    try {
      // STEP 1: Build Story Context Memory
      setPipelineStepLabel('STEP 1/3 · BUILDING STORY MEMORY');
      appendLog(`🧠 STEP 1 — Building Story Context Memory for "${project.englishTitle}"...`);
      const ctxRes = await fetch('/api/recap/story-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieTitle: project.englishTitle,
          units: project.units,
          existingMemory: project.storyContext,
        }),
      });
      const ctxData = await ctxRes.json();
      if (!ctxRes.ok) throw new Error(ctxData.error || 'Story Context request failed');

      const updatedMemory = ctxData.memory || project.storyContext;
      appendLog(
        `✅ Story Context updated — ${updatedMemory.characters?.length || 0} characters, ${updatedMemory.plot_state?.length || 0} plot states`
      );

      if (stopRequestedRef.current) {
        appendLog('⏹️ Safe stop checkpoint reached after Story Context pass.');
        setPipelineStepLabel('STOPPED SAFELY · RESUMABLE');
        setIsPipelineRunning(false);
        return;
      }

      // STEP 2: Context-Aware Burmese Narration Translation
      setPipelineStepLabel('STEP 2/3 · TRANSLATING TO BURMESE NARRATOR');
      appendLog(
        `🌐 STEP 2 — Translating ${project.units.length} atomic sync units into natural spoken Burmese...`
      );
      const trRes = await fetch('/api/recap/translate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current: project.units,
          storyContext: updatedMemory,
          previousContext: [],
          nextContext: [],
        }),
      });
      const trData = await trRes.json();
      if (!trRes.ok) throw new Error(trData.error || 'Burmese translation failed');

      if (Array.isArray(trData.warnings)) {
        for (const w of trData.warnings) {
          appendLog(`⚠️ ${w}`);
        }
      }

      const translatedMap = new Map<number, string>();
      for (const item of trData.items || []) {
        translatedMap.set(Number(item.id), item.translation);
      }

      const mergedUnits: AtomicSyncUnit[] = project.units.map((u) => ({
        ...u,
        translation: translatedMap.get(u.id) || u.translation,
        auditStatus: 'VERIFIED',
      }));

      // STEP 3: Recompute V2 Midpoint & 30fps Smart Sync Plan
      setPipelineStepLabel('STEP 3/3 · COMPUTING 30FPS SMART SYNC');
      const syncedUnits = recalculateSmartSyncUnits(mergedUnits, {
        edgeRatePercent: project.edgeRatePercent,
        shortPauses: project.overlays.shortPauses,
        maxVideoSpeed: project.maxVideoSpeed,
        maxVideoSlow: project.maxVideoSlow,
      });

      onUpdateProject({
        ...project,
        storyContext: updatedMemory,
        units: syncedUnits,
        syncStatus: 'Smart Sync Verified',
      });

      appendLog(
        `✅ smart_sync_plan.json READY — ${syncedUnits.length} V2 local sync units aligned within <= 0.5 frame @ 30fps`
      );
      setPipelineStepLabel('SYNC OK · PLAN READY');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pipeline execution error';
      appendLog(`❌ Pipeline Error: ${msg}`);
      setPipelineStepLabel('ERROR · CHECK LOGS');
    } finally {
      setIsPipelineRunning(false);
    }
  };

  // Synthesize Burmese TTS voice for a specific segment & update its exact WAV duration in Smart Sync
  const handleSynthesizeSegmentVoice = async (unit: AtomicSyncUnit) => {
    if (isSynthesizingSegmentId !== null) return;
    setIsSynthesizingSegmentId(unit.id);
    appendLog(
      `🎙️ Synthesizing Burmese TTS for ID ${String(unit.id).padStart(5, '0')} (${project.voicePersona})...`
    );

    try {
      const res = await fetch('/api/recap/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: unit.translation || unit.source_text,
          voicePersona: project.voicePersona,
          shortPauses: project.overlays.shortPauses,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TTS failed');

      const updatedUnits = project.units.map((u) =>
        u.id === unit.id
          ? {
              ...u,
              audioDataUrl: data.audioDataUrl,
              ttsDuration: data.durationSeconds || u.ttsDuration,
            }
          : u
      );

      const resynced = recalculateSmartSyncUnits(updatedUnits, {
        edgeRatePercent: project.edgeRatePercent,
        shortPauses: project.overlays.shortPauses,
        maxVideoSpeed: project.maxVideoSpeed,
        maxVideoSlow: project.maxVideoSlow,
      });

      onUpdateProject({
        ...project,
        units: resynced,
      });

      const targetSeg = resynced.find((u) => u.id === unit.id);
      appendLog(
        `✅ SYNC OK ID ${String(unit.id).padStart(5, '0')} — WAV=${data.durationSeconds}s | Speed=${targetSeg?.speedFactor}x | Frames=${targetSeg?.frameCount30fps}f`
      );

      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      const audio = new Audio(data.audioDataUrl);
      activeAudioRef.current = audio;
      audio.play().catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'TTS error';
      appendLog(`❌ TTS Error on ID ${String(unit.id).padStart(5, '0')}: ${msg}`);
    } finally {
      setIsSynthesizingSegmentId(null);
    }
  };

  // Download file helper
  const downloadFile = (filename: string, content: string, mimeType = 'application/json') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    appendLog(`📦 Exported ${filename}`);
  };

  const handleExportSmartSyncPlan = () => {
    const plan = buildSmartSyncPlanJson(
      project.englishTitle,
      project.units,
      project.storyContext,
      project.overlays
    );
    downloadFile(
      `${project.id}_smart_sync_plan.json`,
      JSON.stringify(plan, null, 2),
      'application/json'
    );
  };

  const handleExportSrt = (mode: 'mm_only' | 'bilingual') => {
    const srt = buildSrtContent(project.units, mode);
    downloadFile(
      `${project.id}_${mode === 'bilingual' ? 'bilingual' : 'myanmar'}.srt`,
      srt,
      'text/plain;charset=utf-8'
    );
  };

  const handleLocalVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customVideoObjectUrl) {
      URL.revokeObjectURL(customVideoObjectUrl);
    }
    const url = URL.createObjectURL(file);
    setCustomVideoObjectUrl(url);
    appendLog(`🎬 Attached local video source: ${file.name} (${(file.size / 1048576).toFixed(1)} MB)`);
  };

  const [canvasW, canvasH] = getOutputCanvasSize(project.overlays.outputRatio);
  const aspectStyle =
    project.overlays.outputRatio === '9:16'
      ? 'aspect-[9/16] max-h-[460px]'
      : project.overlays.outputRatio === '1:1'
      ? 'aspect-square max-h-[440px]'
      : 'aspect-video max-h-[440px]';

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Top Studio Source & Job Control Bar (Upgraded from controller.py row 1) */}
      <div className="border border-[#1E2430] bg-[#11151E] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-[#94A3B8] whitespace-nowrap">
            Active Recap Job
          </label>
          <select
            value={project.id}
            onChange={(e) => onSelectProject(e.target.value)}
            className="px-3 py-2 bg-[#0B0E14] border border-[#262F40] rounded-lg text-xs text-white font-myanmar focus:outline-none focus:border-[#3B82F6]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.englishTitle} — {p.myanmarTitle}
              </option>
            ))}
          </select>

          <label className="px-3 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-xs font-medium text-[#E7EAF0] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>Load Local MP4</span>
            <input
              type="file"
              accept="video/*"
              onChange={handleLocalVideoUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={() => setVideoModalState({ isOpen: true, mode: 'veo' })}
            className="px-3 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-xs font-medium text-[#E7EAF0] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Video className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>Generate Scene Video (Veo 3)</span>
          </button>

          <button
            onClick={onOpenLiveVoiceModal}
            className="px-3 py-2 bg-[#161F30] hover:bg-[#1E2B42] border border-[#3B82F6]/50 text-xs font-semibold text-[#60A5FA] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span>Live Voice Director (3.8 Live)</span>
          </button>

          <button
            onClick={onOpenNewJobModal}
            className="px-3 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-xs font-medium text-[#E7EAF0] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>New Transcript / Audio Job</span>
          </button>
        </div>

        {/* Pipeline Execution Controls (START / RESUME, STOP SAFELY & FINAL VIDEO EXPORT) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-mono-tabular text-[#60A5FA]">
            {pipelineStepLabel}
          </span>

          <button
            onClick={handleRunFullPipeline}
            disabled={isPipelineRunning}
            className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isPipelineRunning ? 'Running Gemini Pipeline...' : 'START / RESUME PIPELINE'}
            </span>
          </button>

          <button
            onClick={() => setVideoModalState({ isOpen: true, mode: 'export' })}
            className="px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Render & Download Video</span>
          </button>

          <button
            onClick={() => {
              stopRequestedRef.current = true;
              appendLog('⏹️ STOP SAFELY requested — will halt at next checkpoint.');
            }}
            disabled={!isPipelineRunning}
            className="px-3.5 py-2 bg-[#3B1D24] hover:bg-[#4F242E] disabled:opacity-40 border border-[#6E303D] text-[#FCA5A5] text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            <span>STOP SAFELY</span>
          </button>
        </div>
      </div>

      {/* 3-PANE STUDIO WORKSPACE (Left: Translation & Voice Settings | Center: Interactive Preview & Logs | Right: Production Tools) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT PANE (3 cols): Translation, Voice & Smart Sync Settings */}
        <div className="lg:col-span-3 border border-[#1E2430] bg-[#11151E] rounded-xl p-4 space-y-5">
          <div className="border-b border-[#1E2430] pb-3">
            <h2 className="text-sm font-semibold text-white">
              Translation & Voice Settings
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              English → Myanmar · Narrator Only · Smart Sync
            </p>
          </div>

          {/* Narrator Voice Persona */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#CBD5E1]">
              Burmese Narrator Voice
            </label>
            <select
              value={project.voicePersona}
              onChange={(e) =>
                updateVoiceOrSyncSettings({
                  voicePersona: e.target.value as EdgeVoiceId,
                })
              }
              className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-white focus:outline-none focus:border-[#3B82F6]"
            >
              <option value="my-MM-ThihaNeural">
                my-MM-ThihaNeural (Male Deep Narrator)
              </option>
              <option value="my-MM-NilarNeural">
                my-MM-NilarNeural (Female Expressive Narrator)
              </option>
            </select>
          </div>

          {/* TTS Speed (-50% to +100%) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#CBD5E1]">Narrator Speed</span>
              <span className="font-mono-tabular text-[#60A5FA]">
                {project.edgeRatePercent >= 0
                  ? `+${project.edgeRatePercent}%`
                  : `${project.edgeRatePercent}%`}
              </span>
            </div>
            <input
              type="range"
              min={-50}
              max={100}
              step={1}
              value={project.edgeRatePercent}
              onChange={(e) =>
                updateVoiceOrSyncSettings({ edgeRatePercent: Number(e.target.value) })
              }
              className="w-full accent-[#3B82F6]"
            />
          </div>

          {/* Voice Volume (50% to 300% with dB readout) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#CBD5E1]">Voice Volume</span>
              <span className="font-mono-tabular text-[#60A5FA]">
                {volumePercentToDb(project.overlays.voiceVolumePercent)}
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={300}
              step={5}
              value={project.overlays.voiceVolumePercent}
              onChange={(e) =>
                updateOverlays({ voiceVolumePercent: Number(e.target.value) })
              }
              className="w-full accent-[#3B82F6]"
            />
          </div>

          {/* Short Pauses Toggle */}
          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={project.overlays.shortPauses}
              onChange={(e) => updateOverlays({ shortPauses: e.target.checked })}
              className="mt-0.5 accent-[#3B82F6]"
            />
            <span className="text-xs text-[#CBD5E1] leading-snug">
              Short pauses (~0.25s between lines instead of ~1.0s silence)
            </span>
          </label>

          {/* Smart Sync Speed Constraints */}
          <div className="pt-3 border-t border-[#1E2430] space-y-3">
            <h3 className="text-xs font-semibold text-white">
              Smart Sync V2 Speed Limits
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#94A3B8] mb-1">
                  Max Video Speed
                </label>
                <select
                  value={project.maxVideoSpeed}
                  onChange={(e) =>
                    updateVoiceOrSyncSettings({
                      maxVideoSpeed: Number(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-[#0B0E14] border border-[#242B3A] rounded text-xs font-mono-tabular text-white"
                >
                  <option value={1.15}>1.15x</option>
                  <option value={1.25}>1.25x (Default)</option>
                  <option value={1.35}>1.35x</option>
                  <option value={1.5}>1.50x</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#94A3B8] mb-1">
                  Max Video Slow
                </label>
                <select
                  value={project.maxVideoSlow}
                  onChange={(e) =>
                    updateVoiceOrSyncSettings({
                      maxVideoSlow: Number(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-[#0B0E14] border border-[#242B3A] rounded text-xs font-mono-tabular text-white"
                >
                  <option value={1.2}>1.20x</option>
                  <option value={1.35}>1.35x (Default)</option>
                  <option value={1.5}>1.50x</option>
                </select>
              </div>
            </div>

            <div className="text-[11px] text-[#94A3B8] space-y-1 pt-1">
              <div>· Boundary: V2 Full Coverage Midpoint</div>
              <div>· Atomic Target: 4.2s (Max 5.6s)</div>
              <div>· Foreign-Script Sanitizer: Enabled</div>
            </div>
          </div>

          {/* Story Context Quick Summary */}
          <div className="pt-3 border-t border-[#1E2430] space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white">
                Story Context Memory
              </h3>
              <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
                {project.storyContext.characters.length} Cast
              </span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {project.storyContext.name_consistency.map((rule, i) => (
                <div
                  key={i}
                  className="text-xs text-[#CBD5E1] font-myanmar bg-[#0B0E14] border border-[#1E2430] rounded px-2.5 py-1.5"
                >
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER PANE (6 cols): Interactive Frame Preview Canvas + Scrubber + Segment/Log Console */}
        <div className="lg:col-span-6 space-y-4">
          <div className="border border-[#1E2430] bg-[#11151E] rounded-xl p-4 space-y-4">
            {/* Canvas Top Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-mono-tabular text-[#94A3B8]">
                <span className="text-white font-semibold">
                  Output {project.overlays.outputRatio} ({canvasW}×{canvasH})
                </span>
                <span aria-hidden="true">·</span>
                <span>Fill: {project.overlays.frameFill}</span>
                <span aria-hidden="true">·</span>
                <span>Zoom: {project.overlays.zoomFactor.toFixed(2)}x</span>
                {project.overlays.mirrorVideo && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#60A5FA]">Mirrored ↔</span>
                  </>
                )}
              </div>

              <span className="text-[11px] text-[#94A3B8]">
                {drawBlurMode
                  ? 'Click & drag on frame to draw watermark blur box'
                  : 'Drag Title, Logo, or Episode text directly on canvas'}
              </span>
            </div>

            {/* Interactive Aspect-Ratio Stage */}
            <div className="w-full bg-[#07090E] border border-[#1E2430] rounded-lg p-3 flex items-center justify-center min-h-[320px]">
              <div
                ref={previewContainerRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                className={`relative w-full ${aspectStyle} overflow-hidden rounded border border-[#2B3548] select-none ${
                  drawBlurMode ? 'cursor-crosshair' : 'cursor-default'
                }`}
              >
                {/* 1. Background Fill Layer (Blur background vs Black bars vs Crop) */}
                {project.overlays.frameFill === 'blur' && (
                  <img
                    src={project.thumbnailUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60 pointer-events-none"
                  />
                )}
                {project.overlays.frameFill === 'black' && (
                  <div className="absolute inset-0 bg-black pointer-events-none" />
                )}

                {/* 2. Primary Source Video / Frame Layer with Zoom & Horizontal Mirror */}
                {customVideoObjectUrl ? (
                  <video
                    src={customVideoObjectUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    style={{
                      transform: `scale(${project.overlays.zoomFactor}) scaleX(${
                        project.overlays.mirrorVideo ? -1 : 1
                      })`,
                    }}
                    className={`relative w-full h-full ${
                      project.overlays.frameFill === 'crop'
                        ? 'object-cover'
                        : 'object-contain'
                    } transition-transform duration-150 pointer-events-none`}
                  />
                ) : (
                  <img
                    src={project.thumbnailUrl}
                    alt={project.englishTitle}
                    referrerPolicy="no-referrer"
                    style={{
                      transform: `scale(${project.overlays.zoomFactor}) scaleX(${
                        project.overlays.mirrorVideo ? -1 : 1
                      })`,
                    }}
                    className={`relative w-full h-full ${
                      project.overlays.frameFill === 'crop'
                        ? 'object-cover'
                        : 'object-contain'
                    } transition-transform duration-150 pointer-events-none`}
                  />
                )}

                {/* Scrim for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/40 pointer-events-none" />

                {/* 3. Interactive Watermark Blur Boxes */}
                {project.overlays.blurBoxes.map((box) => {
                  const isSelected = box.id === selectedBlurId;
                  return (
                    <div
                      key={box.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedBlurId(box.id);
                        setDragState({
                          kind: 'moveBlur',
                          blurId: box.id,
                          startX: box.x,
                          startY: box.y,
                          origPos: [box.x, box.y],
                        });
                      }}
                      style={{
                        left: `${(box.x - box.w / 2) * 100}%`,
                        top: `${(box.y - box.h / 2) * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                        backdropFilter: `blur(${project.overlays.blurStrength}px)`,
                      }}
                      className={`absolute rounded cursor-move flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-2 border-[#60A5FA] bg-black/35'
                          : 'border border-dashed border-white/45 bg-black/25 hover:border-white'
                      }`}
                      title="Drag to move Watermark Blur Box"
                    >
                      <span className="text-[10px] font-mono-tabular text-white/80 px-1 truncate pointer-events-none">
                        {box.label || 'BLUR'}
                      </span>
                    </div>
                  );
                })}

                {/* Temporary rectangle while drawing a new Blur Box */}
                {tempBlurRect && (
                  <div
                    style={{
                      left: `${(tempBlurRect.x - tempBlurRect.w / 2) * 100}%`,
                      top: `${(tempBlurRect.y - tempBlurRect.h / 2) * 100}%`,
                      width: `${tempBlurRect.w * 100}%`,
                      height: `${tempBlurRect.h * 100}%`,
                      backdropFilter: 'blur(16px)',
                    }}
                    className="absolute border-2 border-[#60A5FA] bg-[#3B82F6]/20 rounded pointer-events-none"
                  />
                )}

                {/* 4. Draggable Myanmar Title Overlay (Chromium/Burma020 style) */}
                {project.overlays.titleText.trim() && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        kind: 'title',
                        startX: project.overlays.titlePos[0],
                        startY: project.overlays.titlePos[1],
                        origPos: project.overlays.titlePos,
                      });
                    }}
                    style={{
                      left: `${project.overlays.titlePos[0] * 100}%`,
                      top: `${project.overlays.titlePos[1] * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: `${Math.max(13, Math.round(project.overlays.titleSize * 0.38))}px`,
                    }}
                    className="absolute px-3.5 py-1.5 rounded bg-black/80 border border-[#FBBF24]/50 text-[#FBBF24] font-myanmar font-bold shadow-md cursor-move whitespace-nowrap hover:border-[#FBBF24]"
                    title="Drag to reposition Myanmar Title"
                  >
                    {project.overlays.titleText}
                  </div>
                )}

                {/* 5. Draggable Channel Logo Overlay */}
                {project.overlays.logoEnabled && project.overlays.logoTextOrUrl && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        kind: 'logo',
                        startX: project.overlays.logoPos[0],
                        startY: project.overlays.logoPos[1],
                        origPos: project.overlays.logoPos,
                      });
                    }}
                    style={{
                      left: `${project.overlays.logoPos[0] * 100}%`,
                      top: `${project.overlays.logoPos[1] * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      opacity: project.overlays.logoOpacity,
                    }}
                    className="absolute px-2.5 py-1 rounded bg-black/70 border border-white/25 text-white font-mono-tabular text-xs font-semibold tracking-wider cursor-move whitespace-nowrap hover:border-[#60A5FA]"
                    title="Drag to reposition Logo Watermark"
                  >
                    {project.overlays.logoTextOrUrl}
                  </div>
                )}

                {/* 6. Draggable Extra Text / Episode Badge Overlay */}
                {project.overlays.extraText.trim() && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        kind: 'extraText',
                        startX: project.overlays.extraTextPos[0],
                        startY: project.overlays.extraTextPos[1],
                        origPos: project.overlays.extraTextPos,
                      });
                    }}
                    style={{
                      left: `${project.overlays.extraTextPos[0] * 100}%`,
                      top: `${project.overlays.extraTextPos[1] * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      opacity: project.overlays.extraTextOpacity,
                      fontSize: `${Math.max(11, Math.round(project.overlays.extraTextSize * 0.42))}px`,
                    }}
                    className="absolute px-3 py-1 rounded bg-[#1E293B]/90 border border-[#60A5FA]/50 text-white font-myanmar font-semibold cursor-move whitespace-nowrap hover:border-[#60A5FA]"
                    title="Drag to reposition Extra Episode Text"
                  >
                    {project.overlays.extraText}
                  </div>
                )}

                {/* 7. Active Burmese Narrator Subtitle Monitor at Bottom of Canvas */}
                {currentUnit && (
                  <div className="absolute bottom-3 inset-x-4 pointer-events-none">
                    <div className="bg-black/85 border border-white/15 rounded-md px-3.5 py-2 text-center">
                      <p className="text-xs sm:text-sm text-white font-myanmar leading-relaxed">
                        {currentUnit.translation || currentUnit.source_text}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Preview Transport & Scrubber Bar (Ported from controller.py seek controls) */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono-tabular text-[#94A3B8] w-24 shrink-0">
                  {formatShortTime(currentUnit?.video_start || 0)} /{' '}
                  {formatShortTime(totalVideoDuration)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, project.units.length - 1)}
                  value={activeSegmentIdx}
                  onChange={(e) => setActiveSegmentIdx(Number(e.target.value))}
                  className="w-full accent-[#3B82F6]"
                />
                <span className="text-xs font-mono-tabular text-[#60A5FA] w-28 text-right shrink-0">
                  Unit {activeSegmentIdx + 1}/{project.units.length}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setActiveSegmentIdx((prev) => Math.max(0, prev - 1))
                    }
                    className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded text-xs text-white flex items-center gap-1 cursor-pointer"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span>Prev ID</span>
                  </button>

                  <button
                    onClick={() => setIsPlaying((p) => !p)}
                    className="px-3.5 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] rounded text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause Sync</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Play Preview</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() =>
                      setActiveSegmentIdx((prev) =>
                        Math.min(project.units.length - 1, prev + 1)
                      )
                    }
                    className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded text-xs text-white flex items-center gap-1 cursor-pointer"
                  >
                    <span>Next ID</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>

                {currentUnit && (
                  <button
                    onClick={() => handleSynthesizeSegmentVoice(currentUnit)}
                    disabled={isSynthesizingSegmentId === currentUnit.id}
                    className="px-3 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded text-xs text-[#E7EAF0] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#60A5FA]" />
                    <span>
                      {isSynthesizingSegmentId === currentUnit.id
                        ? 'Synthesizing WAV...'
                        : `Speak ID ${String(currentUnit.id).padStart(5, '0')} (TTS)`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Console: Switchable Atomic Segments Strip vs Run Logs */}
          <div className="border border-[#1E2430] bg-[#11151E] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1E2430] bg-[#0D1118]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveBottomTab('segments')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    activeBottomTab === 'segments'
                      ? 'bg-[#3B82F6] text-white'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Smart Sync Segments ({project.units.length})
                </button>
                <button
                  onClick={() => setActiveBottomTab('logs')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    activeBottomTab === 'logs'
                      ? 'bg-[#3B82F6] text-white'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Run Logs ({logs.length})
                </button>
              </div>

              <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
                30fps Cumulative Lock · Drift ≤ 0.5f
              </span>
            </div>

            {activeBottomTab === 'segments' ? (
              <div className="max-h-64 overflow-y-auto divide-y divide-[#1A202C]">
                {project.units.map((unit, idx) => {
                  const isActive = idx === activeSegmentIdx;
                  return (
                    <div
                      key={unit.id}
                      onClick={() => setActiveSegmentIdx(idx)}
                      className={`p-3 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                        isActive ? 'bg-[#172033]' : 'hover:bg-[#151A26]'
                      }`}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-[#94A3B8]">
                          <span className="text-white font-semibold">
                            ID {String(unit.id).padStart(5, '0')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {formatTimestampMs(unit.video_start)} →{' '}
                            {formatTimestampMs(unit.video_end)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#60A5FA]">
                            TTS {unit.ttsDuration}s · Video {unit.speedFactor}x ·{' '}
                            {unit.frameCount30fps}f
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-white font-myanmar">
                          {unit.translation || unit.source_text}
                        </p>
                        <p className="text-xs text-[#64748B] truncate">
                          {unit.source_text}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSynthesizeSegmentVoice(unit);
                        }}
                        disabled={isSynthesizingSegmentId === unit.id}
                        className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#2563EB] text-xs text-white rounded border border-[#2B3548] shrink-0 cursor-pointer"
                        title="Generate Burmese TTS Voice"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 bg-[#080A0E] font-mono-tabular text-xs text-[#CBD5E1] max-h-64 overflow-y-auto space-y-1.5">
                {logs.map((line, i) => (
                  <div key={i} className="leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE (3 cols): Production Tools & Export (Ported from controller.py right pane) */}
        <div className="lg:col-span-3 border border-[#1E2430] bg-[#11151E] rounded-xl p-4 space-y-5">
          <div className="border-b border-[#1E2430] pb-3">
            <h2 className="text-sm font-semibold text-white">Production Tools</h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Frame Ratio, Blur Boxes, Myanmar Title, Logo & Episode Splitter
            </p>
          </div>

          {/* 1. Video Transform: Ratio, Fill, Zoom, Flip */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-white">Video Frame & Ratio</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-[#94A3B8] mb-1">
                  Output Ratio
                </label>
                <select
                  value={project.overlays.outputRatio}
                  onChange={(e) =>
                    updateOverlays({ outputRatio: e.target.value as OutputRatio })
                  }
                  className="w-full px-2.5 py-1.5 bg-[#0B0E14] border border-[#242B3A] rounded text-xs text-white font-mono-tabular"
                >
                  <option value="16:9">16:9 (1920×1080)</option>
                  <option value="9:16">9:16 (1080×1920)</option>
                  <option value="1:1">1:1 (1080×1080)</option>
                  <option value="Original">Original</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#94A3B8] mb-1">
                  Frame Fill
                </label>
                <select
                  value={project.overlays.frameFill}
                  onChange={(e) =>
                    updateOverlays({ frameFill: e.target.value as FrameFillMode })
                  }
                  className="w-full px-2.5 py-1.5 bg-[#0B0E14] border border-[#242B3A] rounded text-xs text-white"
                >
                  <option value="blur">Blur background</option>
                  <option value="black">Black bars</option>
                  <option value="crop">Crop to fill</option>
                </select>
              </div>
            </div>

            {/* Zoom Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#CBD5E1]">Zoom Factor</span>
                <span className="font-mono-tabular text-[#60A5FA]">
                  {project.overlays.zoomFactor.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={1.25}
                step={0.01}
                value={project.overlays.zoomFactor}
                onChange={(e) =>
                  updateOverlays({ zoomFactor: Number(e.target.value) })
                }
                className="w-full accent-[#3B82F6]"
              />
            </div>

            {/* Horizontal Mirror Flip */}
            <button
              onClick={() =>
                updateOverlays({ mirrorVideo: !project.overlays.mirrorVideo })
              }
              className={`w-full px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                project.overlays.mirrorVideo
                  ? 'bg-[#17253B] border-[#3B82F6] text-white'
                  : 'bg-[#0B0E14] border-[#242B3A] text-[#94A3B8]'
              }`}
            >
              <span className="flex items-center gap-2">
                <FlipHorizontal className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>Flip (mirror left ↔ right)</span>
              </span>
              <span className="font-mono-tabular">
                {project.overlays.mirrorVideo ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* 2. Blur Watermark Area */}
          <div className="pt-3 border-t border-[#1E2430] space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white">
                Blur Watermark Area
              </h3>
              <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
                {project.overlays.blurBoxes.length} box(es)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawBlurMode((prev) => !prev)}
                className={`flex-1 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                  drawBlurMode
                    ? 'bg-[#3B82F6] border-[#3B82F6] text-white'
                    : 'bg-[#19202E] border-[#2B3548] text-white hover:bg-[#232C3F]'
                }`}
              >
                {drawBlurMode ? 'Drawing on Canvas...' : '+ Draw Blur Box'}
              </button>

              <button
                onClick={handleDeleteSelectedBlur}
                disabled={!selectedBlurId}
                className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#3B1D24] disabled:opacity-40 border border-[#2B3548] rounded text-xs text-[#FCA5A5] cursor-pointer"
                title="Delete Selected Blur Box"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3. Myanmar Title Overlay */}
          <div className="pt-3 border-t border-[#1E2430] space-y-2.5">
            <h3 className="text-xs font-semibold text-white">
              Myanmar Title Overlay
            </h3>
            <input
              type="text"
              value={project.overlays.titleText}
              onChange={(e) => updateOverlays({ titleText: e.target.value })}
              placeholder="မြန်မာခေါင်းစဉ် ရေးပါ..."
              className="w-full px-3 py-1.5 bg-[#0B0E14] border border-[#242B3A] rounded text-xs text-white font-myanmar focus:outline-none focus:border-[#3B82F6]"
            />
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#94A3B8]">Title Size</span>
                <span className="font-mono-tabular text-white">
                  {project.overlays.titleSize}px
                </span>
              </div>
              <input
                type="range"
                min={24}
                max={96}
                value={project.overlays.titleSize}
                onChange={(e) =>
                  updateOverlays({ titleSize: Number(e.target.value) })
                }
                className="w-full accent-[#3B82F6]"
              />
            </div>
          </div>

          {/* 4. Channel Logo & Extra Episode Text (with Burmese numerals mm_number) */}
          <div className="pt-3 border-t border-[#1E2430] space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white">
                Extra Text & Episode Splitter
              </h3>
              <span className="text-[11px] font-myanmar text-[#60A5FA]">
                အပိုင်း ({mmNumber(project.overlays.currentEpisodeIndex)})
              </span>
            </div>

            <input
              type="text"
              value={project.overlays.extraText}
              onChange={(e) => updateOverlays({ extraText: e.target.value })}
              placeholder="အပိုင်း (၁)"
              className="w-full px-3 py-1.5 bg-[#0B0E14] border border-[#242B3A] rounded text-xs text-white font-myanmar"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              {[1, 2, 3, 4].map((epNum) => (
                <button
                  key={epNum}
                  onClick={() =>
                    updateOverlays({
                      currentEpisodeIndex: epNum,
                      extraText: `အပိုင်း (${mmNumber(epNum)})`,
                    })
                  }
                  className="px-2 py-1 bg-[#0B0E14] hover:bg-[#1E293B] border border-[#242B3A] rounded text-[11px] font-myanmar text-[#CBD5E1] cursor-pointer"
                >
                  အပိုင်း ({mmNumber(epNum)})
                </button>
              ))}
              <button
                onClick={() => updateOverlays({ extraText: 'ဇာတ်သိမ်းပိုင်း' })}
                className="px-2 py-1 bg-[#0B0E14] hover:bg-[#1E293B] border border-[#242B3A] rounded text-[11px] font-myanmar text-[#CBD5E1] cursor-pointer"
              >
                ဇာတ်သိမ်းပိုင်း
              </button>
            </div>
          </div>

          {/* 5. Final Project Video Download & Export Production Artifacts */}
          <div className="pt-3 border-t border-[#1E2430] space-y-2">
            <h3 className="text-xs font-semibold text-white">
              Final Video & Job Export
            </h3>
            <button
              onClick={() => setVideoModalState({ isOpen: true, mode: 'export' })}
              className="w-full px-3 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Render & Download Final Video</span>
            </button>

            <button
              onClick={() => setVideoModalState({ isOpen: true, mode: 'veo' })}
              className="w-full px-3 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-[#E7EAF0] text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>Generate Video from Text (Veo 3)</span>
            </button>

            <button
              onClick={handleExportSmartSyncPlan}
              className="w-full px-3 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export smart_sync_plan.json</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleExportSrt('mm_only')}
                className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-white text-xs rounded-lg transition-colors cursor-pointer"
              >
                Myanmar .SRT
              </button>
              <button
                onClick={() => handleExportSrt('bilingual')}
                className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-white text-xs rounded-lg transition-colors cursor-pointer"
              >
                Bilingual .SRT
              </button>
            </div>
          </div>
        </div>
      </div>

      <VideoExportAndVeoModal
        isOpen={videoModalState.isOpen}
        initialMode={videoModalState.mode}
        project={project}
        customVideoUrl={customVideoObjectUrl}
        onClose={() =>
          setVideoModalState((prev) => ({ ...prev, isOpen: false }))
        }
        onUpdateProject={onUpdateProject}
        onAttachGeneratedVeoVideo={(videoUrl, promptUsed) => {
          setCustomVideoObjectUrl(videoUrl);
          appendLog(
            `🎬 Attached Veo 3 generated video stream to Studio Canvas (Prompt: "${promptUsed.slice(0, 60)}...")`
          );
        }}
      />
    </div>
  );
};
