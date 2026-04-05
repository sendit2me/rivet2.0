export const FULLSCREEN_OUTPUT_SEARCH_PROVIDER_ATTRIBUTE = 'data-fullscreen-output-search-provider';
export const FULLSCREEN_OUTPUT_SEARCH_MATCH_ATTRIBUTE = 'data-fullscreen-output-search-match';
export const FULLSCREEN_OUTPUT_SEARCH_MATCH_CLASS = 'fullscreen-output-search-match';
export const FULLSCREEN_OUTPUT_SEARCH_MATCH_ACTIVE_CLASS = 'fullscreen-output-search-match-active';

export type FullscreenOutputSearchProvider = {
  id: string;
  rootElement: HTMLElement;
  getMatchOffsets(query: string): number[];
  activateMatch(localMatchIndex: number): void;
  clearActiveMatch(): void;
};

export type FullscreenOutputSearchBlock =
  | { kind: 'dom'; rootElement: HTMLElement; textNodes: Text[]; text: string }
  | { kind: 'provider'; providerId: string; rootElement: HTMLElement };

type FullscreenOutputSearchToken =
  | {
      kind: 'text';
      textNode: Text;
      text: string;
    }
  | {
      kind: 'separator';
    }
  | {
      kind: 'provider';
      providerId: string;
      rootElement: HTMLElement;
    };

type TextNodeHighlightRange = {
  startOffset: number;
  endOffset: number;
  active: boolean;
};

export function buildFullscreenOutputSearchBlocks(
  rootElement: HTMLElement,
  providersById: ReadonlyMap<string, FullscreenOutputSearchProvider>,
): FullscreenOutputSearchBlock[] {
  const tokens: FullscreenOutputSearchToken[] = [];

  for (const childNode of Array.from(rootElement.childNodes)) {
    collectFullscreenOutputSearchTokens(childNode, providersById, tokens);
  }

  const blocks: FullscreenOutputSearchBlock[] = [];
  let pendingTextNodes: Text[] = [];
  let pendingText = '';

  const flushPendingTextNodes = () => {
    if (pendingTextNodes.length === 0) {
      return;
    }

    blocks.push({
      kind: 'dom',
      rootElement: pendingTextNodes[0]?.parentElement ?? rootElement,
      textNodes: pendingTextNodes,
      text: pendingText,
    });

    pendingTextNodes = [];
    pendingText = '';
  };

  for (const token of tokens) {
    if (token.kind === 'separator') {
      flushPendingTextNodes();
      continue;
    }

    if (token.kind === 'provider') {
      flushPendingTextNodes();
      blocks.push({
        kind: 'provider',
        providerId: token.providerId,
        rootElement: token.rootElement,
      });
      continue;
    }

    pendingTextNodes.push(token.textNode);
    pendingText += token.text;
  }

  flushPendingTextNodes();

  return blocks;
}

export function clearFullscreenOutputSearchHighlights(rootElement: HTMLElement): void {
  const highlightElements = Array.from(
    rootElement.querySelectorAll<HTMLElement>(`[${FULLSCREEN_OUTPUT_SEARCH_MATCH_ATTRIBUTE}="true"]`),
  );

  for (const highlightElement of highlightElements) {
    const parentNode = highlightElement.parentNode;
    if (!parentNode) {
      continue;
    }

    while (highlightElement.firstChild) {
      parentNode.insertBefore(highlightElement.firstChild, highlightElement);
    }

    parentNode.removeChild(highlightElement);
    parentNode.normalize?.();
  }
}

export function collectFullscreenOutputSearchTextNodes(rootElement: HTMLElement): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);

  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      textNodes.push(currentNode as Text);
    }

    currentNode = walker.nextNode();
  }

  return textNodes;
}

