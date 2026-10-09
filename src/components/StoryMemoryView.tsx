import React, { useState } from 'react';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { MovieRecapProject } from '../data/recapCatalog';
import { StoryContextMemory } from '../utils/smartSyncEngine';

interface StoryMemoryViewProps {
  project: MovieRecapProject;
  onUpdateProject: (updated: MovieRecapProject) => void;
}

const MEMORY_SECTIONS: Array<{
  key: keyof StoryContextMemory;
  title: string;
  subtitle: string;
  placeholder: string;
}> = [
  {
    key: 'characters',
    title: '01. Characters & Cast Roles',
    subtitle: 'Exact English names paired with Burmese narrator roles',
    placeholder: 'e.g. Elena Rostova (Chief Engineer / အင်ဂျင်နီယာချုပ် အယ်လီနာ)',
  },
  {
    key: 'name_consistency',
    title: '02. Burmese Pronoun & Name Consistency Rules',
    subtitle: 'Locked Burmese transliterations, honorifics, and kinship pronouns',
    placeholder: 'e.g. Elena -> အယ်လီနာ (Pronoun: သူမ)',
  },
  {
    key: 'relationships',
    title: '03. Character Relationships & Kinship',
    subtitle: 'Ensures Burmese kinship terms (အစ်ကို, ညီမ, ဆရာ) remain consistent across batches',
    placeholder: 'e.g. Elena is Commander Marcus’s former protégé',
  },
  {
    key: 'places',
    title: '04. Locations & Settings',
    subtitle: 'Key story settings preserved across all 40-unit translation batches',
    placeholder: 'e.g. Astraea Orbital Station (အက်စ်ထရီယာ အာကာသစခန်း)',
  },
  {
    key: 'terms',
    title: '05. Domain Terminology & Key Objects',
    subtitle: 'Recurring sci-fi, legal, or mystery objects translated consistently',
    placeholder: 'e.g. Temporal Fracture (အချိန်ကွဲကြောင်း)',
  },
  {
    key: 'plot_state',
    title: '06. Chronological Plot State Memory',
    subtitle: 'Compact chronological progression updated after each transcript chunk',
    placeholder: 'e.g. Day 412: Elena unlocks Marcus’s flight helmet recorder',
  },
  {
    key: 'unresolved',
    title: '07. Unresolved Mysteries & Hooks',
    subtitle: 'Open plot threads held in memory for later episodes',
    placeholder: 'e.g. Whether cutting power to the Chronos Core erases the colony',
  },
];

export const StoryMemoryView: React.FC<StoryMemoryViewProps> = ({
  project,
  onUpdateProject,
}) => {
  const [newInputs, setNewInputs] = useState<Record<string, string>>({});
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const handleAddEntry = (sectionKey: keyof StoryContextMemory) => {
    const val = (newInputs[sectionKey] || '').trim();
    if (!val) return;
    const nextMemory: StoryContextMemory = {
      ...project.storyContext,
      [sectionKey]: [...project.storyContext[sectionKey], val],
    };
    onUpdateProject({ ...project, storyContext: nextMemory });
    setNewInputs((prev) => ({ ...prev, [sectionKey]: '' }));
  };

  const handleRemoveEntry = (
    sectionKey: keyof StoryContextMemory,
    index: number
  ) => {
    const nextList = project.storyContext[sectionKey].filter((_, i) => i !== index);
    onUpdateProject({
      ...project,
      storyContext: {
        ...project.storyContext,
        [sectionKey]: nextList,
      },
    });
  };

  const handleRebuildContextWithGemini = async () => {
    if (isRebuilding) return;
    setIsRebuilding(true);
    setStatusNote(null);
    try {
      const res = await fetch('/api/recap/story-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieTitle: project.englishTitle,
          units: project.units,
          existingMemory: project.storyContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rebuild Story Context');
      if (data.memory) {
        onUpdateProject({
          ...project,
          storyContext: data.memory,
        });
        setStatusNote(
          'Story Context Memory successfully updated from transcript via Gemini.'
        );
      }
    } catch (err: unknown) {
      setStatusNote(
        err instanceof Error ? err.message : 'Story Context update failed'
      );
    } finally {
      setIsRebuilding(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E2430] pb-6">
        <div>
          <div className="text-xs text-[#94A3B8] font-mono-tabular">
            build_story_context() Durable JSON Memory · {project.englishTitle}
          </div>
          <h1 className="text-2xl font-bold text-white font-myanmar mt-1">
            {project.myanmarTitle} — Story Context Memory
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1 max-w-2xl">
            Before translating any batch, Gemini reads the transcript to build durable story memory so names, Burmese kinship pronouns, and plot reveals stay consistent across multi-hour movies.
          </p>
        </div>

        <button
          onClick={handleRebuildContextWithGemini}
          disabled={isRebuilding}
          className="px-4 py-2.5 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 self-start md:self-auto whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>
            {isRebuilding
              ? 'Extracting Story Memory with Gemini...'
              : 'Rebuild Story Memory via Gemini'}
          </span>
        </button>
      </div>

      {statusNote && (
        <div className="border border-[#2B3548] bg-[#131926] rounded-lg px-4 py-3 text-xs text-white">
          {statusNote}
        </div>
      )}

      {/* 7-Pillar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {MEMORY_SECTIONS.map((sec) => {
          const items = project.storyContext[sec.key] || [];
          return (
            <div
              key={sec.key}
              className="border border-[#1E2430] bg-[#11151E] rounded-xl p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">{sec.title}</h2>
                  <p className="text-xs text-[#94A3B8] mt-0.5">{sec.subtitle}</p>
                </div>

                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-[#64748B] italic py-2">
                      No entries recorded yet.
                    </div>
                  ) : (
                    items.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 bg-[#0B0E14] border border-[#1E2430] rounded-lg px-3 py-2 text-xs text-[#E7EAF0] font-myanmar"
                      >
                        <span className="leading-relaxed">{entry}</span>
                        <button
                          onClick={() => handleRemoveEntry(sec.key, idx)}
                          className="text-[#64748B] hover:text-[#F87171] shrink-0 mt-0.5 cursor-pointer"
                          title="Remove entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Entry Input */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#1A202C]">
                <input
                  type="text"
                  value={newInputs[sec.key] || ''}
                  onChange={(e) =>
                    setNewInputs((prev) => ({ ...prev, [sec.key]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddEntry(sec.key);
                  }}
                  placeholder={sec.placeholder}
                  className="flex-1 px-3 py-1.5 bg-[#0B0E14] border border-[#242B3A] rounded text-xs text-white font-myanmar focus:outline-none focus:border-[#3B82F6]"
                />
                <button
                  onClick={() => handleAddEntry(sec.key)}
                  className="px-3 py-1.5 bg-[#19202E] hover:bg-[#3B82F6] border border-[#2B3548] rounded text-xs text-white flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
