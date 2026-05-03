import type { OverlayKey } from '../state/ui.js';

export type WorkspaceTabDefinition = { key: OverlayKey; label: string; className: string };

export const WORKSPACE_TABS: WorkspaceTabDefinition[] = [
  { key: 'trivet', label: 'Trivet Tests', className: 'trivet-menu' },
  { key: 'chatViewer', label: 'Chat Viewer', className: 'chat-viewer-menu' },
  { key: 'dataStudio', label: 'Data Studio', className: 'data-studio' },
  { key: 'community', label: 'Community', className: 'community' },
];

export const PROMPT_DESIGNER_TAB: WorkspaceTabDefinition = {
  key: 'promptDesigner',
  label: 'Prompt Designer',
  className: 'prompt-designer-menu',
};

export function getVisibleWorkspaceTabs({
  chatViewerAvailable,
  communityEnabled,
  openOverlay,
}: {
  chatViewerAvailable: boolean;
  communityEnabled: boolean;
  openOverlay: OverlayKey | undefined;
}): WorkspaceTabDefinition[] {
  const workspaceTabs = WORKSPACE_TABS.filter((tab) => {
    if (tab.key === 'chatViewer') {
      return chatViewerAvailable;
    }

    if (tab.key === 'community') {
      return communityEnabled;
    }

    return true;
  });

  if (openOverlay !== 'promptDesigner') {
    return workspaceTabs;
  }

  const communityTabIndex = workspaceTabs.findIndex((tab) => tab.key === 'community');
  const insertionIndex = communityTabIndex === -1 ? workspaceTabs.length : communityTabIndex;
  return [
    ...workspaceTabs.slice(0, insertionIndex),
    PROMPT_DESIGNER_TAB,
    ...workspaceTabs.slice(insertionIndex),
  ];
}
