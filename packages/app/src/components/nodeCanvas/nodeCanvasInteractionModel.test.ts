import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphId, NodeId } from '@valerypopoff/rivet2-core';
import type { GraphSearchGraphMatch, GraphSearchNodeMatch } from '../../hooks/graphSearch.js';
import {
  getCanvasHighlightedNodeIds,
  getCanvasSearchMatchingNodeIds,
  getCanvasSelectedInteractionNodeIds,
} from './nodeCanvasInteractionModel.js';

const graphA = 'graph-a' as GraphId;
const graphB = 'graph-b' as GraphId;

type CanvasSearchOptions = Parameters<typeof getCanvasSearchMatchingNodeIds>[0];

function makeSearchOptions(overrides: Partial<CanvasSearchOptions> = {}): CanvasSearchOptions {
  return {
    matches: [],
    panelOpen: true,
    query: 'needle',
    searching: true,
    selectedGraphId: graphA,
    ...overrides,
  };
}

function makeGraphMatch(graphId: GraphId): GraphSearchGraphMatch {
  return {
    kind: 'graph',
    graphId,
    graphName: 'Graph',
    locations: ['graph name'],
    contentSnippets: [],
    occurrenceCount: 1,
  };
}

function makeNodeMatch(graphId: GraphId, nodeId: string): GraphSearchNodeMatch {
  return {
    kind: 'node',
    graphId,
    graphName: 'Graph',
    nodeId: nodeId as NodeId,
    nodeTitle: 'Node',
    nodeType: 'text',
    locations: ['node name'],
    contentSnippets: [],
    occurrenceCount: 1,
  };
}

test('getCanvasSelectedInteractionNodeIds includes selected, edited, and fullscreen-output nodes once', () => {
  assert.deepEqual(
    getCanvasSelectedInteractionNodeIds({
      editingNodeId: 'node-b' as NodeId,
      fullscreenOutputNodeId: 'node-c' as NodeId,
      selectedNodeIds: ['node-a' as NodeId, 'node-b' as NodeId],
    }),
    ['node-a', 'node-b', 'node-c'],
  );
});

test('getCanvasSearchMatchingNodeIds returns only visible node matches from the selected graph', () => {
  assert.deepEqual(
    getCanvasSearchMatchingNodeIds(
      makeSearchOptions({
        matches: [makeGraphMatch(graphA), makeNodeMatch(graphA, 'node-a'), makeNodeMatch(graphB, 'node-b')],
      }),
    ),
    ['node-a'],
  );
});

test('getCanvasSearchMatchingNodeIds returns no matches when search is hidden or blank', () => {
  assert.deepEqual(getCanvasSearchMatchingNodeIds(makeSearchOptions({ panelOpen: false })), []);

  assert.deepEqual(getCanvasSearchMatchingNodeIds(makeSearchOptions({ query: '   ' })), []);
});

test('getCanvasHighlightedNodeIds adds node hover unless a port is hovered', () => {
  assert.deepEqual(
    getCanvasHighlightedNodeIds({
      hoveringNodeId: 'node-b' as NodeId,
      isPortHovered: false,
      selectedNodeIds: ['node-a' as NodeId],
    }),
    ['node-a', 'node-b'],
  );

  assert.deepEqual(
    getCanvasHighlightedNodeIds({
      hoveringNodeId: 'node-b' as NodeId,
      isPortHovered: true,
      selectedNodeIds: ['node-a' as NodeId],
    }),
    ['node-a'],
  );
});
