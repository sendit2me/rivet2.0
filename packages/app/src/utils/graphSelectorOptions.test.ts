import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphId, NodeGraph } from '@valerypopoff/rivet2-core';
import { getProjectGraphSelectorOptions } from './graphSelectorOptions.js';

function graph(id: string, name?: string): NodeGraph {
  return {
    metadata: {
      id: id as GraphId,
      name,
    },
    nodes: [],
    connections: [],
  };
}

test('getProjectGraphSelectorOptions returns graph id/name options sorted by label', () => {
  assert.deepEqual(
    getProjectGraphSelectorOptions({
      b: graph('b', 'Beta'),
      a: graph('a', 'alpha'),
      c: graph('c', 'Gamma'),
    } as Record<GraphId, NodeGraph>),
    [
      { label: 'alpha', value: 'a' },
      { label: 'Beta', value: 'b' },
      { label: 'Gamma', value: 'c' },
    ],
  );
});

test('getProjectGraphSelectorOptions falls back to the project graph key when graph metadata is incomplete', () => {
  assert.deepEqual(
    getProjectGraphSelectorOptions({
      graphWithoutMetadata: {
        metadata: {},
        nodes: [],
        connections: [],
      },
    } as Record<GraphId, NodeGraph>),
    [{ label: 'graphWithoutMetadata', value: 'graphWithoutMetadata' }],
  );
});

test('getProjectGraphSelectorOptions can preserve a missing selected graph id for canvas display', () => {
  assert.deepEqual(
    getProjectGraphSelectorOptions(
      {
        existing: graph('existing', 'Existing'),
      } as Record<GraphId, NodeGraph>,
      {
        includeMissingSelectedGraph: true,
        selectedGraphId: 'deleted' as GraphId,
      },
    ),
    [
      { label: 'Missing graph: deleted', value: 'deleted' },
      { label: 'Existing', value: 'existing' },
    ],
  );
});

test('getProjectGraphSelectorOptions does not add a missing selected graph row by default', () => {
  assert.deepEqual(
    getProjectGraphSelectorOptions(
      {
        existing: graph('existing', 'Existing'),
      } as Record<GraphId, NodeGraph>,
      {
        selectedGraphId: 'deleted' as GraphId,
      },
    ),
    [{ label: 'Existing', value: 'existing' }],
  );
});
