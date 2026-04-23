export const DEBUGGER_PANEL_WIDTH = 400;
export const DEBUGGER_PANEL_MARGIN = 16;
export const DEBUGGER_PANEL_OFFSET = 4;

export type DebuggerPanelAnchorBounds = {
  bottom: number;
  right: number;
};

export function resolveDebuggerPanelPosition({
  anchor,
  viewportWidth,
}: {
  anchor?: DebuggerPanelAnchorBounds;
  viewportWidth: number;
}) {
  if (!anchor || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return {
      right: 20,
      top: 'calc(56px + var(--project-selector-height))',
    };
  }

  const maxLeft = Math.max(DEBUGGER_PANEL_MARGIN, viewportWidth - DEBUGGER_PANEL_WIDTH - DEBUGGER_PANEL_MARGIN);

  return {
    left: Math.min(Math.max(anchor.right - DEBUGGER_PANEL_WIDTH, DEBUGGER_PANEL_MARGIN), maxLeft),
    top: Math.max(anchor.bottom + DEBUGGER_PANEL_OFFSET, DEBUGGER_PANEL_MARGIN),
  };
}
