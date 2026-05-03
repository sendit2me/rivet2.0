import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphId, NodeId } from '@ironclad/rivet-core';
import {
  clearGraphSearchQueryState,
  emptyGraphSearchState,
  hideGraphSearchPanelState,
  openOrFocusGraphSearchState,
  type GraphSearchState,
} from './graphBuilder.js';

test('graph search soft close preserves query, selection, and scroll state', () => {
  const activeSearch: GraphSearchState = {
    ...emptyGraphSearchState,
    searching: true,
    panelOpen: true,
    query: 'return',
    selectedIndex: 2,
    fallbackToTerms: true,
    focusRequestId: 4,
    resultsScrollTop: 128,
  };

  const hiddenSearch = hideGraphSearchPanelState(activeSearch);

  assert.deepEqual(hiddenSearch, {
    ...activeSearch,
    panelOpen: false,
  });
});

test('graph search reopen restores the existing search session and requests focus', () => {
  const hiddenSearch: GraphSearchState = {
    ...emptyGraphSearchState,
    searching: true,
    panelOpen: false,
    query: 'return',
    selectedIndex: 2,
    focusRequestId: 4,
    resultsScrollTop: 128,
  };

  const reopenedSearch = openOrFocusGraphSearchState(hiddenSearch);

  assert.deepEqual(reopenedSearch, {
    ...hiddenSearch,
    panelOpen: true,
    focusRequestId: 5,
  });
});

test('graph search query clear keeps the search panel open without stale results', () => {
  const activeSearch: GraphSearchState = {
    ...emptyGraphSearchState,
    searching: true,
    panelOpen: true,
    query: 'return',
    selectedIndex: 2,
    matches: [
      {
        kind: 'node',
        graphId: 'graph-a' as GraphId,
        graphName: 'Graph A',
        nodeId: 'node-a' as NodeId,
        nodeTitle: 'Return node',
        nodeType: 'Text',
        locations: ['node name'],
        contentSnippets: ['return value'],
      },
    ],
    fallbackToTerms: true,
    resultsScrollTop: 128,
  };

  const clearedSearch = clearGraphSearchQueryState(activeSearch);

  assert.deepEqual(clearedSearch, {
    ...activeSearch,
    query: '',
    selectedIndex: 0,
    matches: [],
    fallbackToTerms: false,
    searching: true,
    panelOpen: true,
    resultsScrollTop: 0,
  });
});

test('graph search starts a clean visible session from an empty state', () => {
  const openedSearch = openOrFocusGraphSearchState(emptyGraphSearchState);

  assert.deepEqual(openedSearch, {
    ...emptyGraphSearchState,
    searching: true,
    panelOpen: true,
    focusRequestId: 1,
  });
});
