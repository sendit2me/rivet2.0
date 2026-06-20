import type { OverlayKey } from '../state/ui.js';

export type WorkspaceTabKey = OverlayKey | 'welcomeScreen';

export type WorkspaceTabDefinition = {
  key: WorkspaceTabKey;
  label: string;
  className: string;
  targetOverlay: OverlayKey | undefined;
};

export const WELCOME_SCREEN_TAB: WorkspaceTabDefinition = {
  key: 'welcomeScreen',
  label: 'Welcome screen',
  className: 'welcome-screen-menu',
  targetOverlay: undefined,
};

export const WORKSPACE_TABS: WorkspaceTabDefinition[] = [
  { key: 'trivet', label: 'Trivet Tests', className: 'trivet-menu', targetOverlay: 'trivet' },
  { key: 'chatViewer', label: 'Chat Viewer', className: 'chat-viewer-menu', targetOverlay: 'chatViewer' },
  { key: 'dataStudio', label: 'Data Studio', className: 'data-studio', targetOverlay: 'dataStudio' },
];

export function getVisibleWorkspaceTabs({
  chatViewerAvailable,
  welcomeScreenAvailable = false,
}: {
  chatViewerAvailable: boolean;
  welcomeScreenAvailable?: boolean;
}): WorkspaceTabDefinition[] {
  const workspaceTabs: WorkspaceTabDefinition[] = WORKSPACE_TABS.filter((tab) => {
    if (tab.key === 'chatViewer') {
      return chatViewerAvailable;
    }

    return true;
  });

  if (welcomeScreenAvailable) {
    workspaceTabs.unshift(WELCOME_SCREEN_TAB);
  }

  return workspaceTabs;
}
