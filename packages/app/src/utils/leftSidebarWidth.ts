export const DEFAULT_LEFT_SIDEBAR_WIDTH = 250;
export const MIN_LEFT_SIDEBAR_WIDTH = 180;
export const LEFT_SIDEBAR_DRAG_COLLAPSE_WIDTH = MIN_LEFT_SIDEBAR_WIDTH / 2;
export const MAX_LEFT_SIDEBAR_WIDTH = 520;
export const MIN_CANVAS_WIDTH_WITH_LEFT_SIDEBAR = 420;
export const LEFT_SIDEBAR_ATTACHED_CONTROL_GAP = 25;

function getViewportWidth() {
  return typeof window === 'undefined'
    ? MAX_LEFT_SIDEBAR_WIDTH + MIN_CANVAS_WIDTH_WITH_LEFT_SIDEBAR
    : window.innerWidth;
}

export function clampLeftSidebarWidth(width: number, viewportWidth = getViewportWidth()): number {
  const maxWidth = Math.max(
    MIN_LEFT_SIDEBAR_WIDTH,
    Math.min(MAX_LEFT_SIDEBAR_WIDTH, viewportWidth - MIN_CANVAS_WIDTH_WITH_LEFT_SIDEBAR),
  );
  const normalizedWidth = Number.isFinite(width) ? Math.round(width) : DEFAULT_LEFT_SIDEBAR_WIDTH;

  return Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.min(maxWidth, normalizedWidth));
}

export function shouldCollapseLeftSidebarDrag(width: number): boolean {
  return Number.isFinite(width) && width <= LEFT_SIDEBAR_DRAG_COLLAPSE_WIDTH;
}

export function getLeftSidebarAttachedControlOffset(width: number): number {
  return clampLeftSidebarWidth(width) + LEFT_SIDEBAR_ATTACHED_CONTROL_GAP;
}
