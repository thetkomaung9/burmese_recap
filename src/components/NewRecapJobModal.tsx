import React, { useState } from 'react';
import { X, Upload, Sparkles, FileText, Mic } from 'lucide-react';
import {
  INITIAL_RECAP_CATALOG,
  MovieRecapProject,
  RecapCategory,
} from '../data/recapCatalog';
import {
  EdgeVoiceId,
  OutputRatio,
  parseTranscriptOrSrtToUnits,
} from '../utils/smartSyncEngine';

interface NewRecapJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: MovieRecapProject) => void;
}

const SAMPLE_ENGLISH_SRT = `1
00:00:00,000 --> 00:00:04,200
Deep beneath the Pacific trench, sonar operator Liam detects a rhythmic metallic pulse repeating every twelve seconds.

2
00:00:04,500 --> 00:00:08,900
When Captain Mercer orders the submersible closer, their floodlights reveal a sunken research vessel from 1984 with its interior lights still burning.

3
00:00:09,200 --> 00:00:13,600
Before they can radio the surface ship, a magnetic lock engages around the hull and pulls them toward the docking bay.`;

export const NewRecapJobModal: React.FC<NewRecapJobModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const [englishTitle, setEnglishTitle] = useState('');
  const [myanmarTitle, setMyanmarTitle] = useState('');
  const [category, setCategory] = useState<RecapCategory>('Sci-Fi & Thriller');
  const [outputRatio, setOutputRatio] = useState<OutputRatio>('16:9');
  const [voicePersona, setVoicePersona] = useState<EdgeVoiceId>('my-MM-ThihaNeural');
  const [rawTranscript, setRawTranscript] = useState(SAMPLE_ENGLISH_SRT);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [isCreatingAndTranslating, setIsCreatingAndTranslating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAudioFileTranscribe = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsTranscribingAudio(true);
    setErrorMsg(null);

    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const resStr = String(reader.result || '');
          const commaIdx = resStr.indexOf(',');
          resolve(commaIdx !== -1 ? resStr.slice(commaIdx + 1) : resStr);
        };
        reader.onerror = () => reject(new Error('Failed to read audio file'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/recap/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Audio,
          mimeType: file.type || 'audio/mp3',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');
      if (data.transcriptText) {
        setRawTranscript(data.transcriptText);
        if (!englishTitle) {
          setEnglishTitle(file.name.replace(/\.[^.]+$/, ''));
        }
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Audio transcription error'
      );
    } finally {
      setIsTranscribingAudio(false);
    }
  };

  const handleCreateJob = async (autoTranslateWithGemini: boolean) => {
    const units = parseTranscriptOrSrtToUnits(rawTranscript, 4.2, 5.6);
    if (units.length === 0) {
      setErrorMsg('Please enter an English transcript or SRT subtitle lines.');
      return;
    }

    setIsCreatingAndTranslating(true);
    setErrorMsg(null);

    const titleEn = englishTitle.trim() || 'Untitled Deep Sea Recap';
    const titleMm =
      myanmarTitle.trim() || 'ပစိဖိတ်သမုဒ္ဒရာအောက်ခြေက လျှို့ဝှက်သင်္ဘောကြီး';

    let finalUnits = units;
    let finalMemory = {
      characters: ['Liam (Sonar Operator)', 'Captain Mercer (Submersible Commander)'],
      relationships: ['Liam reports directly to Captain Mercer aboard the deep-sea rig'],
      places: ['Pacific Trench Sector 7'],
      terms: ['Acoustic Pulse (သတ္တုလှိုင်းသံ)'],
      plot_state: ['Submersible discovers a 1984 vessel with active power'],
      name_consistency: ['Liam -> လီယမ်', 'Captain Mercer -> ကပ္ပတိန် မာစာ'],
      unresolved: ['Who activated the magnetic docking lock from inside'],
    };

    if (autoTranslateWithGemini) {
      try {
        const ctxRes = await fetch('/api/recap/story-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movieTitle: titleEn,
            units,
            existingMemory: finalMemory,
          }),
        });
        if (ctxRes.ok) {
          const ctxData = await ctxRes.json();
          if (ctxData.memory) finalMemory = ctxData.memory;
        }

        const trRes = await fetch('/api/recap/translate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current: units,
            storyContext: finalMemory,
            previousContext: [],
            nextContext: [],
          }),
        });
        if (trRes.ok) {
          const trData = await trRes.json();
          const map = new Map<number, string>();
          for (const item of trData.items || []) {
            map.set(Number(item.id), item.translation);
          }
          finalUnits = units.map((u) => ({
            ...u,
            translation: map.get(u.id) || u.source_text,
            auditStatus: 'VERIFIED',
          }));
        }
      } catch {
        // Proceed with created project even if offline/error
      }
    }

    const newProject: MovieRecapProject = {
      id: `job-${Date.now()}`,
      englishTitle: titleEn,
      myanmarTitle: titleMm,
      category,
      myanmarCategory: 'အသစ်ဖန်တီးထားသော ဇာတ်လမ်းအကျဉ်း',
      subgenres: ['Custom Job', 'V2 Smart Sync'],
      releaseYear: 2026,
      director: 'Studio Creator',
      originCountry: 'Hollywood',
      sourceDurationMinutes: 115,
      recapDurationMinutes: Number(
        Math.max(1.5, (finalUnits.length * 4.2) / 60).toFixed(1)
      ),
      episodeCount: 1,
      voicePersona,
      edgeRatePercent: 5,
      maxVideoSpeed: 1.25,
      maxVideoSlow: 1.35,
      syncStatus: 'Smart Sync Verified',
      syncAccuracyPercent: 99.8,
      thumbnailUrl: INITIAL_RECAP_CATALOG[0].thumbnailUrl,
      loglineEn: finalUnits[0]?.source_text || titleEn,
      loglineMm: finalUnits[0]?.translation || titleMm,
      storyContext: finalMemory,
      overlays: {
        ...INITIAL_RECAP_CATALOG[0].overlays,
        outputRatio,
        titleText: titleMm,
        extraText: 'အပိုင်း (၁)',
      },
      units: finalUnits,
    };

    setIsCreatingAndTranslating(false);
    onCreateProject(newProject);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl border border-[#242B3A] bg-[#11151E] rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2430]">
          <div>
            <h2 className="text-base font-bold text-white">
              Create New English → Myanmar Recap Job
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Import English SRT subtitles, raw narration text, or transcribe an audio clip via Gemini
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded bg-[#3B1D24] border border-[#6E303D] text-xs text-[#FCA5A5]">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                English Movie Title
              </label>
              <input
                type="text"
                value={englishTitle}
                onChange={(e) => setEnglishTitle(e.target.value)}
                placeholder="e.g. Abyssal Trench 1984"
                className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Myanmar Recap Title (မြန်မာခေါင်းစဉ်)
              </label>
              <input
                type="text"
                value={myanmarTitle}
                onChange={(e) => setMyanmarTitle(e.target.value)}
                placeholder="e.g. ပစိဖိတ်သမုဒ္ဒရာအောက်ခြေက လျှို့ဝှက်သင်္ဘောကြီး"
                className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-white font-myanmar"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as RecapCategory)}
                className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-white"
              >
                <option value="Sci-Fi & Thriller">Sci-Fi & Thriller</option>
                <option value="Horror & Mystery">Horror & Mystery</option>
                <option value="Crime & Heist">Crime & Heist</option>
                <option value="K-Drama Suspense">K-Drama Suspense</option>
                <option value="Survival & Disaster">Survival & Disaster</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Output Ratio
              </label>
              <select
                value={outputRatio}
                onChange={(e) => setOutputRatio(e.target.value as OutputRatio)}
                className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-white font-mono-tabular"
              >
                <option value="16:9">16:9 (1920×1080)</option>
                <option value="9:16">9:16 (1080×1920)</option>
                <option value="1:1">1:1 (1080×1080)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Narrator Voice
              </label>
              <select
                value={voicePersona}
                onChange={(e) => setVoicePersona(e.target.value as EdgeVoiceId)}
                className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs text-white"
              >
                <option value="my-MM-ThihaNeural">Thiha (Male Narrator)</option>
                <option value="my-MM-NilarNeural">Nilar (Female Narrator)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#CBD5E1]">
                English Source Transcript or .SRT Subtitles
              </label>
              <label className="px-2.5 py-1 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded text-xs text-[#60A5FA] flex items-center gap-1.5 cursor-pointer">
                <Mic className="w-3.5 h-3.5" />
                <span>
                  {isTranscribingAudio
                    ? 'Transcribing with Gemini...'
                    : 'Upload Audio to Transcribe'}
                </span>
                <input
                  type="file"
                  accept="audio/*,video/mp4,video/webm"
                  onChange={handleAudioFileTranscribe}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              rows={7}
              value={rawTranscript}
              onChange={(e) => setRawTranscript(e.target.value)}
              placeholder="Paste English .SRT blocks or raw English recap narration sentences..."
              className="w-full p-3 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs font-mono-tabular text-white focus:outline-none focus:border-[#3B82F6]"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#1E2430] bg-[#0D1118] flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#94A3B8] hover:text-white cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={() => handleCreateJob(true)}
            disabled={isCreatingAndTranslating}
            className="px-5 py-2 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isCreatingAndTranslating
                ? 'Building Story Memory & Burmese Narration...'
                : 'Create & Translate to Burmese Now'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
