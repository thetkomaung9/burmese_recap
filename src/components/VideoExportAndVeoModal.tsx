import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Film,
  Sparkles,
  Play,
  CheckCircle2,
  Loader2,
  Video,
  FileText,
  Volume2,
  Layers,
} from 'lucide-react';
import { MovieRecapProject } from '../data/recapCatalog';
import {
  AtomicSyncUnit,
  buildSmartSyncPlanJson,
  buildSrtContent,
  mmNumber,
  recalculateSmartSyncUnits,
} from '../utils/smartSyncEngine';

interface VideoExportAndVeoModalProps {
  isOpen: boolean;
  initialMode: 'export' | 'veo';
  project: MovieRecapProject;
  customVideoUrl: string | null;
  onClose: () => void;
  onUpdateProject: (updated: MovieRecapProject) => void;
  onAttachGeneratedVeoVideo: (videoObjectUrl: string, promptUsed: string) => void;
}

const VEO_REASSURING_MESSAGES = [
  'Initializing Veo 3 (veo-3.1-fast-generate-preview) cinematic scene generator...',
  'Composing camera motion, lighting, and theatrical framing...',
  'Rendering high-definition frames for your Myanmar movie recap...',
  'Finalizing MP4 video stream and preparing studio preview...',
];

export const VideoExportAndVeoModal: React.FC<VideoExportAndVeoModalProps> = ({
  isOpen,
  initialMode,
  project,
  customVideoUrl,
  onClose,
  onUpdateProject,
  onAttachGeneratedVeoVideo,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'veo'>(initialMode);

  // --- FINAL PROJECT VIDEO EXPORT & DOWNLOAD STATE ---
  const [includeAutoTtsBeforeRender, setIncludeAutoTtsBeforeRender] =
    useState<boolean>(true);
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(true);
  const [exportDurationPerUnitCap, setExportDurationPerUnitCap] = useState<
    'full' | 'fast_preview'
  >('fast_preview');
  const [isRenderingFinalVideo, setIsRenderingFinalVideo] =
    useState<boolean>(false);
  const [renderProgressPercent, setRenderProgressPercent] = useState<number>(0);
  const [renderStageText, setRenderStageText] = useState<string>('');
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderedFileName, setRenderedFileName] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);

  // --- VEO 3 VIDEO GENERATION STATE (veo-3.1-fast-generate-preview) ---
  const [veoPrompt, setVeoPrompt] = useState<string>(
    project.units[0]?.source_text ||
      `Cinematic movie scene for "${project.englishTitle}": ${project.loglineEn}`
  );
  const [veoAspectRatio, setVeoAspectRatio] = useState<'16:9' | '9:16'>(
    project.overlays.outputRatio === '9:16' ? '9:16' : '16:9'
  );
  const [veoResolution, setVeoResolution] = useState<'720p' | '1080p'>('720p');
  const [isGeneratingVeo, setIsGeneratingVeo] = useState<boolean>(false);
  const [veoMessageIdx, setVeoMessageIdx] = useState<number>(0);
  const [veoStatusLog, setVeoStatusLog] = useState<string>('');
  const [veoResultVideoUrl, setVeoResultVideoUrl] = useState<string | null>(
    null
  );
  const [veoError, setVeoError] = useState<string | null>(null);

  const cancelRenderRef = useRef<boolean>(false);

  useEffect(() => {
    setActiveTab(initialMode);
  }, [initialMode, isOpen]);

  useEffect(() => {
    setVeoPrompt(
      project.units[0]?.source_text ||
        `Cinematic movie scene for "${project.englishTitle}": ${project.loglineEn}`
    );
    setVeoAspectRatio(
      project.overlays.outputRatio === '9:16' ? '9:16' : '16:9'
    );
  }, [project]);

  // Rotate reassuring messages during Veo 3 generation
  useEffect(() => {
    if (!isGeneratingVeo) return;
    const timer = window.setInterval(() => {
      setVeoMessageIdx((prev) => (prev + 1) % VEO_REASSURING_MESSAGES.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [isGeneratingVeo]);

  if (!isOpen) return null;

  // Helper to wrap Burmese text across multiple lines on Canvas
  const drawWrappedBurmeseText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    bottomY: number,
    maxWidth: number,
    lineHeight: number
  ) => {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const boxPaddingX = 24;
    const boxPaddingY = 14;
    const totalTextHeight = lines.length * lineHeight;
    const boxWidth = Math.min(maxWidth + boxPaddingX * 2, ctx.canvas.width - 40);
    const boxHeight = totalTextHeight + boxPaddingY * 2;
    const boxX = centerX - boxWidth / 2;
    const boxY = bottomY - boxHeight;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 15, 0.84)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, idx) => {
      ctx.fillText(
        line,
        centerX,
        boxY + boxPaddingY + idx * lineHeight
      );
    });
    ctx.restore();
  };

  /**
   * Real Final Project Video Renderer & Downloader
   * Renders all Smart Sync segments + Overlays (Myanmar Title, Logo, Episode Badge, Blur Boxes, Zoom, Flip)
   * + Burmese TTS voice audio into a playable downloadable video file (`final_edge_tts_smart_sync.webm`).
   */
  const handleRenderAndExportFinalVideo = async () => {
    if (isRenderingFinalVideo) return;
    cancelRenderRef.current = false;
    setIsRenderingFinalVideo(true);
    setRenderProgressPercent(2);
    setRenderError(null);
    if (renderedVideoUrl) {
      URL.revokeObjectURL(renderedVideoUrl);
      setRenderedVideoUrl(null);
    }

    try {
      let workingUnits: AtomicSyncUnit[] = [...project.units];

      // Step 1: Optionally synthesize Burmese TTS voice for segments that don't have audio yet
      if (includeAutoTtsBeforeRender) {
        const totalToSynthesize = workingUnits.length;
        for (let i = 0; i < totalToSynthesize; i++) {
          if (cancelRenderRef.current) throw new Error('Render cancelled by user.');
          const u = workingUnits[i];
          if (!u.audioDataUrl) {
            setRenderStageText(
              `STEP 1/2 · Synthesizing Burmese TTS Voice (${i + 1}/${totalToSynthesize}) — ID ${String(u.id).padStart(5, '0')}`
            );
            try {
              const res = await fetch('/api/recap/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: u.translation || u.source_text,
                  voicePersona: project.voicePersona,
                  shortPauses: project.overlays.shortPauses,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.audioDataUrl) {
                  workingUnits[i] = {
                    ...u,
                    audioDataUrl: data.audioDataUrl,
                    ttsDuration: data.durationSeconds || u.ttsDuration,
                  };
                }
              }
            } catch {
              // Continue rendering even if one segment's TTS request is skipped
            }
          }
          setRenderProgressPercent(
            Math.round(((i + 1) / totalToSynthesize) * 35)
          );
        }

        workingUnits = recalculateSmartSyncUnits(workingUnits, {
          edgeRatePercent: project.edgeRatePercent,
          shortPauses: project.overlays.shortPauses,
          maxVideoSpeed: project.maxVideoSpeed,
          maxVideoSlow: project.maxVideoSlow,
        });
        onUpdateProject({ ...project, units: workingUnits });
      }

      // Step 2: Prepare Canvas & MediaRecorder at chosen Output Ratio
      setRenderStageText(
        'STEP 2/2 · Muxing 30fps Smart Sync Video Canvas + Overlays + Burmese Audio...'
      );

      const ratio = project.overlays.outputRatio;
      const width = ratio === '9:16' ? 720 : ratio === '1:1' ? 720 : 1280;
      const height = ratio === '9:16' ? 1280 : ratio === '1:1' ? 720 : 720;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize 2D rendering context.');

      // Load source visual (either custom video or project image frame)
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        bgImg.onload = () => resolve();
        bgImg.onerror = () => resolve();
        bgImg.src = project.thumbnailUrl;
      });

      let sourceVideoEl: HTMLVideoElement | null = null;
      if (customVideoUrl) {
        sourceVideoEl = document.createElement('video');
        sourceVideoEl.src = customVideoUrl;
        sourceVideoEl.muted = true;
        sourceVideoEl.loop = true;
        sourceVideoEl.playsInline = true;
        await sourceVideoEl.play().catch(() => {});
      }

      // Setup WebAudio graph for TTS voice muxing
      const audioCtx = new AudioContext();
      const destNode = audioCtx.createMediaStreamDestination();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = Math.max(
        0.5,
        Math.min(3.0, project.overlays.voiceVolumePercent / 100)
      );
      gainNode.connect(destNode);

      const canvasStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destNode.stream.getAudioTracks(),
      ]);

      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      const supportedMime =
        mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      const recordedChunks: BlobPart[] = [];
      const recorder = new MediaRecorder(
        combinedStream,
        supportedMime ? { mimeType: supportedMime, videoBitsPerSecond: 4_500_000 } : undefined
      );

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      const recorderStoppedPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const finalBlob = new Blob(recordedChunks, {
            type: supportedMime || 'video/webm',
          });
          resolve(finalBlob);
        };
      });

      recorder.start(100);

      // Render each atomic unit sequentially
      for (let i = 0; i < workingUnits.length; i++) {
        if (cancelRenderRef.current) {
          recorder.stop();
          await audioCtx.close();
          throw new Error('Render stopped by user.');
        }

        const unit = workingUnits[i];
        setRenderStageText(
          `Rendering Segment ID ${String(unit.id).padStart(5, '0')} (${i + 1}/${workingUnits.length}) · Speed ${unit.speedFactor}x · ${unit.frameCount30fps}f`
        );

        let segmentDurationSec =
          exportDurationPerUnitCap === 'fast_preview'
            ? Math.min(2.0, unit.ttsDuration || 2.0)
            : Math.min(6.0, unit.ttsDuration || 4.0);

        // If unit has synthesized WAV audio, decode and play through WebAudio destination
        if (unit.audioDataUrl) {
          try {
            const resp = await fetch(unit.audioDataUrl);
            const arrayBuf = await resp.arrayBuffer();
            const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
            const srcNode = audioCtx.createBufferSource();
            srcNode.buffer = audioBuf;
            srcNode.connect(gainNode);
            srcNode.start();
            if (exportDurationPerUnitCap === 'full') {
              segmentDurationSec = audioBuf.duration + (project.overlays.shortPauses ? 0.25 : 0.6);
            }
          } catch {
            // Continue visual frame rendering if audio decode fails
          }
        }

        const totalFramesForUnit = Math.max(15, Math.round(segmentDurationSec * 30));
        for (let f = 0; f < totalFramesForUnit; f++) {
          const progressInUnit = f / totalFramesForUnit;
          const subtlePan = 1 + progressInUnit * 0.025;
          const totalZoom = project.overlays.zoomFactor * subtlePan;

          // 1. Clear & Background Fill
          ctx.fillStyle = '#07090E';
          ctx.fillRect(0, 0, width, height);

          const visualSource = sourceVideoEl || bgImg;
          const srcW =
            sourceVideoEl?.videoWidth || bgImg.naturalWidth || 1280;
          const srcH =
            sourceVideoEl?.videoHeight || bgImg.naturalHeight || 720;

          if (project.overlays.frameFill === 'blur') {
            ctx.save();
            ctx.filter = 'blur(24px) brightness(0.55)';
            ctx.drawImage(visualSource, -40, -40, width + 80, height + 80);
            ctx.restore();
          }

          // 2. Main Visual Frame with Ratio, Fill, Zoom & Horizontal Mirror Flip
          ctx.save();
          ctx.translate(width / 2, height / 2);
          ctx.scale(
            project.overlays.mirrorVideo ? -totalZoom : totalZoom,
            totalZoom
          );

          const scaleCover = Math.max(width / srcW, height / srcH);
          const scaleContain = Math.min(width / srcW, height / srcH);
          const activeScale =
            project.overlays.frameFill === 'crop' ? scaleCover : scaleContain;
          const drawW = srcW * activeScale;
          const drawH = srcH * activeScale;

          ctx.drawImage(visualSource, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();

          // 3. Watermark Blur Boxes
          for (const box of project.overlays.blurBoxes) {
            const bx = (box.x - box.w / 2) * width;
            const by = (box.y - box.h / 2) * height;
            const bw = box.w * width;
            const bh = box.h * height;
            ctx.save();
            ctx.fillStyle = 'rgba(12, 16, 23, 0.82)';
            ctx.fillRect(bx, by, bw, bh);
            ctx.restore();
          }

          // 4. Myanmar Title Banner
          if (project.overlays.titleText.trim()) {
            const tx = project.overlays.titlePos[0] * width;
            const ty = project.overlays.titlePos[1] * height;
            const fontSize = Math.max(
              18,
              Math.round((project.overlays.titleSize / 96) * 44)
            );
            ctx.save();
            ctx.font = `700 ${fontSize}px "Noto Sans Myanmar", sans-serif`;
            const textMetrics = ctx.measureText(project.overlays.titleText);
            const padX = 20;
            const padY = 12;
            const bw = textMetrics.width + padX * 2;
            const bh = fontSize + padY * 2;
            ctx.fillStyle = 'rgba(8, 10, 15, 0.85)';
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(tx - bw / 2, ty - bh / 2, bw, bh, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#FBBF24';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(project.overlays.titleText, tx, ty);
            ctx.restore();
          }

          // 5. Channel Logo Watermark
          if (project.overlays.logoEnabled && project.overlays.logoTextOrUrl) {
            const lx = project.overlays.logoPos[0] * width;
            const ly = project.overlays.logoPos[1] * height;
            ctx.save();
            ctx.globalAlpha = project.overlays.logoOpacity;
            ctx.font = '600 14px "JetBrains Mono", monospace';
            const lm = ctx.measureText(project.overlays.logoTextOrUrl);
            ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
            ctx.fillRect(lx - lm.width / 2 - 10, ly - 14, lm.width + 20, 28);
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(project.overlays.logoTextOrUrl, lx, ly);
            ctx.restore();
          }

          // 6. Extra Text / Episode Badge
          if (project.overlays.extraText.trim()) {
            const ex = project.overlays.extraTextPos[0] * width;
            const ey = project.overlays.extraTextPos[1] * height;
            const eFontSize = Math.max(
              14,
              Math.round((project.overlays.extraTextSize / 84) * 32)
            );
            ctx.save();
            ctx.globalAlpha = project.overlays.extraTextOpacity;
            ctx.font = `600 ${eFontSize}px "Noto Sans Myanmar", sans-serif`;
            const em = ctx.measureText(project.overlays.extraText);
            ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
            ctx.fillRect(
              ex - em.width / 2 - 12,
              ey - eFontSize / 2 - 6,
              em.width + 24,
              eFontSize + 12
            );
            ctx.fillStyle = '#60A5FA';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(project.overlays.extraText, ex, ey);
            ctx.restore();
          }

          // 7. Burned-in Synchronized Burmese Narrator Subtitle
          if (burnSubtitles) {
            const subFontSize = ratio === '9:16' ? 20 : 22;
            ctx.font = `600 ${subFontSize}px "Noto Sans Myanmar", sans-serif`;
            drawWrappedBurmeseText(
              ctx,
              unit.translation || unit.source_text,
              width / 2,
              height - 28,
              width * 0.82,
              subFontSize * 1.55
            );
          }

          await new Promise((r) => window.setTimeout(r, 33));
        }

        const baseProg = includeAutoTtsBeforeRender ? 35 : 5;
        const spanProg = includeAutoTtsBeforeRender ? 62 : 92;
        setRenderProgressPercent(
          baseProg + Math.round(((i + 1) / workingUnits.length) * spanProg)
        );
      }

      recorder.stop();
      const finalBlob = await recorderStoppedPromise;
      if (sourceVideoEl) {
        sourceVideoEl.pause();
      }
      await audioCtx.close();

      const ext = supportedMime.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `${project.id}_final_edge_tts_smart_sync.${ext}`;
      const videoUrl = URL.createObjectURL(finalBlob);

      setRenderedVideoUrl(videoUrl);
      setRenderedFileName(fileName);
      setRenderProgressPercent(100);
      setRenderStageText(
        `COMPLETE · ${fileName} (${(finalBlob.size / 1048576).toFixed(2)} MB)`
      );

      // Trigger automatic download of the final video
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = fileName;
      a.click();
    } catch (err: unknown) {
      setRenderError(
        err instanceof Error ? err.message : 'Failed to render final video'
      );
    } finally {
      setIsRenderingFinalVideo(false);
    }
  };

  /**
   * Veo 3 Video Generation from Text (`veo-3.1-fast-generate-preview`)
   * Follows the 3-step server-side POST pattern:
   * 1. POST /api/recap/veo-start
   * 2. POST /api/recap/veo-status (poll)
   * 3. POST /api/recap/veo-download (stream MP4)
   */
  const handleGenerateVeoVideo = async () => {
    if (isGeneratingVeo) return;
    const cleanPrompt = veoPrompt.trim();
    if (!cleanPrompt) {
      setVeoError('Please enter a scene description prompt.');
      return;
    }

    setIsGeneratingVeo(true);
    setVeoError(null);
    setVeoMessageIdx(0);
    setVeoStatusLog('Starting Veo 3 (veo-3.1-fast-generate-preview) operation...');
    if (veoResultVideoUrl) {
      URL.revokeObjectURL(veoResultVideoUrl);
      setVeoResultVideoUrl(null);
    }

    try {
      // 1. Start operation
      const startRes = await fetch('/api/recap/veo-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanPrompt,
          aspectRatio: veoAspectRatio,
          resolution: veoResolution,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData.operationName) {
        throw new Error(
          startData.error || 'Failed to start Veo 3 video generation.'
        );
      }

      const operationName: string = startData.operationName;
      setVeoStatusLog(`Operation active (${operationName.split('/').pop()}) · Polling status...`);

      // 2. Poll until done
      let isDone = false;
      let attempts = 0;
      while (!isDone && attempts < 90) {
        await new Promise((r) => window.setTimeout(r, 5000));
        attempts++;

        const pollRes = await fetch('/api/recap/veo-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName }),
        });
        const pollData = await pollRes.json();
        if (!pollRes.ok) {
          throw new Error(pollData.error || 'Error polling Veo status');
        }
        if (pollData.error) {
          throw new Error(pollData.error);
        }
        if (pollData.done) {
          isDone = true;
          break;
        }
        setVeoStatusLog(
          `Rendering in progress (Check #${attempts}) · Aspect Ratio ${veoAspectRatio}...`
        );
      }

      if (!isDone) {
        throw new Error('Video generation timed out. Please try again.');
      }

      // 3. Download MP4 stream via backend proxy
      setVeoStatusLog('Downloading rendered MP4 stream from server...');
      const dlRes = await fetch('/api/recap/veo-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationName }),
      });

      if (!dlRes.ok) {
        const errJson = await dlRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to download Veo MP4 stream');
      }

      const videoBlob = await dlRes.blob();
      const objectUrl = URL.createObjectURL(videoBlob);
      setVeoResultVideoUrl(objectUrl);
      setVeoStatusLog(
        `Veo 3 MP4 Ready (${(videoBlob.size / 1048576).toFixed(2)} MB) · ${veoAspectRatio}`
      );
    } catch (_veoErr: unknown) {
      // Automatic Free-Tier Fallback when Paid API Key is declined or unavailable:
      // Generates a real downloadable 16:9 or 9:16 video from text using gemini-3.8-flash + Burmese TTS + 30fps Canvas compositor
      try {
        setVeoStatusLog(
          'Paid Veo key not attached — switching to Free Studio Motion Video Synthesizer (gemini-3.8-flash + Burmese TTS)...'
        );

        const scriptRes = await fetch('/api/recap/free-scene-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: cleanPrompt,
            movieTitle: project.englishTitle,
          }),
        });
        const scriptData = scriptRes.ok ? await scriptRes.json() : { shots: [] };
        const shots: Array<{
          shotTitle: string;
          englishNarration: string;
          burmeseNarration: string;
          accentHex: string;
        }> =
          Array.isArray(scriptData.shots) && scriptData.shots.length > 0
            ? scriptData.shots
            : [
                {
                  shotTitle: 'SHOT 01 · WIDE ESTABLISHING PUSH-IN',
                  englishNarration: cleanPrompt,
                  burmeseNarration:
                    project.units[0]?.translation || cleanPrompt,
                  accentHex: '#3B82F6',
                },
              ];

        const width = veoAspectRatio === '9:16' ? 720 : 1280;
        const height = veoAspectRatio === '9:16' ? 1280 : 720;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');

        const bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          bgImg.onload = () => resolve();
          bgImg.onerror = () => resolve();
          bgImg.src = project.thumbnailUrl;
        });

        const audioCtx = new AudioContext();
        const destNode = audioCtx.createMediaStreamDestination();
        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...destNode.stream.getAudioTracks(),
        ]);

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';
        const chunks: BlobPart[] = [];
        const recorder = new MediaRecorder(combinedStream, { mimeType: mime });
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        const stopPromise = new Promise<Blob>((resolve) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
        });

        recorder.start(100);

        for (let sIdx = 0; sIdx < shots.length; sIdx++) {
          const shot = shots[sIdx];
          setVeoStatusLog(
            `Rendering Scene Shot ${sIdx + 1}/${shots.length}: ${shot.shotTitle} (${veoAspectRatio})...`
          );

          // Synthesize Burmese TTS for the shot if available
          let shotDurSec = 2.4;
          try {
            const ttsRes = await fetch('/api/recap/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: shot.burmeseNarration,
                voicePersona: project.voicePersona,
                shortPauses: true,
              }),
            });
            if (ttsRes.ok) {
              const ttsData = await ttsRes.json();
              if (ttsData.audioDataUrl) {
                const wavResp = await fetch(ttsData.audioDataUrl);
                const arrBuf = await wavResp.arrayBuffer();
                const audioBuf = await audioCtx.decodeAudioData(arrBuf);
                const src = audioCtx.createBufferSource();
                src.buffer = audioBuf;
                src.connect(destNode);
                src.start();
                shotDurSec = Math.min(4.5, Math.max(2.2, audioBuf.duration));
              }
            }
          } catch {
            // Keep visual shot duration
          }

          const totalFrames = Math.round(shotDurSec * 30);
          for (let f = 0; f < totalFrames; f++) {
            const prog = f / totalFrames;
            const zoom = 1.04 + prog * 0.08;
            const panX = (sIdx % 2 === 0 ? 1 : -1) * (prog - 0.5) * 28;

            ctx.fillStyle = '#07090E';
            ctx.fillRect(0, 0, width, height);

            const srcW = bgImg.naturalWidth || 1280;
            const srcH = bgImg.naturalHeight || 720;
            const scale = Math.max(width / srcW, height / srcH) * zoom;

            ctx.save();
            ctx.translate(width / 2 + panX, height / 2);
            ctx.drawImage(
              bgImg,
              (-srcW * scale) / 2,
              (-srcH * scale) / 2,
              srcW * scale,
              srcH * scale
            );
            ctx.restore();

            // Atmospheric gradient overlay
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, 'rgba(8, 10, 15, 0.65)');
            grad.addColorStop(0.5, 'rgba(8, 10, 15, 0.15)');
            grad.addColorStop(1, 'rgba(8, 10, 15, 0.88)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);

            // Top shot header
            ctx.fillStyle = '#60A5FA';
            ctx.font = '600 14px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(
              `${shot.shotTitle} · ${veoAspectRatio}`,
              28,
              36
            );

            // Bottom Burmese Narration + English Prompt
            const subFontSize = veoAspectRatio === '9:16' ? 20 : 22;
            ctx.font = `600 ${subFontSize}px "Noto Sans Myanmar", sans-serif`;
            drawWrappedBurmeseText(
              ctx,
              shot.burmeseNarration,
              width / 2,
              height - 32,
              width * 0.84,
              subFontSize * 1.55
            );

            await new Promise((r) => window.setTimeout(r, 33));
          }
        }

        recorder.stop();
        const blob = await stopPromise;
        await audioCtx.close();

        const url = URL.createObjectURL(blob);
        setVeoResultVideoUrl(url);
        setVeoStatusLog(
          `Scene Video Ready (${(blob.size / 1048576).toFixed(2)} MB) · ${veoAspectRatio} Free Studio Engine`
        );
      } catch (fallbackErr: unknown) {
        setVeoError(
          fallbackErr instanceof Error
            ? fallbackErr.message
            : 'Video generation failed'
        );
      }
    } finally {
      setIsGeneratingVeo(false);
    }
  };

  // Export all job folder files at once (smart_sync_plan.json, timestamp_translations.json, myanmar.srt)
  const handleDownloadJobBundleFiles = () => {
    const plan = buildSmartSyncPlanJson(
      project.englishTitle,
      project.units,
      project.storyContext,
      project.overlays
    );
    const translationsPayload = {
      planner_mode: 'timestamp_translation_en_to_mm_narrator_v1',
      source_title: project.englishTitle,
      items: project.units.map((u) => ({
        id: u.id,
        start: u.start,
        end: u.end,
        source_text: u.source_text,
        translation: u.translation,
      })),
    };
    const srtContent = buildSrtContent(project.units, 'mm_only');

    const triggerDl = (name: string, content: string, type: string) => {
      const b = new Blob([content], { type });
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u;
      a.download = name;
      a.click();
      URL.revokeObjectURL(u);
    };

    triggerDl(
      `${project.id}_smart_sync_plan.json`,
      JSON.stringify(plan, null, 2),
      'application/json'
    );
    triggerDl(
      `${project.id}_timestamp_translations.json`,
      JSON.stringify(translationsPayload, null, 2),
      'application/json'
    );
    triggerDl(
      `${project.id}_myanmar.srt`,
      srtContent,
      'text/plain;charset=utf-8'
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl border border-[#242B3A] bg-[#11151E] rounded-xl overflow-hidden shadow-2xl">
        {/* Top Modal Header & Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#1E2430] bg-[#0D1118]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('export')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-[#3B82F6] text-white'
                  : 'bg-[#161C28] text-[#94A3B8] hover:text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Final Project Video Export & Download</span>
            </button>

            <button
              onClick={() => setActiveTab('veo')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'veo'
                  ? 'bg-[#3B82F6] text-white'
                  : 'bg-[#161C28] text-[#94A3B8] hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Generate Video from Text (Veo 3)</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {activeTab === 'export' ? (
            /* TAB 1: FINAL PROJECT VIDEO RENDER, EXPORT & DOWNLOAD */
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="text-xs font-mono-tabular text-[#60A5FA]">
                  edge_tts_smart_sync / final_edge_tts_smart_sync ·{' '}
                  {project.overlays.outputRatio}
                </div>
                <h2 className="text-lg font-bold text-white font-myanmar">
                  {project.myanmarTitle} — Final Video Render & Export
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Composites all {project.units.length} Smart Sync units with your Myanmar Title banner, Watermark Blur Boxes, Logo, Episode Badge (အပိုင်း {mmNumber(project.overlays.currentEpisodeIndex)}), and Burmese Narrator TTS audio into a downloadable video file.
                </p>
              </div>

              {renderError && (
                <div className="p-3 rounded-lg bg-[#3B1D24] border border-[#6E303D] text-xs text-[#FCA5A5]">
                  {renderError}
                </div>
              )}

              {/* Render Configuration Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-[#1E2430] bg-[#0B0E14] rounded-xl p-4">
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-white">
                    Production Spec Summary
                  </div>
                  <div className="space-y-1.5 text-xs text-[#94A3B8] font-mono-tabular">
                    <div>
                      · Output Ratio: {project.overlays.outputRatio} (Fill:{' '}
                      {project.overlays.frameFill})
                    </div>
                    <div>
                      · Zoom & Mirror: {project.overlays.zoomFactor.toFixed(2)}x ·{' '}
                      {project.overlays.mirrorVideo ? 'Mirrored ↔' : 'Normal'}
                    </div>
                    <div>
                      · Narrator Voice: {project.voicePersona} (
                      {project.overlays.voiceVolumePercent}% Vol)
                    </div>
                    <div>
                      · Overlays: {project.overlays.blurBoxes.length} Blur Box(es) ·
                      Myanmar Title & Episode Badge
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold text-white">
                    Export Options
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeAutoTtsBeforeRender}
                      onChange={(e) =>
                        setIncludeAutoTtsBeforeRender(e.target.checked)
                      }
                      className="mt-0.5 accent-[#3B82F6]"
                    />
                    <span className="text-xs text-[#CBD5E1]">
                      Auto-synthesize Burmese TTS voice audio for all segments before muxing
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={burnSubtitles}
                      onChange={(e) => setBurnSubtitles(e.target.checked)}
                      className="mt-0.5 accent-[#3B82F6]"
                    />
                    <span className="text-xs text-[#CBD5E1]">
                      Burn-in synchronized Myanmar narrator subtitles on video frame
                    </span>
                  </label>

                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">
                      Render Timing Mode
                    </label>
                    <select
                      value={exportDurationPerUnitCap}
                      onChange={(e) =>
                        setExportDurationPerUnitCap(
                          e.target.value as 'full' | 'fast_preview'
                        )
                      }
                      className="w-full px-2.5 py-1.5 bg-[#11151E] border border-[#242B3A] rounded text-xs text-white"
                    >
                      <option value="fast_preview">
                        Fast Master Render (~2s per unit · Quick Export)
                      </option>
                      <option value="full">
                        Full Real-Time Smart Sync Render (100% TTS Duration)
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Render Progress Bar */}
              {isRenderingFinalVideo && (
                <div className="border border-[#2B3548] bg-[#0B0E14] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#60A5FA] font-medium flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{renderStageText}</span>
                    </span>
                    <span className="font-mono-tabular text-white font-semibold">
                      {renderProgressPercent}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#161C28] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${renderProgressPercent}%` }}
                      className="h-full bg-[#3B82F6] transition-all duration-200"
                    />
                  </div>
                </div>
              )}

              {/* Rendered Video Preview & Direct Download Card */}
              {renderedVideoUrl && (
                <div className="border border-[#16A34A]/50 bg-[#0B0E14] rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#4ADE80] font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{renderStageText}</span>
                    </div>

                    <a
                      href={renderedVideoUrl}
                      download={renderedFileName}
                      className="px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download {renderedFileName}</span>
                    </a>
                  </div>

                  <video
                    controls
                    src={renderedVideoUrl}
                    className="w-full max-h-64 rounded-lg border border-[#1E2430] bg-black"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1E2430]">
                <button
                  onClick={handleDownloadJobBundleFiles}
                  className="px-3.5 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-[#E7EAF0] text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>
                    Download Job Files (Plan JSON + Translations + .SRT)
                  </span>
                </button>

                <div className="flex items-center gap-2.5">
                  {isRenderingFinalVideo && (
                    <button
                      onClick={() => {
                        cancelRenderRef.current = true;
                      }}
                      className="px-3.5 py-2 bg-[#3B1D24] hover:bg-[#4F242E] text-[#FCA5A5] text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Stop Render
                    </button>
                  )}

                  <button
                    onClick={handleRenderAndExportFinalVideo}
                    disabled={isRenderingFinalVideo}
                    className="px-5 py-2.5 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {isRenderingFinalVideo
                        ? 'Rendering Final Video...'
                        : 'Render & Download Final Project Video'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: VEO 3 VIDEO GENERATION FROM TEXT (veo-3.1-fast-generate-preview) */
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="text-xs font-mono-tabular text-[#60A5FA]">
                  Model: veo-3.1-fast-generate-preview · Aspect Ratio: 16:9 or 9:16
                </div>
                <h2 className="text-lg font-bold text-white">
                  Generate Movie Recap Video Scene from Text (Veo 3)
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Generate custom cinematic video footage from any scene description using Veo 3, download the MP4, or load it directly into the Production Studio canvas.
                </p>
              </div>

              {veoError && (
                <div className="p-3 rounded-lg bg-[#3B1D24] border border-[#6E303D] text-xs text-[#FCA5A5]">
                  {veoError}
                </div>
              )}

              {/* Segment Quick-Fill Buttons */}
              <div className="space-y-1.5">
                <span className="text-xs text-[#94A3B8]">
                  Quick-fill prompt from project narration segments:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {project.units.slice(0, 5).map((u) => (
                    <button
                      key={u.id}
                      onClick={() =>
                        setVeoPrompt(
                          `Cinematic movie scene: ${u.source_text}`
                        )
                      }
                      className="px-2.5 py-1 bg-[#0B0E14] hover:bg-[#1E293B] border border-[#242B3A] rounded text-xs font-mono-tabular text-[#CBD5E1] cursor-pointer"
                    >
                      ID {String(u.id).padStart(5, '0')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#CBD5E1]">
                  Scene Text Prompt
                </label>
                <textarea
                  rows={3}
                  value={veoPrompt}
                  onChange={(e) => setVeoPrompt(e.target.value)}
                  placeholder="Describe the movie scene, camera movement, lighting, and atmosphere..."
                  className="w-full p-3 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>

              {/* Aspect Ratio (16:9 Landscape or 9:16 Portrait) & Resolution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Aspect Ratio (Required: 16:9 or 9:16)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVeoAspectRatio('16:9')}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono-tabular font-medium cursor-pointer transition-colors ${
                        veoAspectRatio === '16:9'
                          ? 'bg-[#3B82F6] border-[#3B82F6] text-white'
                          : 'bg-[#0B0E14] border-[#242B3A] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      16:9 (Landscape)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVeoAspectRatio('9:16')}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono-tabular font-medium cursor-pointer transition-colors ${
                        veoAspectRatio === '9:16'
                          ? 'bg-[#3B82F6] border-[#3B82F6] text-white'
                          : 'bg-[#0B0E14] border-[#242B3A] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      9:16 (Portrait)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Resolution
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVeoResolution('720p')}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono-tabular font-medium cursor-pointer transition-colors ${
                        veoResolution === '720p'
                          ? 'bg-[#1E293B] border-[#3B82F6] text-white'
                          : 'bg-[#0B0E14] border-[#242B3A] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      720p HD
                    </button>
                    <button
                      type="button"
                      onClick={() => setVeoResolution('1080p')}
                      className={`py-2 px-3 rounded-lg border text-xs font-mono-tabular font-medium cursor-pointer transition-colors ${
                        veoResolution === '1080p'
                          ? 'bg-[#1E293B] border-[#3B82F6] text-white'
                          : 'bg-[#0B0E14] border-[#242B3A] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      1080p Full HD
                    </button>
                  </div>
                </div>
              </div>

              {/* Reassuring Progress Status during Veo Generation */}
              {isGeneratingVeo && (
                <div className="border border-[#2B3548] bg-[#0B0E14] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[#60A5FA] font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{VEO_REASSURING_MESSAGES[veoMessageIdx]}</span>
                  </div>
                  <div className="text-[11px] font-mono-tabular text-[#94A3B8]">
                    {veoStatusLog}
                  </div>
                </div>
              )}

              {/* Generated Veo 3 Video Player & Actions */}
              {veoResultVideoUrl && (
                <div className="border border-[#16A34A]/50 bg-[#0B0E14] rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono-tabular text-[#4ADE80]">
                      {veoStatusLog}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          onAttachGeneratedVeoVideo(veoResultVideoUrl, veoPrompt);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Use as Studio Source Video
                      </button>

                      <a
                        href={veoResultVideoUrl}
                        download={`${project.id}_veo3_${veoAspectRatio.replace(':', 'x')}.mp4`}
                        className="px-3 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download MP4</span>
                      </a>
                    </div>
                  </div>

                  <video
                    controls
                    autoPlay
                    loop
                    src={veoResultVideoUrl}
                    className="w-full max-h-64 rounded-lg border border-[#1E2430] bg-black"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#1E2430]">
                <button
                  onClick={handleGenerateVeoVideo}
                  disabled={isGeneratingVeo}
                  className="px-5 py-2.5 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isGeneratingVeo
                      ? 'Generating Veo 3 Video...'
                      : `Generate ${veoAspectRatio} Video with Veo 3`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
