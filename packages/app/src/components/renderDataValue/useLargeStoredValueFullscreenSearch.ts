import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useFullscreenOutputSearchContext } from '../nodeOutput/FullscreenOutputSearchContext.js';
import {
  applyHighlights,
  clearHighlights,
  collectTextNodes,
  findMatchOffsets,
  PROVIDER_ATTRIBUTE,
} from '../nodeOutput/fullscreenOutputSearch.js';
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
  const displayStateRef = useRef({
    showFull,
    chunkPage,
  });

  displayStateRef.current = {
    showFull,
    chunkPage,
  };

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

    return fullscreenOutputSearch.registerProvider({
      id: providerId,
      rootElement: rootRef.current,
      getMatchOffsets: (query: string) => {
        currentSearchQueryRef.current = query;
        const matchOffsets = fullText ? findMatchOffsets(fullText, query) : [];
        currentSearchMatchOffsetsRef.current = matchOffsets;
        return matchOffsets;
      },
      activateMatch: (localMatchIndex: number) => {
        const matchOffset = currentSearchMatchOffsetsRef.current[localMatchIndex];
        if (matchOffset == null) {
          setActiveSearchMatch(null);
          return;
        }

        const displayState = displayStateRef.current;
        if (!displayState.showFull && !autoExpandedSearchStateRef.current) {
          autoExpandedSearchStateRef.current = {
            showFull: false,
            chunkPage: displayState.chunkPage,
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
    });
  }, [chunks, fullText, fullscreenOutputSearch, providerId, rootRef, setChunkPage, setShowFull, shouldPageFullText]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    clearHighlights(contentElement);

    if (!showFull || !activeChunk || !activeChunkText || !activeSearchMatch) {
      return;
    }

    const matchLength = activeSearchMatch.query.toLocaleLowerCase().length;
    if (matchLength === 0) {
      return;
    }

    const localMatchOffset = activeSearchMatch.matchOffset - activeChunk.startOffset;
    if (localMatchOffset < 0 || localMatchOffset >= activeChunkText.length) {
      return;
    }

    const activeHighlightElement = applyHighlights({
      textNodes: collectTextNodes(contentElement),
      matchOffsets: [localMatchOffset],
      matchLength,
      matchIndices: [0],
      activeMatchIndex: 0,
      includeMatchIndexAttribute: false,
    });

    activeHighlightElement?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });

    return () => {
      clearHighlights(contentElement);
    };
  }, [activeChunk, activeChunkText, activeSearchMatch, contentRef, showFull]);

  return {
    providerRootProps: fullscreenOutputSearch
      ? {
          [PROVIDER_ATTRIBUTE]: providerId,
        }
      : undefined,
    clearSearchAutoExpansion: () => {
      autoExpandedSearchStateRef.current = null;
    },
  };
}
