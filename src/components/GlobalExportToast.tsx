import React from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Film,
  Loader2,
  X,
} from 'lucide-react';
import { MovieRecapProject } from '../data/recapCatalog';

export interface ExportToastState {
  isOpen: boolean;
  isGenerating: boolean;
  progressPercent: number;
  currentStageLabel: string;
  completedFiles: string[];
  project: MovieRecapProject | null;
}

interface GlobalExportToastProps {
  toastState: ExportToastState;
  onDismiss: () => void;
  onDownloadBundleAgain: () => void;
  onDownloadMyanmarSrt: () => void;
  onOpenFinalVideoModal: () => void;
}

export const GlobalExportToast: React.FC<GlobalExportToastProps> = ({
  toastState,
  onDismiss,
  onDownloadBundleAgain,
  onDownloadMyanmarSrt,
  onOpenFinalVideoModal,
}) => {
  if (!toastState.isOpen || !toastState.project) return null;

  const { isGenerating, progressPercent, currentStageLabel, completedFiles, project } =
    toastState;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 w-full max-w-md border border-[#2B3548] bg-[#11151E]/95 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden transition-all duration-200"
    >
      {/* Top Progress Bar Strip */}
      <div className="h-1 w-full bg-[#19202E] overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ${
            progressPercent >= 100 ? 'bg-[#10B981]' : 'bg-[#3B82F6]'
          }`}
          style={{ width: `${Math.min(100, Math.max(4, progressPercent))}%` }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isGenerating ? (
              <Loader2 className="w-4 h-4 text-[#60A5FA] animate-spin shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white">
                  {isGenerating
                    ? 'Generating Project Export Package...'
                    : 'Project Export Package Generated'}
                </h4>
                <span className="text-[11px] font-mono-tabular text-[#60A5FA]">
                  ⌘E · {progressPercent}%
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] font-myanmar truncate max-w-[290px]">
                {project.englishTitle} — {project.myanmarTitle}
              </p>
            </div>
          </div>

          <button
            onClick={onDismiss}
            aria-label="Close export notification"
            className="text-[#64748B] hover:text-white transition-colors cursor-pointer p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Stage Telemetry */}
        <div className="bg-[#0B0E14] border border-[#1E2430] rounded-lg px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono-tabular">
            <span className="text-[#CBD5E1] truncate">{currentStageLabel}</span>
            <span className="text-[#60A5FA] shrink-0 ml-2">
              {project.units.length} units · {project.overlays.outputRatio}
            </span>
          </div>

          {/* Generated File Checklist */}
          {completedFiles.length > 0 && (
            <div className="pt-1 border-t border-[#181E29] grid grid-cols-1 gap-1">
              {completedFiles.map((fileName) => (
                <div
                  key={fileName}
                  className="flex items-center justify-between text-[11px] font-mono-tabular text-[#94A3B8]"
                >
                  <span className="flex items-center gap-1.5 truncate text-[#E2E8F0]">
                    <CheckCircle2 className="w-3 h-3 text-[#4ADE80] shrink-0" />
                    <span className="truncate">{fileName}</span>
                  </span>
                  <span className="text-[10px] text-[#4ADE80] shrink-0">READY</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions when generation finishes */}
        {!isGenerating && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={onDownloadBundleAgain}
                className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded-lg text-[11px] font-medium text-[#E2E8F0] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-[#60A5FA]" />
                <span>Save Bundle (.json)</span>
              </button>
              <button
                onClick={onDownloadMyanmarSrt}
                className="px-2.5 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded-lg text-[11px] font-medium text-[#E2E8F0] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3 h-3 text-[#60A5FA]" />
                <span>Save .SRT</span>
              </button>
            </div>

            <button
              onClick={onOpenFinalVideoModal}
              className="px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg text-[11px] font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Film className="w-3 h-3" />
              <span>Render Video (.webm)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
