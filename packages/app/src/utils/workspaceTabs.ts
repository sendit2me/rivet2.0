import type { OverlayKey } from '../state/ui.js';

export type WorkspaceTabDefinition = { key: OverlayKey; label: string; className: string };

export const WORKSPACE_TABS: WorkspaceTabDefinition[] = [
  { key: 'trivet', label: 'Trivet Tests', className: 'trivet-menu' },
  { key: 'chatViewer', label: 'Chat Viewer', className: 'chat-viewer-menu' },
  { key: 'dataStudio', label: 'Data Studio', className: 'data-studio' },
];

export const PROMPT_DESIGNER_TAB: WorkspaceTabDefinition = {
  key: 'promptDesigner',
  label: 'Prompt Designer',
  className: 'prompt-designer-menu',
};

export function getVisibleWorkspaceTabs({
  chatViewerAvailable,
  openOverlay,
}: {
  chatViewerAvailable: boolean;
  openOverlay: OverlayKey | undefined;
}): WorkspaceTabDefinition[] {
  const workspaceTabs = WORKSPACE_TABS.filter((tab) => {
    if (tab.key === 'chatViewer') {
      return chatViewerAvailable;
    }

    return true;
  });

  if (openOverlay !== 'promptDesigner') {
    return workspaceTabs;
  }

  return [...workspaceTabs, PROMPT_DESIGNER_TAB];
}
