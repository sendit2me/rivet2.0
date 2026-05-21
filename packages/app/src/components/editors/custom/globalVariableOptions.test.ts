import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartNode, GraphId, NodeGraph, NodeId, Project } from '@valerypopoff/rivet2-core';
import { getGlobalVariableOptions } from './globalVariableOptions.js';

function setGlobalNode(id: string, useIdInput = false): ChartNode {
  return {
    type: 'setGlobal',
    id: `set-global-${id}` as NodeId,
    title: 'Set Global',
    visualData: {
      x: 0,
      y: 0,
      width: 200,
    },
    data: {
      id,
      useIdInput,
      dataType: 'string',
    },
  };
}

function graph(id: string, nodes: ChartNode[]): NodeGraph {
  return {
    metadata: {
      id: id as GraphId,
      name: id,
      description: '',
    },
    nodes,
    connections: [],
  };
}

function project(graphs: Record<string, NodeGraph>): Pick<Project, 'graphs'> {
  return {
    graphs,
  };
}

test('getGlobalVariableOptions returns static Set Global IDs from all project graphs', () => {
  assert.deepEqual(
    getGlobalVariableOptions(
      project({
        a: graph('a', [setGlobalNode('zeta'), setGlobalNode('alpha')]),
        b: graph('b', [setGlobalNode('middle')]),
      }),
    ),
    [
      { label: 'alpha', value: 'alpha' },
      { label: 'middle', value: 'middle' },
      { label: 'zeta', value: 'zeta' },
    ],
  );
});

test('getGlobalVariableOptions ignores dynamic and empty Set Global IDs', () => {
  assert.deepEqual(
    getGlobalVariableOptions(
      project({
        main: graph('main', [setGlobalNode('static-id'), setGlobalNode('dynamic-id', true), setGlobalNode('')]),
      }),
    ),
    [{ label: 'static-id', value: 'static-id' }],
  );
});

test('getGlobalVariableOptions deduplicates repeated static IDs', () => {
  assert.deepEqual(
    getGlobalVariableOptions(
      project({
        a: graph('a', [setGlobalNode('shared')]),
        b: graph('b', [setGlobalNode('shared')]),
      }),
    ),
    [{ label: 'shared', value: 'shared' }],
  );
});

test('getGlobalVariableOptions prefers the live graph over the saved project graph', () => {
  assert.deepEqual(
    getGlobalVariableOptions(
      project({
        main: graph('main', [setGlobalNode('saved-id')]),
        other: graph('other', [setGlobalNode('other-id')]),
      }),
      graph('main', [setGlobalNode('live-id')]),
    ),
    [
      { label: 'live-id', value: 'live-id' },
      { label: 'other-id', value: 'other-id' },
    ],
  );
});
