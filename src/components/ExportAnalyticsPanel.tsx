import React, { useMemo } from 'react';
import {
  BarChart3,
  Clock,
  Download,
  FileCode2,
  FileText,
  Film,
  HardDrive,
  Trash2,
  Video,
} from 'lucide-react';
import { MovieRecapProject } from '../data/recapCatalog';
import {
  ExportFormatType,
  ExportHistoryEntry,
  clearExportHistoryForProject,
  formatBytesReadable,
  formatExportTimestamp,
} from '../utils/exportHistoryStore';

interface ExportAnalyticsPanelProps {
  project: MovieRecapProject;
  history: ExportHistoryEntry[];
  onSwitchToExportTab: () => void;
}

const FORMAT_LABELS: Record<ExportFormatType, string> = {
  VIDEO_WEBM: 'Final Sync Video (.webm)',
  VEO_MP4: 'Veo 3 Scene (.mp4)',
  PACKAGE_JSON: 'Smart Sync Bundle (.json)',
  SUBTITLE_SRT: 'Myanmar Subtitles (.srt)',
};

const FORMAT_BAR_COLORS: Record<ExportFormatType, string> = {
  VIDEO_WEBM: 'bg-[#3B82F6]',
  VEO_MP4: 'bg-[#8B5CF6]',
  PACKAGE_JSON: 'bg-[#10B981]',
  SUBTITLE_SRT: 'bg-[#F59E0B]',
};

const FORMAT_TEXT_COLORS: Record<ExportFormatType, string> = {
  VIDEO_WEBM: 'text-[#60A5FA]',
  VEO_MP4: 'text-[#C084FC]',
  PACKAGE_JSON: 'text-[#4ADE80]',
  SUBTITLE_SRT: 'text-[#FBBF24]',
};

