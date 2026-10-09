import { INITIAL_RECAP_CATALOG } from '../data/recapCatalog';

export type ExportFormatType =
  | 'VIDEO_WEBM'
  | 'VEO_MP4'
  | 'PACKAGE_JSON'
  | 'SUBTITLE_SRT';

export interface ExportHistoryEntry {
  id: string;
  projectId: string;
  projectTitle: string;
  fileName: string;
  format: ExportFormatType;
  fileSizeBytes: number;
  timestampIso: string;
  outputRatio: string;
  unitCount: number;
}

const STORAGE_KEY = 'recapmm_project_export_history_v1';
export const EXPORT_HISTORY_EVENT = 'recapmm:export-history-updated';

function buildSeededHistory(): ExportHistoryEntry[] {
  const now = Date.now();
  const min = 60 * 1000;
  const hour = 60 * min;

  const seeded: ExportHistoryEntry[] = [];

  INITIAL_RECAP_CATALOG.forEach((proj, idx) => {
    const baseOffset = idx * 17 * min;
    seeded.push(
      {
        id: `seed-${proj.id}-1`,
        projectId: proj.id,
        projectTitle: proj.englishTitle,
        fileName: `${proj.id}_final_edge_tts_smart_sync_${proj.overlays.outputRatio.replace(':', 'x')}.webm`,
        format: 'VIDEO_WEBM',
        fileSizeBytes: 4820400 + idx * 640200,
        timestampIso: new Date(now - (18 * min + baseOffset)).toISOString(),
        outputRatio: proj.overlays.outputRatio,
        unitCount: proj.units.length,
      },
      {
        id: `seed-${proj.id}-2`,
        projectId: proj.id,
        projectTitle: proj.englishTitle,
        fileName: `${proj.id}_recapmm_export_package.json`,
        format: 'PACKAGE_JSON',
        fileSizeBytes: 18420 + proj.units.length * 980,
        timestampIso: new Date(now - (2 * hour + baseOffset)).toISOString(),
        outputRatio: proj.overlays.outputRatio,
        unitCount: proj.units.length,
      },
      {
        id: `seed-${proj.id}-3`,
        projectId: proj.id,
        projectTitle: proj.englishTitle,
        fileName: `${proj.id}_myanmar.srt`,
        format: 'SUBTITLE_SRT',
        fileSizeBytes: 4120 + proj.units.length * 340,
        timestampIso: new Date(now - (5 * hour + baseOffset)).toISOString(),
        outputRatio: proj.overlays.outputRatio,
        unitCount: proj.units.length,
      },
      {
        id: `seed-${proj.id}-4`,
        projectId: proj.id,
        projectTitle: proj.englishTitle,
        fileName: `${proj.id}_veo3_${proj.overlays.outputRatio === '9:16' ? '9x16' : '16x9'}.mp4`,
        format: 'VEO_MP4',
        fileSizeBytes: 3190500 + idx * 410000,
        timestampIso: new Date(now - (14 * hour + baseOffset)).toISOString(),
        outputRatio: proj.overlays.outputRatio === '9:16' ? '9:16' : '16:9',
        unitCount: proj.units.length,
      }
    );
  });

  return seeded;
}

export function loadAllExportHistory(): ExportHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = buildSeededHistory();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fallback if localStorage is restricted
  }
  return buildSeededHistory();
}

export function getExportHistoryForProject(
  projectId: string
): ExportHistoryEntry[] {
  return loadAllExportHistory()
    .filter((entry) => entry.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.timestampIso).getTime() - new Date(a.timestampIso).getTime()
    );
}

export function recordProjectExport(
  entry: Omit<ExportHistoryEntry, 'id' | 'timestampIso'>
): ExportHistoryEntry {
  const newRecord: ExportHistoryEntry = {
    ...entry,
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestampIso: new Date().toISOString(),
  };

  try {
    const existing = loadAllExportHistory();
    const updated = [newRecord, ...existing].slice(0, 120);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EXPORT_HISTORY_EVENT));
  } catch {
    // Ignore storage errors
  }

  return newRecord;
}

export function clearExportHistoryForProject(projectId: string): void {
  try {
    const existing = loadAllExportHistory();
    const remaining = existing.filter((e) => e.projectId !== projectId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    window.dispatchEvent(new CustomEvent(EXPORT_HISTORY_EVENT));
  } catch {
    // Ignore storage errors
  }
}

export function formatBytesReadable(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatExportTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
