export type FullscreenOutputSearchProjectableBlock =
  | {
      kind: 'dom';
      text: string;
    }
  | {
      kind: 'provider';
      providerId: string;
    };

export type FullscreenOutputSearchMatch =
  | {
      kind: 'dom';
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

export function normalizeFullscreenOutputSearchQuery(query: string): string {
  return query.toLocaleLowerCase();
}

export function findFullscreenOutputSearchMatchOffsets(text: string, query: string): number[] {
  const normalizedQuery = normalizeFullscreenOutputSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const normalizedText = normalizeFullscreenOutputSearchQuery(text);
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

export function getWrappedFullscreenOutputSearchMatchIndex(
  totalMatchCount: number,
  currentMatchIndex: number,
  delta: 1 | -1,
): number {
  if (totalMatchCount <= 0) {
    return 0;
  }

  return (currentMatchIndex + delta + totalMatchCount) % totalMatchCount;
}

export function projectFullscreenOutputSearchMatches(
  blocks: readonly FullscreenOutputSearchProjectableBlock[],
  query: string,
  providerMatchOffsetsById: Readonly<Record<string, readonly number[]>>,
): FullscreenOutputSearchMatch[] {
  const normalizedQuery = normalizeFullscreenOutputSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const matches: FullscreenOutputSearchMatch[] = [];

  blocks.forEach((block, blockIndex) => {
    if (block.kind === 'provider') {
      const providerOffsets = providerMatchOffsetsById[block.providerId] ?? [];
      providerOffsets.forEach((startOffset, localMatchIndex) => {
        matches.push({
          kind: 'provider',
          blockIndex,
          providerId: block.providerId,
          localMatchIndex,
          startOffset,
          endOffset: startOffset + normalizedQuery.length,
        });
      });

      return;
    }

    const blockOffsets = findFullscreenOutputSearchMatchOffsets(block.text, normalizedQuery);
    blockOffsets.forEach((startOffset, localMatchIndex) => {
      matches.push({
        kind: 'dom',
        blockIndex,
        localMatchIndex,
        startOffset,
        endOffset: startOffset + normalizedQuery.length,
      });
    });
  });

  return matches;
}
