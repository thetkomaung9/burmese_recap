/**
 * Core Smart Sync, V2 Full-Coverage Midpoint Boundary, Burmese Numeral,
 * Foreign-Script Sanitizer, and Frame Layout Engine
 * Referenced & upgraded from https://github.com/tharlaimar/recap-en-to-mm
 */

export type OutputRatio = '16:9' | '9:16' | '1:1' | 'Original';
export type FrameFillMode = 'blur' | 'black' | 'crop';
export type EdgeVoiceId = 'my-MM-ThihaNeural' | 'my-MM-NilarNeural';

export interface BlurBox {
  id: string;
  x: number; // 0..1 normalized center X
  y: number; // 0..1 normalized center Y
  w: number; // 0..1 normalized width
  h: number; // 0..1 normalized height
  label?: string;
}

export interface ProductionOverlays {
  zoomFactor: number; // 1.00 .. 1.25
  mirrorVideo: boolean; // Horizontal flip left <-> right
  voiceVolumePercent: number; // 50 .. 300%
  shortPauses: boolean; // ~0.25s between lines instead of ~1.0s
  outputRatio: OutputRatio;
  frameFill: FrameFillMode;
  blurStrength: number; // default 18
  blurBoxes: BlurBox[];
  titleText: string;
  titleSize: number; // 24 .. 96
  titlePos: [number, number]; // [x, y] in 0..1
  logoEnabled: boolean;
  logoTextOrUrl: string;
  logoPos: [number, number]; // [x, y] in 0..1
  logoWidthFrac: number; // 0.06 .. 0.35
  logoOpacity: number; // 0.10 .. 1.00
  extraText: string;
  extraTextSize: number; // 18 .. 84
  extraTextOpacity: number; // 0.10 .. 1.00
  extraTextPos: [number, number]; // [x, y] in 0..1
  episodeSplitMinutes: number; // 0 = single video, or e.g. 12 min per episode
  currentEpisodeIndex: number; // 1-indexed
}

export interface StoryContextMemory {
  characters: string[];
  relationships: string[];
  places: string[];
  terms: string[];
  plot_state: string[];
  name_consistency: string[];
  unresolved: string[];
}

export interface AtomicSyncUnit {
  id: number;
  start: number; // raw speech start (seconds)
  end: number; // raw speech end (seconds)
  video_start: number; // V2 midpoint-assigned video window start
  video_end: number; // V2 midpoint-assigned video window end
  source_text: string; // English narrator line
  translation: string; // Spoken Burmese narrator translation
  ttsDuration: number; // Burmese voice clip duration (seconds)
  speedFactor: number; // Clamped video playback speed (e.g., 0.88x .. 1.25x)
  frameCount30fps: number; // Exact cumulative 30fps frame count for zero drift
  syncDriftMs: number; // Sub-frame drift in ms (always within +/- 16.7ms)
  syncAction: 'SLOW_VIDEO' | 'SPEED_UP_VIDEO' | 'TRIM_TAIL_1.25X_CAP' | 'FREEZE_HOLD' | 'EXACT_LOCK';
  auditStatus?: 'VERIFIED' | 'REPAIRED' | 'PENDING' | 'FOREIGN_SCRIPT_CLEANED';
  auditNote?: string;
  audioDataUrl?: string;
}

const MY_DIGITS_MAP: Record<string, string> = {
  '0': '၀',
  '1': '၁',
  '2': '၂',
  '3': '၃',
  '4': '၄',
  '5': '၅',
  '6': '၆',
  '7': '၇',
  '8': '၈',
  '9': '၉',
};

/**
 * Converts Western digits to Myanmar Unicode digits (e.g., 12 -> ၁၂)
 * Ported from services/text_overlay_service.py mm_number()
 */
export function mmNumber(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => MY_DIGITS_MAP[d] ?? d);
}

/**
 * Formats seconds into HH:MM:SS.mmm (ported from recap_planner.py _fmt_ts)
 */
