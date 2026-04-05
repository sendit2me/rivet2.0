import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import {
  buildFullscreenOutputSearchBlocks,
  applyFullscreenOutputSearchHighlights,
  clearFullscreenOutputSearchHighlights,
  type FullscreenOutputSearchProvider,
} from './fullscreenOutputSearchDom.js';
import {
  getWrappedFullscreenOutputSearchMatchIndex,
  normalizeFullscreenOutputSearchQuery,
  projectFullscreenOutputSearchMatches,
} from './fullscreenOutputSearch.js';
import type { NodeRunDataWithRefs } from '../../state/dataFlow.js';
import type { ProcessId } from '@ironclad/rivet-core';

export type FullscreenOutputSearchContentKey = {
  data: NodeRunDataWithRefs | undefined;
  processId: ProcessId | undefined;
  renderMarkdown: boolean;
  selectedPage: number | 'latest';
};

export function useFullscreenOutputSearch(args: {
  contentKey: FullscreenOutputSearchContentKey;
}) {
  const { contentKey } = args;

  const [query, setQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatchCount, setTotalMatchCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fullscreenOutputBodyRef = useRef<HTMLDivElement>(null);
  const providersRef = useRef(new Map<string, FullscreenOutputSearchProvider>());
  const [providersVersion, setProvidersVersion] = useState(0);
  const totalMatchCountRef = useRef(0);

  const focusSearchInput = useStableCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  });

  const registerProvider = useStableCallback((provider: FullscreenOutputSearchProvider) => {
    providersRef.current.set(provider.id, provider);
    setProvidersVersion((currentVersion) => currentVersion + 1);

    return () => {
      providersRef.current.delete(provider.id);
      setProvidersVersion((currentVersion) => currentVersion + 1);
    };
  });

  const goToNextMatch = useStableCallback(() => {
    const totalMatchCount = totalMatchCountRef.current;
    if (totalMatchCount <= 0) {
      return;
    }

    setCurrentMatchIndex((index) => getWrappedFullscreenOutputSearchMatchIndex(totalMatchCount, index, 1));
  });

  const goToPreviousMatch = useStableCallback(() => {
    const totalMatchCount = totalMatchCountRef.current;
    if (totalMatchCount <= 0) {
      return;
    }

    setCurrentMatchIndex((index) => getWrappedFullscreenOutputSearchMatchIndex(totalMatchCount, index, -1));
  });

  const handleSearchInputKeyDown = useStableCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();

      if (event.shiftKey) {
        goToPreviousMatch();
      } else {
        goToNextMatch();
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
      setCurrentMatchIndex(0);
      searchInputRef.current?.blur();
    }
  });

  const contextValue = useMemo(
    () => ({
      registerProvider,
    }),
    [registerProvider],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || !(event.metaKey || event.ctrlKey) || event.shiftKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      focusSearchInput();
    };

    // Capture phase is required so fullscreen search wins over both the canvas
    // hotkey layer and the webview/browser find behavior while the modal is open.
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [focusSearchInput]);

  useEffect(() => {
    if (!normalizeFullscreenOutputSearchQuery(query)) {
      setCurrentMatchIndex(0);
      return;
    }

    setCurrentMatchIndex(0);
  }, [contentKey, query]);

  useLayoutEffect(() => {
    const bodyElement = fullscreenOutputBodyRef.current;
    if (!bodyElement) {
      return;
    }

    clearFullscreenOutputSearchHighlights(bodyElement);

    const normalizedQuery = normalizeFullscreenOutputSearchQuery(query);
    if (!normalizedQuery) {
      providersRef.current.forEach((provider) => provider.clearActiveMatch());
      if (totalMatchCountRef.current !== 0) {
        totalMatchCountRef.current = 0;
        setTotalMatchCount(0);
      }
      return;
    }

    const providerMatchOffsetsById = Object.fromEntries(
      Array.from(providersRef.current.entries(), ([providerId, provider]) => [providerId, provider.getMatchOffsets(query)]),
    );

    const blocks = buildFullscreenOutputSearchBlocks(bodyElement, providersRef.current);
    const matches = projectFullscreenOutputSearchMatches(
      blocks.map((block) =>
        block.kind === 'provider'
          ? { kind: 'provider', providerId: block.providerId }
          : { kind: 'dom', text: block.text },
      ),
      query,
      providerMatchOffsetsById,
    );
    const totalMatchCount = matches.length;

    totalMatchCountRef.current = totalMatchCount;
    setTotalMatchCount(totalMatchCount);

    if (totalMatchCount === 0) {
      providersRef.current.forEach((provider) => provider.clearActiveMatch());
      if (currentMatchIndex !== 0) {
        setCurrentMatchIndex(0);
      }
      return;
    }

    const effectiveCurrentMatchIndex =
      currentMatchIndex >= totalMatchCount ? 0 : Math.max(0, currentMatchIndex);

    if (effectiveCurrentMatchIndex !== currentMatchIndex) {
      setCurrentMatchIndex(effectiveCurrentMatchIndex);
    }

    let activeHighlightElement: HTMLElement | null = null;

    blocks.forEach((block, blockIndex) => {
      if (block.kind !== 'dom') {
        return;
      }

      const blockMatches = matches.filter((match): match is Extract<typeof match, { kind: 'dom' }> => {
        return match.kind === 'dom' && match.blockIndex === blockIndex;
      });

      if (blockMatches.length === 0) {
        return;
      }

      const activeBlockMatch = matches[effectiveCurrentMatchIndex];
      const activeLocalMatchIndex =
        activeBlockMatch?.kind === 'dom' && activeBlockMatch.blockIndex === blockIndex
          ? activeBlockMatch.localMatchIndex
          : undefined;

      const highlightElement = applyFullscreenOutputSearchHighlights({
        textNodes: block.textNodes,
        matchOffsets: blockMatches.map((match) => match.startOffset),
        matchLength: normalizedQuery.length,
        activeMatchIndex: activeLocalMatchIndex,
      });

      if (!activeHighlightElement && highlightElement) {
        activeHighlightElement = highlightElement;
      }
    });

    const activeMatch = matches[effectiveCurrentMatchIndex];
    if (activeMatch?.kind === 'provider') {
      providersRef.current.forEach((provider, providerId) => {
        if (providerId === activeMatch.providerId) {
          provider.activateMatch(activeMatch.localMatchIndex);
          return;
        }

        provider.clearActiveMatch();
      });
    } else {
      providersRef.current.forEach((provider) => provider.clearActiveMatch());
    }

    const scrollTarget = activeHighlightElement as HTMLElement | null;
    if (scrollTarget) {
      scrollTarget.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [
    contentKey,
    currentMatchIndex,
    fullscreenOutputBodyRef,
    providersVersion,
    query,
    setCurrentMatchIndex,
    setTotalMatchCount,
  ]);

  useEffect(() => {
    return () => {
      const bodyElement = fullscreenOutputBodyRef.current;
      if (bodyElement) {
        clearFullscreenOutputSearchHighlights(bodyElement);
      }

      providersRef.current.forEach((provider) => provider.clearActiveMatch());
    };
  }, [fullscreenOutputBodyRef]);

  return {
    contextValue,
    currentMatchIndex,
    fullscreenOutputBodyRef,
    goToNextMatch,
    goToPreviousMatch,
    handleSearchInputKeyDown,
    query,
    searchInputRef,
    setQuery,
    totalMatchCount,
  };
}