export function applyFullscreenOutputSearchHighlights(args: {
  textNodes: readonly Text[];
  matchOffsets: readonly number[];
  matchLength: number;
  activeMatchIndex: number | undefined;
}): HTMLElement | null {
  const { textNodes, matchOffsets, matchLength, activeMatchIndex } = args;

  if (matchOffsets.length === 0 || matchLength <= 0) {
    return null;
  }

  const textNodePositions = textNodes.map((textNode) => ({
    textNode,
    startOffset: 0,
    endOffset: 0,
    text: textNode.textContent ?? '',
  }));

  let runningOffset = 0;
  textNodePositions.forEach((position) => {
    position.startOffset = runningOffset;
    runningOffset += position.text.length;
    position.endOffset = runningOffset;
  });

  const rangesByTextNode = new Map<Text, TextNodeHighlightRange[]>();

  matchOffsets.forEach((matchOffset, localMatchIndex) => {
    const matchEndOffset = matchOffset + matchLength;

    for (const position of textNodePositions) {
      const overlapStart = Math.max(matchOffset, position.startOffset);
      const overlapEnd = Math.min(matchEndOffset, position.endOffset);

      if (overlapStart >= overlapEnd) {
        continue;
      }

      const nodeRanges = rangesByTextNode.get(position.textNode) ?? [];
      nodeRanges.push({
        startOffset: overlapStart - position.startOffset,
        endOffset: overlapEnd - position.startOffset,
        active: activeMatchIndex === localMatchIndex,
      });
      rangesByTextNode.set(position.textNode, nodeRanges);
    }
  });

  let activeHighlightElement: HTMLElement | null = null;

  for (const [textNode, ranges] of rangesByTextNode) {
    const sortedRanges = ranges.sort((left, right) => left.startOffset - right.startOffset);
    const originalText = textNode.textContent ?? '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const range of sortedRanges) {
      if (range.startOffset > cursor) {
        fragment.appendChild(document.createTextNode(originalText.slice(cursor, range.startOffset)));
      }

      const highlightElement = document.createElement('span');
      highlightElement.setAttribute(FULLSCREEN_OUTPUT_SEARCH_MATCH_ATTRIBUTE, 'true');
      highlightElement.className = range.active
        ? `${FULLSCREEN_OUTPUT_SEARCH_MATCH_CLASS} ${FULLSCREEN_OUTPUT_SEARCH_MATCH_ACTIVE_CLASS}`
        : FULLSCREEN_OUTPUT_SEARCH_MATCH_CLASS;
      highlightElement.textContent = originalText.slice(range.startOffset, range.endOffset);
      fragment.appendChild(highlightElement);

      if (range.active && !activeHighlightElement) {
        activeHighlightElement = highlightElement;
      }

      cursor = range.endOffset;
    }

    if (cursor < originalText.length) {
      fragment.appendChild(document.createTextNode(originalText.slice(cursor)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return activeHighlightElement;
}

export function isFullscreenOutputSearchBoundaryTagName(tagName: string): boolean {
  return tagName === 'BR' || FULLSCREEN_OUTPUT_SEARCH_BOUNDARY_TAGS.has(tagName);
}

function collectFullscreenOutputSearchTokens(
  node: Node,
  providersById: ReadonlyMap<string, FullscreenOutputSearchProvider>,
  tokens: FullscreenOutputSearchToken[],
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text;
    if ((textNode.textContent ?? '').length > 0) {
      tokens.push({
        kind: 'text',
        textNode,
        text: textNode.textContent ?? '',
      });
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const providerId = element.getAttribute(FULLSCREEN_OUTPUT_SEARCH_PROVIDER_ATTRIBUTE);

  if (providerId) {
    if (providersById.has(providerId)) {
      tokens.push({
        kind: 'provider',
        providerId,
        rootElement: element,
      });
    }
    return;
  }

  const isBoundaryElement = isFullscreenOutputSearchBoundaryTagName(element.tagName);
  if (isBoundaryElement) {
    tokens.push({
      kind: 'separator',
    });
  }

  for (const childNode of Array.from(element.childNodes)) {
    collectFullscreenOutputSearchTokens(childNode, providersById, tokens);
  }

  if (isBoundaryElement) {
    tokens.push({
      kind: 'separator',
    });
  }
}

const FULLSCREEN_OUTPUT_SEARCH_BOUNDARY_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'DL',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);
