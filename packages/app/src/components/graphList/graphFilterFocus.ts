export const GRAPH_FILTER_INPUT_MARKER = { 'data-graph-filter-input': 'true' } as const;

const GRAPH_FILTER_INPUT_SELECTOR = '[data-graph-filter-input="true"]';

export function blurFocusedGraphFilterInput(ownerDocument?: Document): void {
  const resolvedDocument = ownerDocument ?? (typeof document !== 'undefined' ? document : undefined);

  if (!resolvedDocument) {
    return;
  }

  const activeElement = resolvedDocument.activeElement;
  const HTMLElementCtor =
    resolvedDocument.defaultView?.HTMLElement ?? (typeof HTMLElement !== 'undefined' ? HTMLElement : undefined);

  if (HTMLElementCtor && activeElement instanceof HTMLElementCtor && activeElement.matches(GRAPH_FILTER_INPUT_SELECTOR)) {
    activeElement.blur();
  }
}
