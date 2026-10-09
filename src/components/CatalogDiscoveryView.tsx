import React, { useMemo, useState } from 'react';
import {
  Search,
  Play,
  SlidersHorizontal,
  ArrowUpRight,
  Volume2,
  Film,
  Sparkles,
  Check,
  RotateCcw,
  Download,
  Video,
} from 'lucide-react';
import { MovieRecapProject, RecapCategory } from '../data/recapCatalog';
import { VideoExportAndVeoModal } from './VideoExportAndVeoModal';
import {
  EdgeVoiceId,
  OutputRatio,
  formatShortTime,
  mmNumber,
} from '../utils/smartSyncEngine';

interface CatalogDiscoveryViewProps {
  projects: MovieRecapProject[];
  activeProjectId: string;
  onSelectProjectForStudio: (projectId: string, jumpToSegmentId?: number) => void;
  onSelectProjectForWorkbench: (projectId: string) => void;
  onUpdateProject: (updated: MovieRecapProject) => void;
  onOpenNewJobModal: () => void;
}

const CATEGORIES: Array<'All' | RecapCategory> = [
  'All',
  'Sci-Fi & Thriller',
  'Horror & Mystery',
  'Crime & Heist',
  'K-Drama Suspense',
  'Survival & Disaster',
];

const RATIOS: Array<'All' | OutputRatio> = ['All', '16:9', '9:16', '1:1'];

