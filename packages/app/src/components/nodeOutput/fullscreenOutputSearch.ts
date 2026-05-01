export const PROVIDER_ATTRIBUTE = 'data-fullscreen-output-search-provider';
export const MATCH_ATTRIBUTE = 'data-fullscreen-output-search-match';
export const MATCH_INDEX_ATTRIBUTE = 'data-match-index';
export const MATCH_CLASS = 'fullscreen-output-search-match';
export const MATCH_ACTIVE_CLASS = 'fullscreen-output-search-match-active';

export type SearchProvider = {
  id: string;
  rootElement: HTMLElement;
  getMatchOffsets(query: string): number[];
  activateMatch(localMatchIndex: number): void;
  clearActiveMatch(): void;
};

export type SearchBlock =
  | {
      kind: 'text';
      textNodes: Text[];
      text: string;
      matches: number[];
    }
  | {
      kind: 'provider';
      providerId: string;
      matches: number[];
    };

export type SearchMatch =
  | {
      kind: 'text';
      blockIndex: number;
      localMatchIndex: number;
      startOffset: number;
      endOffset: number;
    }
  | {
      kind: 'provider';
      blockIndex: number;
      providerId: string;
      localMatchIndex: number;
      startOffset: number;
      endOffset: number;
    };

type TextNodeRange = {
  startOffset: number;
  endOffset: number;
  matchIndex: number;
};

export function findMatchOffsets(text: string, query: string): number[] {
  const normalizedQuery = query.toLocaleLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const normalizedText = text.toLocaleLowerCase();
  const offsets: number[] = [];

  let searchFromIndex = 0;
  while (searchFromIndex < normalizedText.length) {
    const nextMatchIndex = normalizedText.indexOf(normalizedQuery, searchFromIndex);
    if (nextMatchIndex === -1) {
      break;
    }

    offsets.push(nextMatchIndex);
    searchFromIndex = nextMatchIndex + normalizedQuery.length;
  }

  return offsets;
}

export function wrapMatchIndex(totalMatchCount: number, currentMatchIndex: number, delta: 1 | -1): number {
  if (totalMatchCount <= 0) {
    return 0;
  }

  return (currentMatchIndex + delta + totalMatchCount) % totalMatchCount;
}

export function projectMatches(blocks: readonly SearchBlock[], query: string): SearchMatch[] {
  const matchLength = query.toLocaleLowerCase().length;

  if (matchLength === 0) {
    return [];
  }

  const matches: SearchMatch[] = [];

  blocks.forEach((block, blockIndex) => {
    block.matches.forEach((startOffset, localMatchIndex) => {
      if (block.kind === 'provider') {
        matches.push({
          kind: 'provider',
          blockIndex,
          providerId: block.providerId,
          localMatchIndex,
          startOffset,
          endOffset: startOffset + matchLength,
        });
        return;
      }

      matches.push({
        kind: 'text',
        blockIndex,
        localMatchIndex,
        startOffset,
        endOffset: startOffset + matchLength,
      });
    });
  });

  return matches;
}

export function buildSearchBlocks(
  rootElement: HTMLElement,
  providersById: ReadonlyMap<string, SearchProvider>,
  query: string,
): SearchBlock[] {
  const blocks: SearchBlock[] = [];
  let pendingTextNodes: Text[] = [];
  let pendingText = '';

  const flushTextBlock = () => {
    if (pendingTextNodes.length === 0) {
      return;
    }

    blocks.push({
      kind: 'text',
      textNodes: pendingTextNodes,
      text: pendingText,
      matches: findMatchOffsets(pendingText, query),
    });

    pendingTextNodes = [];
    pendingText = '';
  };

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.length > 0) {
        pendingTextNodes.push(node as Text);
        pendingText += text;
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const providerId = element.getAttribute(PROVIDER_ATTRIBUTE);
    if (providerId) {
      flushTextBlock();

      const provider = providersById.get(providerId);
      if (provider) {
        blocks.push({
          kind: 'provider',
          providerId,
          matches: provider.getMatchOffsets(query),
        });
      }

      return;
    }

    const isBoundaryElement = isBoundaryTag(element.tagName);
    if (isBoundaryElement) {
      flushTextBlock();

      if (element.tagName === 'BR') {
        return;
      }
    }

    for (const childNode of Array.from(element.childNodes)) {
      visit(childNode);
    }

    if (isBoundaryElement) {
      flushTextBlock();
    }
  };

  for (const childNode of Array.from(rootElement.childNodes)) {
    visit(childNode);
  }

  flushTextBlock();

  return blocks;
}

export function clearHighlights(rootElement: HTMLElement): void {
  const highlightElements = Array.from(rootElement.querySelectorAll<HTMLElement>(`[${MATCH_ATTRIBUTE}="true"]`));

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

export function collectTextNodes(rootElement: HTMLElement): Text[] {
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

export function applyHighlights(args: {
  textNodes: readonly Text[];
  matchOffsets: readonly number[];
  matchLength: number;
  matchIndices: readonly number[];
  activeMatchIndex?: number;
  includeMatchIndexAttribute?: boolean;
}): HTMLElement | null {
  const {
    textNodes,
    matchOffsets,
    matchLength,
    matchIndices,
    activeMatchIndex,
    includeMatchIndexAttribute = true,
  } = args;

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

  const rangesByTextNode = new Map<Text, TextNodeRange[]>();

  matchOffsets.forEach((matchOffset, localMatchIndex) => {
    const matchIndex = matchIndices[localMatchIndex];
    if (matchIndex == null) {
      return;
    }

    const matchEndOffset = matchOffset + matchLength;

    for (const position of textNodePositions) {
      const overlapStart = Math.max(matchOffset, position.startOffset);
      const overlapEnd = Math.min(matchEndOffset, position.endOffset);

      if (overlapStart >= overlapEnd) {
        continue;
      }

      const ranges = rangesByTextNode.get(position.textNode) ?? [];
      ranges.push({
        startOffset: overlapStart - position.startOffset,
        endOffset: overlapEnd - position.startOffset,
        matchIndex,
      });
      rangesByTextNode.set(position.textNode, ranges);
    }
  });

  let firstHighlightElement: HTMLElement | null = null;

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
      highlightElement.setAttribute(MATCH_ATTRIBUTE, 'true');
      if (includeMatchIndexAttribute) {
        highlightElement.setAttribute(MATCH_INDEX_ATTRIBUTE, String(range.matchIndex));
      }
      highlightElement.className =
        activeMatchIndex === range.matchIndex ? `${MATCH_CLASS} ${MATCH_ACTIVE_CLASS}` : MATCH_CLASS;
      highlightElement.textContent = originalText.slice(range.startOffset, range.endOffset);
      fragment.appendChild(highlightElement);

      if (!firstHighlightElement) {
        firstHighlightElement = highlightElement;
      }

      cursor = range.endOffset;
    }

    if (cursor < originalText.length) {
      fragment.appendChild(document.createTextNode(originalText.slice(cursor)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return firstHighlightElement;
}

function isBoundaryTag(tagName: string): boolean {
  return tagName === 'BR' || BOUNDARY_TAGS.has(tagName);
}

// DL is included for completeness. If definition-list markdown support is added,
// include DT and DD here as boundaries too.
const BOUNDARY_TAGS = new Set([
  'BLOCKQUOTE',
  'DIV',
  'DL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'LI',
  'OL',
  'P',
  'PRE',
  'TABLE',
  'TBODY',
  'TD',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);
