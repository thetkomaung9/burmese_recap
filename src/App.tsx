/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  INITIAL_RECAP_CATALOG,
  MovieRecapProject,
} from './data/recapCatalog';
import { CatalogDiscoveryView } from './components/CatalogDiscoveryView';
import { ProductionStudioView } from './components/ProductionStudioView';
import { SyncWorkbenchView } from './components/SyncWorkbenchView';
import { StoryMemoryView } from './components/StoryMemoryView';
import { NewRecapJobModal } from './components/NewRecapJobModal';
import { GitHubSyncModal } from './components/GitHubSyncModal';
import { GitBranch, Upload } from 'lucide-react';

type ActiveTab = 'catalog' | 'studio' | 'workbench' | 'memory';

export default function App() {
  const [projects, setProjects] = useState<MovieRecapProject[]>(
    INITIAL_RECAP_CATALOG
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('catalog');
  const [activeProjectId, setActiveProjectId] = useState<string>(
    INITIAL_RECAP_CATALOG[0].id
  );
  const [studioJumpSegmentId, setStudioJumpSegmentId] = useState<
    number | undefined
  >(undefined);
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState<boolean>(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState<boolean>(false);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const handleUpdateProject = (updated: MovieRecapProject) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
  };

  const handleCreateProject = (newProj: MovieRecapProject) => {
    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setActiveTab('studio');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] text-[#E7EAF0]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-[#1E2430] bg-[#0B0E14]/95 sticky top-0 z-40 backdrop-blur-xs">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#catalog"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('catalog');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          RecapMM Studio
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-[#94A3B8] overflow-x-auto">
          <a
            href="#catalog"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('catalog');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'catalog'
                ? 'text-white underline underline-offset-8 decoration-[#3B82F6] decoration-2'
                : 'hover:text-white'
            }`}
          >
            Recap Catalog
          </a>
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('studio');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'studio'
                ? 'text-white underline underline-offset-8 decoration-[#3B82F6] decoration-2'
                : 'hover:text-white'
            }`}
          >
            Production Studio
          </a>
          <a
            href="#workbench"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workbench');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'workbench'
                ? 'text-white underline underline-offset-8 decoration-[#3B82F6] decoration-2'
                : 'hover:text-white'
            }`}
          >
            Sync Workbench
          </a>
          <a
            href="#memory"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('memory');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'memory'
                ? 'text-white underline underline-offset-8 decoration-[#3B82F6] decoration-2'
                : 'hover:text-white'
            }`}
          >
            Story Memory
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setIsNewJobModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#3B82F6] rounded-lg hover:bg-[#2563EB] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Recap Job
          </button>
        </div>
      </header>

      {/* GitHub Repository Sync Sub-Bar for https://github.com/thetkomaung9/myanmarmovierecap.git */}
      <div className="border-b border-[#1E2430] bg-[#0E131C] px-6 py-2.5">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#CBD5E1] font-mono-tabular">
            <GitBranch className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
            <span>Git Remote Ready:</span>
            <span className="text-white font-semibold">
              https://github.com/thetkomaung9/myanmarmovierecap.git
            </span>
            <span className="text-[#4ADE80] hidden sm:inline">
              (branch: main)
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href="/api/github/archive"
              download="myanmarmovierecap-source.tar.gz"
              className="px-3 py-1 bg-[#19202E] hover:bg-[#232C3F] border border-[#2B3548] rounded-md text-[#CBD5E1] transition-colors cursor-pointer"
            >
              Download Source (.tar.gz)
            </a>
            <button
              onClick={() => setIsGitHubModalOpen(true)}
              className="px-3 py-1 bg-[#1D4ED8] hover:bg-[#2563EB] text-white font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload / Push to GitHub</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'catalog' && (
          <CatalogDiscoveryView
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProjectForStudio={(projectId, jumpSegmentId) => {
              setActiveProjectId(projectId);
              setStudioJumpSegmentId(jumpSegmentId);
              setActiveTab('studio');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectProjectForWorkbench={(projectId) => {
              setActiveProjectId(projectId);
              setActiveTab('workbench');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onUpdateProject={handleUpdateProject}
            onOpenNewJobModal={() => setIsNewJobModalOpen(true)}
          />
        )}

        {activeTab === 'studio' && activeProject && (
          <ProductionStudioView
            project={activeProject}
            projects={projects}
            initialSegmentId={studioJumpSegmentId}
            onSelectProject={(id) => {
              setActiveProjectId(id);
              setStudioJumpSegmentId(undefined);
            }}
            onUpdateProject={handleUpdateProject}
            onOpenNewJobModal={() => setIsNewJobModalOpen(true)}
          />
        )}

        {activeTab === 'workbench' && activeProject && (
          <SyncWorkbenchView
            project={activeProject}
            onUpdateProject={handleUpdateProject}
            onOpenInStudio={(segId) => {
              setStudioJumpSegmentId(segId);
              setActiveTab('studio');
            }}
          />
        )}

        {activeTab === 'memory' && activeProject && (
          <StoryMemoryView
            project={activeProject}
            onUpdateProject={handleUpdateProject}
          />
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-[#1E2430] bg-[#0B0E14] px-6 py-6 mt-12">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <div>
            RecapMM Studio — English to Myanmar Movie Narrator & 30fps Smart Sync Platform
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('catalog')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Recap Catalog
            </button>
            <button
              onClick={() => setActiveTab('studio')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Production Studio
            </button>
            <button
              onClick={() => setActiveTab('workbench')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Sync Workbench
            </button>
            <button
              onClick={() => setActiveTab('memory')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Story Memory
            </button>
            <button
              onClick={() => setIsGitHubModalOpen(true)}
              className="text-[#60A5FA] hover:text-white transition-colors cursor-pointer font-mono-tabular"
            >
              GitHub Sync (thetkomaung9/myanmarmovierecap)
            </button>
          </div>
        </div>
      </footer>

      <NewRecapJobModal
        isOpen={isNewJobModalOpen}
        onClose={() => setIsNewJobModalOpen(false)}
        onCreateProject={handleCreateProject}
      />

      <GitHubSyncModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
      />
    </div>
  );
}