export function formatTimestampMs(seconds: number): string {
  const msTotal = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const h = Math.floor(msTotal / 3_600_000);
  const rem1 = msTotal % 3_600_000;
  const m = Math.floor(rem1 / 60_000);
  const rem2 = rem1 % 60_000;
  const s = Math.floor(rem2 / 1000);
  const ms = rem2 % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatShortTime(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Calculates dB gain from percentage (50% .. 300%)
 * Ported from controller.py _voice_volume_changed
 */
export function volumePercentToDb(percent: number): string {
  const clamped = Math.max(50, Math.min(300, Math.round(percent / 5) * 5));
  const db = 20 * Math.log10(clamped / 100.0);
  return `${clamped}% (${db >= 0 ? '+' : ''}${db.toFixed(1)}dB)`;
}

/**
 * Output Canvas dimensions calculator ported from app/core.py output_canvas()
 */
export function getOutputCanvasSize(
  ratio: OutputRatio,
  sourceWidth = 1920,
  sourceHeight = 1080
): [number, number] {
  if (ratio === '16:9') return [1920, 1080];
  if (ratio === '9:16') return [1080, 1920];
  if (ratio === '1:1') return [1080, 1080];
  if (sourceWidth <= 0 || sourceHeight <= 0) return [1920, 1080];
  const longSide = Math.max(sourceWidth, sourceHeight);
  if (longSide > 1920) {
    const scale = 1920 / longSide;
    return [
      Math.round((sourceWidth * scale) / 2) * 2,
      Math.round((sourceHeight * scale) / 2) * 2,
    ];
  }
  return [sourceWidth, sourceHeight];
}

/**
 * Detects stray foreign script letters inside Burmese narration
 * Ported from recap_planner.py _foreign_letters()
 */
export function findForeignScriptChars(text: string): string[] {
  const bare = String(text || '').replace(/\([^()]*\)/g, '');
  const found: string[] = [];
  for (const ch of bare) {
    const code = ch.codePointAt(0) || 0;
    if (!/\p{L}/u.test(ch)) continue;
    const isMyanmar =
      (code >= 0x1000 && code <= 0x109f) ||
      (code >= 0xa9e0 && code <= 0xa9ff) ||
      (code >= 0xaa60 && code <= 0xaa7f);
    const isLatin = code <= 0x024f || (code >= 0x1e00 && code <= 0x1eff);
    if (!isMyanmar && !isLatin && !found.includes(ch)) {
      found.push(ch);
    }
  }
  return found;
}

/**
 * Estimates natural spoken Burmese TTS duration from Burmese character/syllable length,
 * Edge TTS rate (-50% to +100%), and Short Pauses (~0.25s vs ~0.95s).
 */
export function estimateBurmeseTtsDuration(
  burmeseText: string,
  ratePercent = 0,
  shortPauses = true
): number {
  const clean = String(burmeseText || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 2.5;
  // Burmese characters count (excluding combining vowel signs to approximate syllables)
  const baseChars = Array.from(clean).filter((ch) => {
    const c = ch.codePointAt(0) || 0;
    return (c >= 0x1000 && c <= 0x102a) || (c >= 0x1040 && c <= 0x104f) || /[a-zA-Z0-9]/.test(ch);
  }).length;

  const rateMultiplier = 1 + Math.max(-0.5, Math.min(1.0, ratePercent / 100));
  const rawSeconds = Math.max(1.6, baseChars / (7.2 * rateMultiplier));
  const pausePadding = shortPauses ? 0.25 : 0.9;
  return Number((rawSeconds + pausePadding).toFixed(2));
}

/**
 * V2 Full Coverage Midpoint & 30fps Cumulative Smart Sync Engine
 * Ported from tharlaimar/recap-en-to-mm/app/recap_planner.py & app/core.py
 *
 * - Every unit owns a window of the original picture.
 * - Silence between two units is split at its midpoint so the entire video from
 *   0.00s to totalDuration is used without gaps.
 * - Video window is slowed down or sped up to match the Burmese TTS length,
 *   never exceeding maxVideoSpeed (default 1.25x). If the voice is shorter still,
 *   the tail of that video window is trimmed.
 * - Frame counts are cumulative at 30 fps so hundreds of parts stay within
 *   0.5 frame (16.7ms) of the voice.
 */
export function recalculateSmartSyncUnits(
  units: AtomicSyncUnit[],
  options: {
    totalVideoDuration?: number;
    maxVideoSpeed?: number; // default 1.25
    maxVideoSlow?: number; // default 1.35
    edgeRatePercent?: number; // -50 .. +100
    shortPauses?: boolean; // default true
    smoothFreezeFallback?: boolean;
  } = {}
): AtomicSyncUnit[] {
  if (!units.length) return [];

  const maxSpeed = options.maxVideoSpeed ?? 1.25;
  const maxSlow = options.maxVideoSlow ?? 1.35;
  const ratePercent = options.edgeRatePercent ?? 0;
  const shortPauses = options.shortPauses ?? true;
  const smoothFreeze = options.smoothFreezeFallback ?? false;

  const sorted = [...units].sort((a, b) => a.start - b.start);
  const lastEnd = sorted[sorted.length - 1].end;
  const totalDuration = Math.max(options.totalVideoDuration || lastEnd + 0.8, lastEnd);

  let cumulativeAudioSeconds = 0;
  let cumulativeFrames = 0;

  return sorted.map((unit, idx) => {
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

    // V2 Full Coverage Midpoint boundary assignment
    const videoStart = prev
      ? Number(((prev.end + unit.start) / 2).toFixed(3))
      : 0.0;
    const videoEnd = next
      ? Number(((unit.end + next.start) / 2).toFixed(3))
      : Number(totalDuration.toFixed(3));

    const windowDuration = Math.max(0.5, videoEnd - videoStart);

    // If audio was synthesized with actual duration, adjust slightly for shortPauses; else estimate
    const ttsDuration = unit.audioDataUrl
      ? unit.ttsDuration
      : estimateBurmeseTtsDuration(unit.translation || unit.source_text, ratePercent, shortPauses);

    // Desired video playback speed = source window length / target Burmese voice length
    const rawRatio = windowDuration / Math.max(0.4, ttsDuration);
    let speedFactor = rawRatio;
    let syncAction: AtomicSyncUnit['syncAction'] = 'EXACT_LOCK';

    if (rawRatio > maxSpeed) {
      // Voice is much shorter than source window -> cap speed at 1.25x and trim tail
      speedFactor = maxSpeed;
      syncAction = 'TRIM_TAIL_1.25X_CAP';
    } else if (rawRatio > 1.03) {
      speedFactor = Number(rawRatio.toFixed(2));
      syncAction = 'SPEED_UP_VIDEO';
    } else if (rawRatio < 1 / maxSlow) {
      // Voice is much longer than source window -> slow down up to maxSlow (1.35x slower)
      speedFactor = Number((1 / maxSlow).toFixed(2));
      syncAction = smoothFreeze ? 'FREEZE_HOLD' : 'SLOW_VIDEO';
    } else if (rawRatio < 0.97) {
      speedFactor = Number(rawRatio.toFixed(2));
      syncAction = 'SLOW_VIDEO';
    } else {
      speedFactor = Number(rawRatio.toFixed(2));
      syncAction = 'EXACT_LOCK';
    }

    // Cumulative 30fps frame calculation so drift never accumulates across segments
    cumulativeAudioSeconds += ttsDuration;
    const idealTotalFrames = Math.round(cumulativeAudioSeconds * 30);
    const segmentFrames = Math.max(15, idealTotalFrames - cumulativeFrames);
    cumulativeFrames += segmentFrames;

    const actualVideoSeconds = cumulativeFrames / 30;
    const syncDriftMs = Number(((actualVideoSeconds - cumulativeAudioSeconds) * 1000).toFixed(1));

    return {
      ...unit,
      video_start: videoStart,
      video_end: videoEnd,
      ttsDuration,
      speedFactor,
      frameCount30fps: segmentFrames,
      syncDriftMs,
      syncAction,
    };
  });
}

/**
 * Splits raw English transcript or SRT content into atomic sync units
 * (~4.2s target, max 5.6s per unit) matching segmentation_profile = "v23_v2_local_sync_4p2_5p6"
 */
export function parseTranscriptOrSrtToUnits(
  rawInput: string,
  targetSeconds = 4.2,
  maxSeconds = 5.6
): AtomicSyncUnit[] {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return [];

  // Check if input is SRT format
  const srtBlocks = trimmed.split(/\r?\n\r?\n/);
  const srtRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

  const parsedRaw: { start: number; end: number; text: string }[] = [];

  for (const block of srtBlocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const tsLineIdx = lines.findIndex((l) => srtRegex.test(l));
    if (tsLineIdx !== -1) {
      const m = lines[tsLineIdx].match(srtRegex);
      if (m) {
        const start =
          Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
        const end =
          Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000;
        const text = lines
          .slice(tsLineIdx + 1)
          .join(' ')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (text) {
          parsedRaw.push({ start, end: Math.max(start + 1.5, end), text });
        }
      }
    }
  }

  // If not SRT, split raw English prose into ~4.2s clause/sentence sync units
  if (parsedRaw.length === 0) {
    const sentences = trimmed
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let cursor = 0.0;
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).filter(Boolean);
      // ~2.8 words per second for English recap narrator
      const chunkWordCount = Math.max(6, Math.round(targetSeconds * 2.8));
      for (let i = 0; i < words.length; i += chunkWordCount) {
        const slice = words.slice(i, i + chunkWordCount).join(' ');
        const dur = Math.min(
          maxSeconds,
          Math.max(2.4, Number((slice.split(/\s+/).length / 2.75).toFixed(2)))
        );
        const start = Number(cursor.toFixed(2));
        const end = Number((cursor + dur).toFixed(2));
        parsedRaw.push({ start, end, text: slice });
        cursor = end + 0.25;
      }
    }
  }

  const initialUnits: AtomicSyncUnit[] = parsedRaw.map((item, index) => ({
    id: index + 1,
    start: item.start,
    end: item.end,
    video_start: item.start,
    video_end: item.end,
    source_text: item.text,
    translation: '',
    ttsDuration: targetSeconds,
    speedFactor: 1.0,
    frameCount30fps: Math.round(targetSeconds * 30),
    syncDriftMs: 0,
    syncAction: 'EXACT_LOCK',
    auditStatus: 'PENDING',
  }));

  return recalculateSmartSyncUnits(initialUnits);
}

/**
 * Generates an official smart_sync_plan.json file compatible with tharlaimar/recap-en-to-mm
 */
export function buildSmartSyncPlanJson(
  projectTitle: string,
  units: AtomicSyncUnit[],
  storyContext: StoryContextMemory,
  overlays: ProductionOverlays
) {
  const totalDuration = units.length > 0 ? units[units.length - 1].video_end : 0;
  return {
    planner_mode: 'timestamp_translation_en_to_mm_narrator_v1',
    segmentation_profile: 'v23_v2_local_sync_4p2_5p6',
    boundary_profile: 'v2_full_coverage_midpoint',
    translation_direction: 'en_to_mm',
    source_language: 'en',
    target_language: 'mm',
    source_title: projectTitle,
    video_duration_seconds: totalDuration,
    atomic_unit_count: units.length,
    production_settings: {
      output_ratio: overlays.outputRatio,
      frame_fill: overlays.frameFill,
      mirror_video: overlays.mirrorVideo,
      zoom_factor: overlays.zoomFactor,
      voice_volume_percent: overlays.voiceVolumePercent,
      short_pauses: overlays.shortPauses,
      blur_boxes: overlays.blurBoxes,
      title_text: overlays.titleText,
      title_position: overlays.titlePos,
      extra_text: overlays.extraText,
      extra_text_position: overlays.extraTextPos,
    },
    story_context: storyContext,
    segments: units.map((u) => ({
      id: u.id,
      timestamp: `${formatTimestampMs(u.start)} --> ${formatTimestampMs(u.end)}`,
      video_start: u.video_start,
      video_end: u.video_end,
      source_text: u.source_text,
      narration: u.translation || u.source_text,
      tts_duration: u.ttsDuration,
      speed_factor: u.speedFactor,
      frame_count_30fps: u.frameCount30fps,
      sync_drift_ms: u.syncDriftMs,
    })),
  };
}

/**
 * Generates Myanmar .SRT subtitle file content
 */
export function buildSrtContent(
  units: AtomicSyncUnit[],
  mode: 'mm_only' | 'bilingual' = 'mm_only'
): string {
  const toSrtTime = (sec: number) => formatTimestampMs(sec).replace('.', ',');
  return units
    .map((u, idx) => {
      const mmLine = u.translation || u.source_text;
      const body = mode === 'bilingual' ? `${mmLine}\n${u.source_text}` : mmLine;
      return `${idx + 1}\n${toSrtTime(u.video_start)} --> ${toSrtTime(u.video_end)}\n${body}`;
    })
    .join('\n\n');
}
