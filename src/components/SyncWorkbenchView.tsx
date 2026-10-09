import React, { useMemo, useState } from 'react';
import {
  Search,
  Sparkles,
  Volume2,
  ShieldAlert,
  CheckCircle2,
  Download,
  Plus,
  Wand2,
} from 'lucide-react';
import { MovieRecapProject } from '../data/recapCatalog';
import {
  AtomicSyncUnit,
  buildSrtContent,
  findForeignScriptChars,
  formatTimestampMs,
  recalculateSmartSyncUnits,
} from '../utils/smartSyncEngine';

interface SyncWorkbenchViewProps {
  project: MovieRecapProject;
  onUpdateProject: (updated: MovieRecapProject) => void;
  onOpenInStudio: (segmentId: number) => void;
}

export const SyncWorkbenchView: React.FC<SyncWorkbenchViewProps> = ({
  project,
  onUpdateProject,
  onOpenInStudio,
}) => {
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VERIFIED' | 'FOREIGN'>('ALL');
  const [isAuditing, setIsAuditing] = useState(false);
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [synthesizingId, setSynthesizingId] = useState<number | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const filteredUnits = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return project.units.filter((u) => {
      const foreignChars = findForeignScriptChars(u.translation);
      if (statusFilter === 'FOREIGN' && foreignChars.length === 0) return false;
      if (statusFilter === 'VERIFIED' && u.auditStatus !== 'VERIFIED') return false;
      if (!q) return true;
      return (
        u.source_text.toLowerCase().includes(q) ||
        u.translation.toLowerCase().includes(q) ||
        String(u.id).includes(q)
      );
    });
  }, [project.units, filterText, statusFilter]);

  const handleUpdateUnitTranslation = (id: number, newTranslation: string) => {
    const updated = project.units.map((u) =>
      u.id === id ? { ...u, translation: newTranslation } : u
    );
    const recomputed = recalculateSmartSyncUnits(updated, {
      edgeRatePercent: project.edgeRatePercent,
      shortPauses: project.overlays.shortPauses,
      maxVideoSpeed: project.maxVideoSpeed,
      maxVideoSlow: project.maxVideoSlow,
    });
    onUpdateProject({ ...project, units: recomputed });
  };

  // Inject & Sanitize Foreign Script Demo (demonstrates recap_planner.py _foreign_letters guard)
  const handleCleanAllForeignCharacters = () => {
    let cleanedCount = 0;
    const cleanedUnits = project.units.map((u) => {
      const foreign = findForeignScriptChars(u.translation);
      if (foreign.length === 0) return u;
      cleanedCount++;
      let nextTr = u.translation;
      for (const ch of foreign) {
        nextTr = nextTr.split(ch).join('');
      }
      return {
        ...u,
        translation: nextTr.replace(/\s+/g, ' ').trim(),
        auditStatus: 'FOREIGN_SCRIPT_CLEANED' as const,
        auditNote: `Removed foreign script chars: ${foreign.join(' ')}`,
      };
    });

    if (cleanedCount > 0) {
      onUpdateProject({
        ...project,
        units: recalculateSmartSyncUnits(cleanedUnits, {
          edgeRatePercent: project.edgeRatePercent,
          shortPauses: project.overlays.shortPauses,
          maxVideoSpeed: project.maxVideoSpeed,
          maxVideoSlow: project.maxVideoSlow,
        }),
      });
      setBannerMessage(
        `Foreign-Script Sanitizer cleaned ${cleanedCount} line(s) of stray non-Myanmar/non-Latin characters.`
      );
    } else {
      setBannerMessage(
        'All Burmese narration lines passed the Unicode Myanmar (U+1000..U+109F) script integrity check.'
      );
    }
  };

  // Run Gemini Per-ID Alignment Audit
  const handleRunGeminiAudit = async () => {
    if (isAuditing) return;
    setIsAuditing(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/recap/audit-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: project.units,
          storyContext: project.storyContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit request failed');

      const auditMap = new Map<
        number,
        { translation: string; status: string; auditNote: string }
      >();
      for (const item of data.auditedItems || []) {
        auditMap.set(Number(item.id), item);
      }

      const nextUnits: AtomicSyncUnit[] = project.units.map((u) => {
        const audited = auditMap.get(u.id);
        if (!audited) return u;
        return {
          ...u,
          translation: audited.translation || u.translation,
          auditStatus:
            audited.status === 'REPAIRED' ? 'REPAIRED' : 'VERIFIED',
          auditNote: audited.auditNote,
        };
      });

      onUpdateProject({
        ...project,
        units: recalculateSmartSyncUnits(nextUnits, {
          edgeRatePercent: project.edgeRatePercent,
          shortPauses: project.overlays.shortPauses,
          maxVideoSpeed: project.maxVideoSpeed,
          maxVideoSlow: project.maxVideoSlow,
        }),
      });
      setBannerMessage(
        `Gemini Alignment Audit completed across ${project.units.length} atomic sync units.`
      );
    } catch (err: unknown) {
      setBannerMessage(
        err instanceof Error ? err.message : 'Failed to run alignment audit'
      );
    } finally {
      setIsAuditing(false);
    }
  };

  // Re-translate all units with Context-Aware Burmese Narrator Translator
  const handleRetranslateBatch = async () => {
    if (isTranslatingAll) return;
    setIsTranslatingAll(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/recap/translate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current: project.units,
          storyContext: project.storyContext,
          previousContext: [],
          nextContext: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch translation failed');

      const trMap = new Map<number, string>();
      for (const item of data.items || []) {
        trMap.set(Number(item.id), item.translation);
      }

      const nextUnits: AtomicSyncUnit[] = project.units.map((u) => ({
        ...u,
        translation: trMap.get(u.id) || u.translation,
        auditStatus: 'VERIFIED',
      }));

      onUpdateProject({
        ...project,
        units: recalculateSmartSyncUnits(nextUnits, {
          edgeRatePercent: project.edgeRatePercent,
          shortPauses: project.overlays.shortPauses,
          maxVideoSpeed: project.maxVideoSpeed,
          maxVideoSlow: project.maxVideoSlow,
        }),
      });
      setBannerMessage(
        `Translated ${project.units.length} atomic units into spoken Burmese narrator style.`
      );
    } catch (err: unknown) {
      setBannerMessage(
        err instanceof Error ? err.message : 'Batch translation failed'
      );
    } finally {
      setIsTranslatingAll(false);
    }
  };

  const handleSynthesizeRow = async (unit: AtomicSyncUnit) => {
    if (synthesizingId !== null) return;
    setSynthesizingId(unit.id);
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
      if (res.ok && data.audioDataUrl) {
        const updated = project.units.map((u) =>
          u.id === unit.id
            ? {
                ...u,
                audioDataUrl: data.audioDataUrl,
                ttsDuration: data.durationSeconds || u.ttsDuration,
              }
            : u
        );
        onUpdateProject({
          ...project,
          units: recalculateSmartSyncUnits(updated, {
            edgeRatePercent: project.edgeRatePercent,
            shortPauses: project.overlays.shortPauses,
            maxVideoSpeed: project.maxVideoSpeed,
            maxVideoSlow: project.maxVideoSlow,
          }),
        });
        const audio = new Audio(data.audioDataUrl);
        audio.play().catch(() => {});
      }
    } finally {
      setSynthesizingId(null);
    }
  };

  const handleAddSegmentRow = () => {
    const last = project.units[project.units.length - 1];
    const nextStart = last ? Number((last.end + 0.3).toFixed(2)) : 0;
    const nextEnd = Number((nextStart + 4.2).toFixed(2));
    const newUnit: AtomicSyncUnit = {
      id: (last?.id || 0) + 1,
      start: nextStart,
      end: nextEnd,
      video_start: nextStart,
      video_end: nextEnd,
      source_text: 'New English narrator segment ready for Burmese translation.',
      translation: 'မြန်မာနောက်ခံစကားပြော ဘာသာပြန်ရန် အပိုင်းသစ်။',
      ttsDuration: 4.2,
      speedFactor: 1.0,
      frameCount30fps: 126,
      syncDriftMs: 0,
      syncAction: 'EXACT_LOCK',
      auditStatus: 'VERIFIED',
    };
    const nextUnits = recalculateSmartSyncUnits([...project.units, newUnit], {
      edgeRatePercent: project.edgeRatePercent,
      shortPauses: project.overlays.shortPauses,
      maxVideoSpeed: project.maxVideoSpeed,
      maxVideoSlow: project.maxVideoSlow,
    });
    onUpdateProject({ ...project, units: nextUnits });
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-6">
      {/* Header & Batch Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1E2430] pb-6">
        <div>
          <div className="text-xs text-[#94A3B8] font-mono-tabular">
            Per-ID Timestamp Translation & 30fps Smart Sync Table · {project.englishTitle}
          </div>
          <h1 className="text-2xl font-bold text-white font-myanmar mt-1">
            {project.myanmarTitle} — Sync Workbench
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRetranslateBatch}
            disabled={isTranslatingAll}
            className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>
              {isTranslatingAll
                ? 'Translating Batch...'
                : 'Gemini Re-Translate All IDs'}
            </span>
          </button>

          <button
            onClick={handleRunGeminiAudit}
            disabled={isAuditing}
            className="px-4 py-2 bg-[#19202E] hover:bg-[#232C3F] disabled:opacity-50 border border-[#2B3548] text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>
              {isAuditing ? 'Auditing Alignment...' : 'Run Per-ID Alignment Audit'}
            </span>
          </button>

          <button
            onClick={handleCleanAllForeignCharacters}
            className="px-3.5 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-[#E7EAF0] text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-[#FBBF24]" />
            <span>Verify Foreign-Script Guard</span>
          </button>

          <button
            onClick={handleAddSegmentRow}
            className="px-3.5 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Sync Unit</span>
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="border border-[#2B3548] bg-[#131926] rounded-lg px-4 py-3 text-xs text-[#E7EAF0] flex items-center justify-between">
          <span>{bannerMessage}</span>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-[#94A3B8] hover:text-white ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by ID, English source, or မြန်မာစာ..."
            className="w-full pl-9 pr-4 py-2 bg-[#11151E] border border-[#1E2430] rounded-lg text-xs text-white font-myanmar focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#11151E] border border-[#1E2430] rounded-lg">
          {(
            [
              { id: 'ALL', label: `All Units (${project.units.length})` },
              { id: 'VERIFIED', label: 'Audit Verified' },
              { id: 'FOREIGN', label: 'Foreign Script Alerts' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* High-Density Tabular Workbench */}
      <div className="border border-[#1E2430] bg-[#11151E] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E2430] bg-[#0D1118] text-[11px] font-mono-tabular text-[#94A3B8]">
                <th className="py-3 px-4 w-20">ID</th>
                <th className="py-3 px-4 w-44">V2 Video Window</th>
                <th className="py-3 px-4 w-[32%]">English Narrator Source</th>
                <th className="py-3 px-4 w-[36%]">
                  Spoken Burmese Narrator (Editable)
                </th>
                <th className="py-3 px-4 text-right w-32">Smart Sync</th>
                <th className="py-3 px-4 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A202C] text-xs">
              {filteredUnits.map((unit) => {
                const foreignChars = findForeignScriptChars(unit.translation);
                const windowDur = (unit.video_end - unit.video_start).toFixed(2);
                return (
                  <tr
                    key={unit.id}
                    className="hover:bg-[#151B26] transition-colors align-top"
                  >
                    <td className="py-3.5 px-4 font-mono-tabular">
                      <button
                        onClick={() => onOpenInStudio(unit.id)}
                        className="text-white font-semibold hover:text-[#60A5FA] cursor-pointer"
                        title="Open this unit in Studio Canvas"
                      >
                        {String(unit.id).padStart(5, '0')}
                      </button>
                      <div className="text-[11px] text-[#64748B] mt-1">
                        {unit.auditStatus === 'REPAIRED' ? (
                          <span className="text-[#FBBF24]">Repaired</span>
                        ) : (
                          <span className="text-[#16A34A]">Verified</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono-tabular text-[#CBD5E1]">
                      <div>{formatTimestampMs(unit.video_start)}</div>
                      <div className="text-[#64748B]">
                        → {formatTimestampMs(unit.video_end)}
                      </div>
                      <div className="text-[11px] text-[#60A5FA] mt-1">
                        Win: {windowDur}s · TTS: {unit.ttsDuration}s
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-[#CBD5E1] leading-relaxed">
                      {unit.source_text}
                    </td>

                    <td className="py-3.5 px-4 space-y-1.5">
                      <textarea
                        rows={2}
                        value={unit.translation}
                        onChange={(e) =>
                          handleUpdateUnitTranslation(unit.id, e.target.value)
                        }
                        className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded text-xs sm:text-sm text-white font-myanmar focus:outline-none focus:border-[#3B82F6]"
                      />
                      {foreignChars.length > 0 && (
                        <div className="text-[11px] text-[#F87171] flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>
                            Foreign script detected: {foreignChars.join(' ')}
                          </span>
                        </div>
                      )}
                      {unit.auditNote && (
                        <div className="text-[11px] text-[#64748B]">
                          {unit.auditNote}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono-tabular">
                      <div className="text-white font-semibold">
                        {unit.speedFactor.toFixed(2)}x
                      </div>
                      <div className="text-[11px] text-[#94A3B8]">
                        {unit.frameCount30fps} frames
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-0.5">
                        {unit.syncAction}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSynthesizeRow(unit)}
                          disabled={synthesizingId === unit.id}
                          className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#3B82F6] text-white rounded border border-[#2B3548] transition-colors cursor-pointer disabled:opacity-40"
                          title="Synthesize & Play Burmese TTS"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
