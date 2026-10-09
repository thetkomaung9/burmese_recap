import React, { useEffect, useState } from 'react';
import {
  X,
  GitBranch,
  Upload,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Terminal,
  ExternalLink,
  Download,
} from 'lucide-react';

interface GitHubSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GitStatusInfo {
  branch: string;
  latestCommit: string;
  remoteUrl: string;
  trackedFileCount: number;
  trackedFiles: string[];
}

export const GitHubSyncModal: React.FC<GitHubSyncModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [repoUrl, setRepoUrl] = useState(
    'https://github.com/thetkomaung9/myanmarmovierecap.git'
  );
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState(
    'feat: RecapMM Studio — English to Myanmar Movie Recap & Smart Sync Web Platform'
  );
  const [githubToken, setGithubToken] = useState('');
  const [statusInfo, setStatusInfo] = useState<GitStatusInfo | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [pushSuccessMsg, setPushSuccessMsg] = useState<string | null>(null);
  const [pushErrorMsg, setPushErrorMsg] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/github/status')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.branch) {
          setStatusInfo(data);
          if (data.remoteUrl) setRepoUrl(data.remoteUrl);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const cliCommands = `git init
git branch -M main
git remote add origin https://github.com/thetkomaung9/myanmarmovierecap.git
git add .
git commit -m "feat: RecapMM Studio English to Myanmar Movie Recap"
git push -u origin main`;

  const handleCopyCli = () => {
    navigator.clipboard.writeText(cliCommands);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleDirectPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPushing) return;
    setIsPushing(true);
    setPushSuccessMsg(null);
    setPushErrorMsg(null);

    try {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubToken,
          repoUrl,
          branch,
          commitMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to push to GitHub');
      }
      setPushSuccessMsg(
        `Successfully pushed branch "${branch}" to ${repoUrl}`
      );
      setGithubToken('');
    } catch (err: unknown) {
      setPushErrorMsg(
        err instanceof Error ? err.message : 'Git push failed'
      );
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl border border-[#242B3A] bg-[#11151E] rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2430] bg-[#0D1118]">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-4 h-4 text-[#60A5FA]" />
            <div>
              <h2 className="text-base font-bold text-white">
                Upload & Sync to GitHub Repository
              </h2>
              <p className="text-xs text-[#94A3B8] font-mono-tabular">
                https://github.com/thetkomaung9/myanmarmovierecap.git
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Local Git Status Card */}
          <div className="border border-[#1E2430] bg-[#0B0E14] rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#4ADE80] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Git Repository Initialized & Committed Locally</span>
              </span>
              <a
                href="https://github.com/thetkomaung9/myanmarmovierecap"
                target="_blank"
                rel="noreferrer"
                className="text-[#60A5FA] hover:underline flex items-center gap-1 font-mono-tabular"
              >
                <span>thetkomaung9/myanmarmovierecap</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {statusInfo && (
              <div className="text-xs font-mono-tabular text-[#94A3B8] space-y-1 pt-1">
                <div>· Branch: {statusInfo.branch}</div>
                <div>· Latest Commit: {statusInfo.latestCommit}</div>
                <div>· Remote Origin: {statusInfo.remoteUrl}</div>
                <div>
                  · Staged & Committed Files: {statusInfo.trackedFileCount} files
                  (including README.md, server.ts, Smart Sync engine, and UI components)
                </div>
              </div>
            )}
          </div>

          {/* Method 1: Direct Push from Server using GitHub Personal Access Token */}
          <form onSubmit={handleDirectPush} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">
                Option 1: Direct 1-Click Push to GitHub
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Enter a GitHub Personal Access Token (Classic token with <code className="text-white">repo</code> scope or Fine-grained token with <code className="text-white">Contents: Read &amp; write</code> on <code className="text-white">thetkomaung9/myanmarmovierecap</code>) to push directly from this workspace. Your token is used only for this single push command and is never saved.
              </p>
            </div>

            {pushErrorMsg && (
              <div className="p-3 rounded-lg bg-[#3B1D24] border border-[#6E303D] text-xs text-[#FCA5A5] font-mono-tabular whitespace-pre-wrap">
                {pushErrorMsg}
              </div>
            )}

            {pushSuccessMsg && (
              <div className="p-3 rounded-lg bg-[#0F291E] border border-[#16A34A]/50 text-xs text-[#4ADE80] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{pushSuccessMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#CBD5E1] mb-1">
                  Repository URL
                </label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs font-mono-tabular text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#CBD5E1] mb-1">
                  Target Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs font-mono-tabular text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#CBD5E1] mb-1">
                GitHub Personal Access Token (ghp_... or github_pat_...)
              </label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-[#0B0E14] border border-[#242B3A] rounded-lg text-xs font-mono-tabular text-white focus:outline-none focus:border-[#3B82F6]"
              />
            </div>

            <button
              type="submit"
              disabled={isPushing}
              className="w-full py-2.5 px-4 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isPushing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Pushing to thetkomaung9/myanmarmovierecap...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Push to github.com/thetkomaung9/myanmarmovierecap.git</span>
                </>
              )}
            </button>
          </form>

          {/* Method 2: AI Studio Toolbar / Local CLI */}
          <div className="pt-4 border-t border-[#1E2430] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#60A5FA]" />
                <span>Option 2: Download Source Archive or Push via Terminal</span>
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href="/api/github/archive"
                  download="myanmarmovierecap-source.tar.gz"
                  className="px-2.5 py-1 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded text-xs text-[#60A5FA] flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .tar.gz</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyCli}
                  className="px-2.5 py-1 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded text-xs text-[#CBD5E1] flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedCmd ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#4ADE80]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Git Commands</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <pre className="p-3.5 rounded-lg bg-[#080A0E] border border-[#1E2430] text-xs font-mono-tabular text-[#CBD5E1] overflow-x-auto leading-relaxed">
              {cliCommands}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