export const CatalogDiscoveryView: React.FC<CatalogDiscoveryViewProps> = ({
  projects,
  activeProjectId,
  onSelectProjectForStudio,
  onSelectProjectForWorkbench,
  onUpdateProject,
  onOpenNewJobModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogVideoModal, setCatalogVideoModal] = useState<{
    isOpen: boolean;
    mode: 'export' | 'veo';
  }>({ isOpen: false, mode: 'export' });
  const [selectedCategory, setSelectedCategory] = useState<'All' | RecapCategory>('All');
  const [selectedRatio, setSelectedRatio] = useState<'All' | OutputRatio>('All');
  const [selectedVoice, setSelectedVoice] = useState<'All' | EdgeVoiceId>('All');
  const [selectedOrigin, setSelectedOrigin] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'year' | 'duration' | 'units' | 'accuracy'>('year');

  // Interactive spotlight preview state
  const [spotlightId, setSpotlightId] = useState<string>(activeProjectId || projects[0]?.id);
  const [spotlightSegIndex, setSpotlightSegIndex] = useState<number>(0);
  const [isSynthesizingPreview, setIsSynthesizingPreview] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const spotlightProject = useMemo(
    () => projects.find((p) => p.id === spotlightId) || projects[0],
    [projects, spotlightId]
  );

  const origins = useMemo(() => {
    const set = new Set<string>(projects.map((p) => p.originCountry));
    return ['All', ...Array.from(set)];
  }, [projects]);

  // Advanced multi-field search (matches English/Myanmar titles, characters, story context, and individual timestamped narration lines)
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matched = projects
      .map((project) => {
        if (selectedCategory !== 'All' && project.category !== selectedCategory) return null;
        if (selectedRatio !== 'All' && project.overlays.outputRatio !== selectedRatio) return null;
        if (selectedVoice !== 'All' && project.voicePersona !== selectedVoice) return null;
        if (selectedOrigin !== 'All' && project.originCountry !== selectedOrigin) return null;

        if (!q) {
          return { project, matchedSegment: null as MovieRecapProject['units'][0] | null };
        }

        const inHeader =
          project.englishTitle.toLowerCase().includes(q) ||
          project.myanmarTitle.toLowerCase().includes(q) ||
          project.category.toLowerCase().includes(q) ||
          project.myanmarCategory.toLowerCase().includes(q) ||
          project.director.toLowerCase().includes(q) ||
          project.loglineEn.toLowerCase().includes(q) ||
          project.loglineMm.toLowerCase().includes(q) ||
          project.subgenres.some((s) => s.toLowerCase().includes(q)) ||
          project.storyContext.characters.some((c) => c.toLowerCase().includes(q)) ||
          project.storyContext.terms.some((t) => t.toLowerCase().includes(q));

        const matchedSegment =
          project.units.find(
            (u) =>
              u.source_text.toLowerCase().includes(q) ||
              u.translation.toLowerCase().includes(q)
          ) || null;

        if (!inHeader && !matchedSegment) return null;
        return { project, matchedSegment };
      })
      .filter(
        (item): item is { project: MovieRecapProject; matchedSegment: MovieRecapProject['units'][0] | null } =>
          item !== null
      );

    matched.sort((a, b) => {
      if (sortBy === 'year') return b.project.releaseYear - a.project.releaseYear;
      if (sortBy === 'duration')
        return b.project.recapDurationMinutes - a.project.recapDurationMinutes;
      if (sortBy === 'units') return b.project.units.length - a.project.units.length;
      return b.project.syncAccuracyPercent - a.project.syncAccuracyPercent;
    });

    return matched;
  }, [
    projects,
    searchQuery,
    selectedCategory,
    selectedRatio,
    selectedVoice,
    selectedOrigin,
    sortBy,
  ]);

  const currentSpotlightUnit =
    spotlightProject?.units[spotlightSegIndex] || spotlightProject?.units[0];

  const handlePlaySpotlightVoice = async () => {
    if (!currentSpotlightUnit || isSynthesizingPreview) return;
    setIsSynthesizingPreview(true);
    setPreviewAudioUrl(null);
    try {
      const res = await fetch('/api/recap/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentSpotlightUnit.translation || currentSpotlightUnit.source_text,
          voicePersona: spotlightProject.voicePersona,
          shortPauses: spotlightProject.overlays.shortPauses,
        }),
      });
      const data = await res.json();
      if (res.ok && data.audioDataUrl) {
        setPreviewAudioUrl(data.audioDataUrl);
        const audio = new Audio(data.audioDataUrl);
        audio.play().catch(() => {});
      }
    } catch {
      // Fallback handled silently
    } finally {
      setIsSynthesizingPreview(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedRatio('All');
    setSelectedVoice('All');
    setSelectedOrigin('All');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCategory !== 'All' ||
    selectedRatio !== 'All' ||
    selectedVoice !== 'All' ||
    selectedOrigin !== 'All';

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-12">
      {/* HERO SPOTLIGHT: 2-Column Split with items-stretch */}
      {spotlightProject && (
        <section className="border border-[#1E2430] bg-[#11151E] rounded-xl p-6 lg:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: Editorial & Burmese Narrator Controls */}
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                {/* Clean unboxed metadata kicker */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                  <span className="text-[#60A5FA] font-medium">
                    {spotlightProject.category}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-myanmar">{spotlightProject.myanmarCategory}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{spotlightProject.releaseYear}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    Ratio {spotlightProject.overlays.outputRatio}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {spotlightProject.voicePersona === 'my-MM-ThihaNeural'
                      ? 'Thiha (Male Narrator)'
                      : 'Nilar (Female Narrator)'}
                  </span>
                </div>

                <div className="space-y-2">
                  <h1
                    className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white font-myanmar"
                    style={{ textWrap: 'balance' }}
                  >
                    {spotlightProject.myanmarTitle}
                  </h1>
                  <p className="text-base sm:text-lg font-medium text-[#CBD5E1]">
                    {spotlightProject.englishTitle} — Directed by {spotlightProject.director}
                  </p>
                </div>

                <p className="text-sm text-[#94A3B8] font-myanmar leading-relaxed max-w-[68ch]">
                  {spotlightProject.loglineMm}
                </p>
              </div>

              {/* Live Synchronized Atomic Unit Preview Box */}
              {currentSpotlightUnit && (
                <div className="border border-[#222938] bg-[#0B0E14] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4 text-xs text-[#94A3B8]">
                    <div className="flex items-center gap-2 font-mono-tabular">
                      <span className="text-white font-medium">
                        ID {String(currentSpotlightUnit.id).padStart(5, '0')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatShortTime(currentSpotlightUnit.video_start)} →{' '}
                        {formatShortTime(currentSpotlightUnit.video_end)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#60A5FA]">
                        Sync {currentSpotlightUnit.speedFactor.toFixed(2)}x (
                        {currentSpotlightUnit.frameCount30fps}f @ 30fps)
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {spotlightProject.units.map((u, idx) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setSpotlightSegIndex(idx);
                            setPreviewAudioUrl(null);
                          }}
                          className={`w-6 h-6 rounded text-xs font-mono-tabular transition-colors ${
                            idx === spotlightSegIndex
                              ? 'bg-[#3B82F6] text-white font-semibold'
                              : 'bg-[#161B26] text-[#94A3B8] hover:text-white'
                          }`}
                          title={`Jump to Segment #${u.id}`}
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-white font-myanmar leading-relaxed">
                    “{currentSpotlightUnit.translation}”
                  </p>
                  <p className="text-xs text-[#64748B] italic">
                    EN Source: “{currentSpotlightUnit.source_text}”
                  </p>

                  {previewAudioUrl && (
                    <audio
                      controls
                      src={previewAudioUrl}
                      className="w-full h-8 mt-2"
                    />
                  )}
                </div>
              )}

              {/* Primary CTA & Studio Actions */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  onClick={() => onSelectProjectForStudio(spotlightProject.id)}
                  className="px-4 py-2.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Open in Production Studio</span>
                </button>

                <button
                  onClick={() =>
                    setCatalogVideoModal({ isOpen: true, mode: 'export' })
                  }
                  className="px-4 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export & Download Video</span>
                </button>

                <button
                  onClick={() =>
                    setCatalogVideoModal({ isOpen: true, mode: 'veo' })
                  }
                  className="px-3.5 py-2.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-[#E7EAF0] text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Video className="w-4 h-4 text-[#60A5FA]" />
                  <span>Generate Video (Veo 3)</span>
                </button>

                <button
                  onClick={handlePlaySpotlightVoice}
                  disabled={isSynthesizingPreview}
                  className="px-3.5 py-2.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-[#E7EAF0] text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Volume2 className="w-4 h-4 text-[#60A5FA]" />
                  <span>
                    {isSynthesizingPreview
                      ? 'Synthesizing Voice...'
                      : 'Listen Burmese TTS'}
                  </span>
                </button>
              </div>
            </div>

            {/* Right Column: Cinematic Frame Preview with Live Overlays */}
            <div className="lg:col-span-6 flex flex-col">
              <div className="relative flex-1 min-h-[280px] lg:h-full rounded-lg overflow-hidden border border-[#242B3A] bg-[#080A0F] group">
                {!imageErrors[spotlightProject.id] ? (
                  <img
                    src={spotlightProject.thumbnailUrl}
                    alt={spotlightProject.englishTitle}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setImageErrors((prev) => ({ ...prev, [spotlightProject.id]: true }))
                    }
                    className={`w-full h-full object-cover transition-transform duration-300 ${
                      spotlightProject.overlays.mirrorVideo ? '-scale-x-100' : ''
                    }`}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#131926] to-[#0B0E14] p-6 text-center">
                    <Film className="w-10 h-10 text-[#3B82F6] mb-2" />
                    <span className="text-sm font-myanmar text-white">
                      {spotlightProject.myanmarTitle}
                    </span>
                  </div>
                )}

                {/* Measured contrast scrim for text legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/60 pointer-events-none" />

                {/* Simulated Myanmar Title Overlay Banner */}
                <div className="absolute top-4 inset-x-4 flex items-center justify-between gap-4 pointer-events-none">
                  <div className="bg-black/75 border border-white/15 px-3.5 py-1.5 rounded text-sm font-myanmar text-[#FBBF24] font-semibold shadow-sm truncate">
                    {spotlightProject.overlays.titleText}
                  </div>
                  {spotlightProject.overlays.logoEnabled && (
                    <span className="text-[11px] font-mono-tabular tracking-wider text-white/90 bg-black/60 px-2.5 py-1 rounded border border-white/10 shrink-0">
                      {spotlightProject.overlays.logoTextOrUrl}
                    </span>
                  )}
                </div>

                {/* Bottom Active Burmese Subtitle & Episode Overlay */}
                <div className="absolute bottom-4 inset-x-4 space-y-2 pointer-events-none">
                  <div className="flex items-center justify-between text-xs text-white/80 font-mono-tabular">
                    <span className="font-myanmar text-[#60A5FA] font-medium">
                      {spotlightProject.overlays.extraText} · အပိုင်း ({mmNumber(spotlightProject.overlays.currentEpisodeIndex)})
                    </span>
                    <span>
                      Smart Sync {spotlightProject.syncAccuracyPercent}% · V2 Midpoint Lock
                    </span>
                  </div>
                  {currentSpotlightUnit && (
                    <div className="bg-black/80 backdrop-blur-xs border border-white/15 rounded px-4 py-2.5 text-center">
                      <p className="text-xs sm:text-sm text-white font-myanmar">
                        {currentSpotlightUnit.translation}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Full-width 4-Column Pipeline Telemetry Strip below the Hero Split */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6 mt-6 border-t border-[#1E2430]">
            <div>
              <div className="text-xs text-[#94A3B8]">Segmentation Profile</div>
              <div className="text-sm font-semibold text-white font-mono-tabular mt-0.5">
                v23_v2_local_sync (4.2s / 5.6s max)
              </div>
            </div>
            <div>
              <div className="text-xs text-[#94A3B8]">Visual Window Coverage</div>
              <div className="text-sm font-semibold text-white font-mono-tabular mt-0.5">
                100% Midpoint Split · Max {spotlightProject.maxVideoSpeed}x Speed
              </div>
            </div>
            <div>
              <div className="text-xs text-[#94A3B8]">Story Memory Entities</div>
              <div className="text-sm font-semibold text-white font-mono-tabular mt-0.5">
                {spotlightProject.storyContext.characters.length} Characters ·{' '}
                {spotlightProject.storyContext.terms.length} Key Terms
              </div>
            </div>
            <div>
              <div className="text-xs text-[#94A3B8]">Source → Recap Ratio</div>
              <div className="text-sm font-semibold text-white font-mono-tabular mt-0.5">
                {spotlightProject.sourceDurationMinutes}m Feature →{' '}
                {spotlightProject.recapDurationMinutes}m Burmese Recap
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ADVANCED SEARCH & MULTI-FACETED CATEGORIZATION HUB */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Myanmar Movie Recap Library & Studio Projects
            </h2>
            <p className="text-sm text-[#94A3B8] mt-1">
              Search by English or Myanmar title, character names in Story Memory, or any spoken Burmese/English narration line.
            </p>
          </div>

          <button
            onClick={onOpenNewJobModal}
            className="px-4 py-2 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 self-start md:self-auto whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>Import Custom English Transcript / SRT / Video</span>
          </button>
        </div>

        {/* Search & Filter Control Surface */}
        <div className="border border-[#1E2430] bg-[#11151E] rounded-xl p-5 space-y-4">
          {/* Top Search Row + Sort */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 relative">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movie title, မြန်မာခေါင်းစဉ်, character name (e.g. အယ်လီနာ, Julian), or dialogue phrase..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#3B82F6] font-myanmar"
              />
            </div>

            <div className="lg:col-span-2">
              <select
                value={selectedOrigin}
                onChange={(e) => setSelectedOrigin(e.target.value)}
                aria-label="Filter by Origin Country"
                className="w-full h-full px-3 py-2.5 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-[#E7EAF0] focus:outline-none focus:border-[#3B82F6]"
              >
                {origins.map((origin) => (
                  <option key={origin} value={origin}>
                    {origin === 'All' ? 'All Origins / Regions' : `Origin: ${origin}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'year' | 'duration' | 'units' | 'accuracy')
                }
                aria-label="Sort Projects"
                className="w-full h-full px-3 py-2.5 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-[#E7EAF0] focus:outline-none focus:border-[#3B82F6]"
              >
                <option value="year">Sort: Release Year</option>
                <option value="accuracy">Sort: Sync Accuracy</option>
                <option value="duration">Sort: Recap Duration</option>
                <option value="units">Sort: Sync Unit Count</option>
              </select>
            </div>
          </div>

          {/* Interactive Category & Format Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#1A202C]">
            {/* Category Segmented Buttons */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B0E14] rounded-lg border border-[#1E2430]">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCategory === category
                      ? 'bg-[#3B82F6] text-white'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {category === 'All' ? 'All Categories' : category}
                </button>
              ))}
            </div>

            {/* Output Ratio & Voice Segmented Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-[#0B0E14] rounded-lg border border-[#1E2430]">
                {RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setSelectedRatio(ratio)}
                    className={`px-2.5 py-1 text-xs font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedRatio === ratio
                        ? 'bg-[#1E293B] text-white font-semibold'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {ratio === 'All' ? 'All Ratios' : ratio}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#0B0E14] rounded-lg border border-[#1E2430]">
                {(
                  [
                    { id: 'All', label: 'All Voices' },
                    { id: 'my-MM-ThihaNeural', label: 'Thiha (Male)' },
                    { id: 'my-MM-NilarNeural', label: 'Nilar (Female)' },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVoice(v.id)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedVoice === v.id
                        ? 'bg-[#1E293B] text-white font-semibold'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="px-2.5 py-1.5 text-xs text-[#94A3B8] hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between text-xs text-[#94A3B8] font-mono-tabular">
          <span>
            Showing {filteredProjects.length} of {projects.length} Myanmar Movie Recap projects
          </span>
          <span>
            Pipeline: Whisper ASR · Story Context Memory · Gemini Narrator · Edge/Gemini TTS · 30fps Smart Sync
          </span>
        </div>

        {/* Empty State */}
        {filteredProjects.length === 0 ? (
          <div className="border border-[#1E2430] bg-[#11151E] rounded-xl p-12 text-center space-y-4">
            <p className="text-base font-medium text-white">
              No movie recap projects match your current search or category filters.
            </p>
            <p className="text-xs text-[#94A3B8]">
              Try clearing the search query or switching back to All Categories and All Ratios.
            </p>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-medium rounded-lg hover:bg-[#2563EB] transition-colors cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          /* Populated Project Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map(({ project, matchedSegment }) => {
              const isSpotlight = project.id === spotlightProject?.id;
              return (
                <article
                  key={project.id}
                  className={`border rounded-xl overflow-hidden bg-[#11151E] flex flex-col justify-between transition-colors ${
                    isSpotlight
                      ? 'border-[#3B82F6]'
                      : 'border-[#1E2430] hover:border-[#334155]'
                  }`}
                >
                  <div>
                    {/* Card Thumbnail */}
                    <div
                      onClick={() => {
                        setSpotlightId(project.id);
                        setSpotlightSegIndex(0);
                      }}
                      className="relative aspect-video bg-[#080A0F] overflow-hidden cursor-pointer group"
                    >
                      {!imageErrors[project.id] ? (
                        <img
                          src={project.thumbnailUrl}
                          alt={project.englishTitle}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setImageErrors((prev) => ({ ...prev, [project.id]: true }))
                          }
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#141923]">
                          <Film className="w-8 h-8 text-[#64748B]" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between text-xs text-white/90 font-mono-tabular">
                        <span>
                          {project.recapDurationMinutes}m Recap · {project.overlays.outputRatio}
                        </span>
                        <span>
                          အပိုင်း ({mmNumber(project.episodeCount)})
                        </span>
                      </div>
                    </div>

                    {/* Card Content: Zero-Pill Metadata Discipline */}
                    <div className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#94A3B8]">
                        <span className="text-[#60A5FA] font-medium">{project.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{project.releaseYear}</span>
                        <span aria-hidden="true">·</span>
                        <span>{project.originCountry}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {project.voicePersona === 'my-MM-ThihaNeural' ? 'Thiha' : 'Nilar'}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-white font-myanmar leading-snug">
                          {project.myanmarTitle}
                        </h3>
                        <p className="text-xs font-medium text-[#CBD5E1]">
                          {project.englishTitle} · Dir. {project.director}
                        </p>
                      </div>

                      <p className="text-xs text-[#94A3B8] font-myanmar line-clamp-2">
                        {project.loglineMm}
                      </p>

                      {/* Unboxed subgenres & story memory summary */}
                      <div className="text-[11px] text-[#64748B] pt-1">
                        {project.subgenres.join(' · ')} · {project.units.length} Sync Units ·{' '}
                        {project.syncAccuracyPercent}% Sync
                      </div>

                      {/* Deep Transcript Search Match Snippet */}
                      {matchedSegment && (
                        <div className="pt-2 border-t border-[#1E2430] space-y-1">
                          <div className="text-[11px] text-[#60A5FA] font-mono-tabular">
                            Matched Line ID {String(matchedSegment.id).padStart(5, '0')} @{' '}
                            {formatShortTime(matchedSegment.video_start)}
                          </div>
                          <p className="text-xs text-white font-myanmar line-clamp-2">
                            “{matchedSegment.translation}”
                          </p>
                          <button
                            onClick={() =>
                              onSelectProjectForStudio(project.id, matchedSegment.id)
                            }
                            className="text-[11px] text-[#60A5FA] hover:underline font-medium cursor-pointer"
                          >
                            Jump to timestamp in Studio →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="px-5 py-3.5 border-t border-[#1E2430] flex items-center justify-between gap-2 bg-[#0D1118]">
                    <button
                      onClick={() => {
                        setSpotlightId(project.id);
                        setSpotlightSegIndex(0);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs font-medium text-[#94A3B8] hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isSpotlight ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                          <span className="text-[#E7EAF0]">Previewing Above</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Spotlight Preview</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onSelectProjectForStudio(project.id)}
                      className="px-3 py-1.5 bg-[#1E293B] hover:bg-[#3B82F6] text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Open Studio</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {spotlightProject && (
        <VideoExportAndVeoModal
          isOpen={catalogVideoModal.isOpen}
          initialMode={catalogVideoModal.mode}
          project={spotlightProject}
          customVideoUrl={null}
          onClose={() =>
            setCatalogVideoModal((prev) => ({ ...prev, isOpen: false }))
          }
          onUpdateProject={onUpdateProject}
          onAttachGeneratedVeoVideo={() => {
            onSelectProjectForStudio(spotlightProject.id);
          }}
        />
      )}
    </div>
  );
};
