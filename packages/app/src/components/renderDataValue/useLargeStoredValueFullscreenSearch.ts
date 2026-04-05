import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useFullscreenOutputSearchContext } from '../nodeOutput/FullscreenOutputSearchContext.js';
import {
  applyFullscreenOutputSearchHighlights,
  clearFullscreenOutputSearchHighlights,
  collectFullscreenOutputSearchTextNodes,
  FULLSCREEN_OUTPUT_SEARCH_PROVIDER_ATTRIBUTE,
  type FullscreenOutputSearchProvider,
} from '../nodeOutput/fullscreenOutputSearchDom.js';
import { findFullscreenOutputSearchMatchOffsets, normalizeFullscreenOutputSearchQuery } from '../nodeOutput/fullscreenOutputSearch.js';
import { getLargeStoredValueChunkIndexForOffset, type LargeStoredValueChunk } from './largeStoredValueChunks.js';

type ActiveSearchMatch = {
  matchOffset: number;
  query: string;
};

export type LargeStoredValueFullscreenSearchResult = {
  providerRootProps?: Record<string, string>;
  clearSearchAutoExpansion: () => void;
};

export function useLargeStoredValueFullscreenSearch(args: {
  providerId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  fullText: string | undefined;
  chunks: readonly LargeStoredValueChunk[];
  activeChunk: LargeStoredValueChunk | undefined;
  activeChunkText: string | undefined;
  shouldPageFullText: boolean;
  showFull: boolean;
  setShowFull: Dispatch<SetStateAction<boolean>>;
  chunkPage: number;
  setChunkPage: Dispatch<SetStateAction<number>>;
}): LargeStoredValueFullscreenSearchResult {
  const {
    providerId,
    rootRef,
    contentRef,
    fullText,
    chunks,
    activeChunk,
    activeChunkText,
    shouldPageFullText,
    showFull,
    setShowFull,
    chunkPage,
    setChunkPage,
  } = args;

  const fullscreenOutputSearch = useFullscreenOutputSearchContext();
  const [activeSearchMatch, setActiveSearchMatch] = useState<ActiveSearchMatch | null>(null);
  const autoExpandedSearchStateRef = useRef<{ showFull: boolean; chunkPage: number } | null>(null);
  const currentSearchQueryRef = useRef('');
  const currentSearchMatchOffsetsRef = useRef<number[]>([]);
  const showFullRef = useRef(showFull);
  const chunkPageRef = useRef(chunkPage);

  showFullRef.current = showFull;
  chunkPageRef.current = chunkPage;

  useEffect(() => {
    setActiveSearchMatch(null);
    autoExpandedSearchStateRef.current = null;
    currentSearchQueryRef.current = '';
    currentSearchMatchOffsetsRef.current = [];
  }, [providerId]);

  useLayoutEffect(() => {
    if (!fullscreenOutputSearch || !rootRef.current) {
      return;
    }

    const provider: FullscreenOutputSearchProvider = {
      id: providerId,
      rootElement: rootRef.current,
      getMatchOffsets: (query: string) => {
        currentSearchQueryRef.current = query;
        const matchOffsets = fullText ? findFullscreenOutputSearchMatchOffsets(fullText, query) : [];
        currentSearchMatchOffsetsRef.current = matchOffsets;
        return matchOffsets;
      },
      activateMatch: (localMatchIndex: number) => {
        const matchOffset = currentSearchMatchOffsetsRef.current[localMatchIndex];
        if (matchOffset == null) {
          setActiveSearchMatch(null);
          return;
        }

        if (!showFullRef.current && !autoExpandedSearchStateRef.current) {
          autoExpandedSearchStateRef.current = {
            showFull: false,
            chunkPage: chunkPageRef.current,
          };
          setShowFull(true);
        }

        if (shouldPageFullText) {
          setChunkPage(getLargeStoredValueChunkIndexForOffset(chunks, matchOffset));
        } else {
          setChunkPage(0);
        }

        setActiveSearchMatch({
          matchOffset,
          query: currentSearchQueryRef.current,
        });
      },
      clearActiveMatch: () => {
        currentSearchQueryRef.current = '';
        currentSearchMatchOffsetsRef.current = [];
        setActiveSearchMatch(null);

        const restoreState = autoExpandedSearchStateRef.current;
        if (restoreState) {
          autoExpandedSearchStateRef.current = null;
          setShowFull(restoreState.showFull);
          setChunkPage(restoreState.chunkPage);
        }
      },
    };

    return fullscreenOutputSearch.registerProvider(provider);
  }, [chunks, fullText, fullscreenOutputSearch, providerId, rootRef, setChunkPage, setShowFull, shouldPageFullText]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    clearFullscreenOutputSearchHighlights(contentElement);

    if (!showFull || !activeChunk || !activeChunkText || !activeSearchMatch) {
      return;
    }

    const normalizedQuery = normalizeFullscreenOutputSearchQuery(activeSearchMatch.query);
    if (!normalizedQuery) {
      return;
    }

    const localMatchOffset = activeSearchMatch.matchOffset - activeChunk.startOffset;
    if (localMatchOffset < 0 || localMatchOffset >= activeChunkText.length) {
      return;
    }

    const activeHighlightElement = applyFullscreenOutputSearchHighlights({
      textNodes: collectFullscreenOutputSearchTextNodes(contentElement),
      matchOffsets: [localMatchOffset],
      matchLength: normalizedQuery.length,
      activeMatchIndex: 0,
    });

    activeHighlightElement?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });

    return () => {
      clearFullscreenOutputSearchHighlights(contentElement);
    };
  }, [activeChunk, activeChunkText, activeSearchMatch, contentRef, showFull]);

  return {
    providerRootProps: fullscreenOutputSearch
      ? {
          [FULLSCREEN_OUTPUT_SEARCH_PROVIDER_ATTRIBUTE]: providerId,
        }
      : undefined,
    clearSearchAutoExpansion: () => {
      autoExpandedSearchStateRef.current = null;
    },
  };
}