export const ExportAnalyticsPanel: React.FC<ExportAnalyticsPanelProps> = ({
  project,
  history,
  onSwitchToExportTab,
}) => {
  const stats = useMemo(() => {
    const totalCount = history.length;
    const totalBytes = history.reduce((acc, item) => acc + item.fileSizeBytes, 0);
    const avgBytes = totalCount > 0 ? Math.round(totalBytes / totalCount) : 0;
    const maxBytes =
      history.reduce((max, item) => Math.max(max, item.fileSizeBytes), 0) || 1;
    const latestEntry = history[0] || null;

    return {
      totalCount,
      totalBytes,
      avgBytes,
      maxBytes,
      latestEntry,
    };
  }, [history]);

  const handleDownloadCsvReport = () => {
    const header = [
      'Export ID',
      'Timestamp (ISO)',
      'Project ID',
      'File Name',
      'Format',
      'Output Ratio',
      'Units',
      'File Size (Bytes)',
      'File Size (Readable)',
    ].join(',');

    const rows = history.map((entry) =>
      [
        entry.id,
        entry.timestampIso,
        entry.projectId,
        `"${entry.fileName.replace(/"/g, '""')}"`,
        entry.format,
        entry.outputRatio,
        entry.unitCount,
        entry.fileSizeBytes,
        formatBytesReadable(entry.fileSizeBytes),
      ].join(',')
    );

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id}_export_analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFormatIcon = (format: ExportFormatType) => {
    if (format === 'VIDEO_WEBM')
      return <Film className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />;
    if (format === 'VEO_MP4')
      return <Video className="w-3.5 h-3.5 text-[#C084FC] shrink-0" />;
    if (format === 'PACKAGE_JSON')
      return <FileCode2 className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-mono-tabular text-[#60A5FA]">
            Active Project Telemetry · {project.englishTitle}
          </div>
          <h2 className="text-lg font-bold text-white font-myanmar">
            {project.myanmarTitle} — Export History & File Size Analytics
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Tracks every rendered video, Veo 3 scene, Smart Sync JSON package, and Myanmar subtitle export for this project (including global <kbd className="px-1 py-0.5 bg-[#0B0E14] border border-[#242B3A] rounded text-[10px] font-mono-tabular text-white">⌘E</kbd> exports).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDownloadCsvReport}
                className="px-3 py-1.5 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded-lg text-xs text-[#CBD5E1] flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={() => clearExportHistoryForProject(project.id)}
                className="px-3 py-1.5 bg-[#19202E] hover:bg-[#3B1D24] border border-[#2B3548] hover:border-[#6E303D] rounded-lg text-xs text-[#94A3B8] hover:text-[#FCA5A5] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
            <span>Total Exports</span>
            <BarChart3 className="w-3.5 h-3.5 text-[#60A5FA]" />
          </div>
          <div className="text-xl font-bold font-mono-tabular text-white">
            {stats.totalCount}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono-tabular">
            {project.units.length} atomic units
          </div>
        </div>

        <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
            <span>Total Volume</span>
            <HardDrive className="w-3.5 h-3.5 text-[#4ADE80]" />
          </div>
          <div className="text-xl font-bold font-mono-tabular text-white">
            {formatBytesReadable(stats.totalBytes)}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono-tabular">
            Avg {formatBytesReadable(stats.avgBytes)} / file
          </div>
        </div>

        <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
            <span>Latest File Size</span>
            <Film className="w-3.5 h-3.5 text-[#C084FC]" />
          </div>
          <div className="text-xl font-bold font-mono-tabular text-white">
            {stats.latestEntry
              ? formatBytesReadable(stats.latestEntry.fileSizeBytes)
              : '—'}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono-tabular truncate">
            {stats.latestEntry
              ? FORMAT_LABELS[stats.latestEntry.format]
              : 'No exports yet'}
          </div>
        </div>

        <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
            <span>Latest Timestamp</span>
            <Clock className="w-3.5 h-3.5 text-[#FBBF24]" />
          </div>
          <div className="text-sm font-bold font-mono-tabular text-white pt-1">
            {stats.latestEntry
              ? formatExportTimestamp(stats.latestEntry.timestampIso).split(
                  ' '
                )[1]
              : '—'}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono-tabular">
            {stats.latestEntry
              ? formatExportTimestamp(stats.latestEntry.timestampIso).split(
                  ' '
                )[0]
              : '—'}
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl p-8 text-center space-y-3">
          <p className="text-xs text-[#94A3B8]">
            No exports recorded for <span className="text-white font-semibold">{project.englishTitle}</span> yet.
          </p>
          <button
            type="button"
            onClick={onSwitchToExportTab}
            className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Go to Video & Package Export
          </button>
        </div>
      ) : (
        <>
          {/* File Size Comparison Bar Chart (Recent 8 Exports) */}
          <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                Recent Export File Size Distribution (Log-Scaled Visual Bars)
              </span>
              <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
                Showing latest {Math.min(8, history.length)} exports
              </span>
            </div>

            <div className="space-y-2">
              {history.slice(0, 8).map((entry) => {
                // Use square-root scaling so both KB JSON/SRT and MB Video files have clear visual bars
                const ratioPercent = Math.max(
                  6,
                  Math.min(
                    100,
                    Math.round(
                      (Math.sqrt(entry.fileSizeBytes) /
                        Math.sqrt(stats.maxBytes)) *
                        100
                    )
                  )
                );

                return (
                  <div key={entry.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                      <span className="flex items-center gap-1.5 text-[#E2E8F0] truncate max-w-[65%]">
                        {renderFormatIcon(entry.format)}
                        <span className="truncate">{entry.fileName}</span>
                      </span>
                      <span className="text-[#94A3B8] shrink-0">
                        {formatExportTimestamp(entry.timestampIso)} ·{' '}
                        <strong className="text-white">
                          {formatBytesReadable(entry.fileSizeBytes)}
                        </strong>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#161C28] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          FORMAT_BAR_COLORS[entry.format]
                        }`}
                        style={{ width: `${ratioPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chronological Export Timestamp & File Size Log Table */}
          <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1E2430] bg-[#0E131D] flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                Chronological Export Timestamp & Size Log
              </span>
              <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
                {history.length} record(s)
              </span>
            </div>

            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1E2430] text-[11px] font-mono-tabular text-[#94A3B8] bg-[#0B0E14]">
                    <th className="py-2.5 px-3.5">Timestamp</th>
                    <th className="py-2.5 px-3.5">File Name</th>
                    <th className="py-2.5 px-3.5">Format</th>
                    <th className="py-2.5 px-3.5">Ratio</th>
                    <th className="py-2.5 px-3.5 text-right">File Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#181E29] font-mono-tabular">
                  {history.map((entry) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-[#131926] transition-colors"
                    >
                      <td className="py-2.5 px-3.5 text-[#CBD5E1] whitespace-nowrap">
                        {formatExportTimestamp(entry.timestampIso)}
                      </td>
                      <td className="py-2.5 px-3.5 text-white max-w-[230px] truncate">
                        {entry.fileName}
                      </td>
                      <td
                        className={`py-2.5 px-3.5 whitespace-nowrap ${
                          FORMAT_TEXT_COLORS[entry.format]
                        }`}
                      >
                        {FORMAT_LABELS[entry.format]}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#94A3B8] whitespace-nowrap">
                        {entry.outputRatio}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-white whitespace-nowrap">
                        {formatBytesReadable(entry.fileSizeBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
