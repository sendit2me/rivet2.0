export type GraphSearchPanelMaxHeightOptions = {
  bottomMargin: number;
  minHeight: number;
  panelTop: number;
  viewportHeight: number;
};

export type GraphSearchPanelResizeOptions = {
  maxHeight: number;
  minHeight: number;
  pointerY: number;
  startHeight: number;
  startY: number;
};

export function getGraphSearchPanelMaxHeight({
  bottomMargin,
  minHeight,
  panelTop,
  viewportHeight,
}: GraphSearchPanelMaxHeightOptions): number {
  return Math.max(minHeight, viewportHeight - panelTop - bottomMargin);
}

export function getNextGraphSearchPanelHeight({
  maxHeight,
  minHeight,
  pointerY,
  startHeight,
  startY,
}: GraphSearchPanelResizeOptions): number {
  return Math.min(maxHeight, Math.max(minHeight, startHeight + pointerY - startY));
}
