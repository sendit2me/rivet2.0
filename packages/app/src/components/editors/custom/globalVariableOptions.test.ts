import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartNode, GraphId, NodeGraph, NodeId, Project } from '@valerypopoff/rivet2-core';
import {
  getGlobalVariableOptions,
  getMissingStaticSetGlobalWarning,
  getStaticGlobalVariableIds,
} from './globalVariableOptions.js';

function setGlobalNode(id: string, useIdInput = false, disabled = false): ChartNode {
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
    disabled,
  };
}

function getGlobalNode(id: string, useIdInput = false, disabled = false): ChartNode {
  return {
    type: 'getGlobal',
    id: `get-global-${id}` as NodeId,
    title: 'Get Global',
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
    disabled,
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

test('getMissingStaticSetGlobalWarning warns when a static Get Global ID has no enabled static setter', () => {
  const ids = getStaticGlobalVariableIds(
    project({
      main: graph('main', [setGlobalNode('disabled-only', false, true), setGlobalNode('dynamic-id', true)]),
    }),
    undefined,
    { includeDisabled: false },
  );

  assert.equal(
    getMissingStaticSetGlobalWarning(getGlobalNode('missing-id'), ids),
    'No enabled Set Global node in this project sets variable ID "missing-id".',
  );
  assert.equal(
    getMissingStaticSetGlobalWarning(getGlobalNode('disabled-only'), ids),
    'No enabled Set Global node in this project sets variable ID "disabled-only".',
  );
  assert.equal(
    getMissingStaticSetGlobalWarning(getGlobalNode('dynamic-id'), ids),
    'No enabled Set Global node in this project sets variable ID "dynamic-id".',
  );
});

test('getMissingStaticSetGlobalWarning accepts matching enabled static setters from any project graph', () => {
  const ids = getStaticGlobalVariableIds(
    project({
      main: graph('main', [setGlobalNode('main-id')]),
      other: graph('other', [setGlobalNode('other-id')]),
    }),
    undefined,
    { includeDisabled: false },
  );

  assert.equal(getMissingStaticSetGlobalWarning(getGlobalNode('main-id'), ids), undefined);
  assert.equal(getMissingStaticSetGlobalWarning(getGlobalNode('other-id'), ids), undefined);
});

test('getMissingStaticSetGlobalWarning ignores dynamic and blank Get Global IDs', () => {
  const ids = getStaticGlobalVariableIds(
    project({
      main: graph('main', []),
    }),
    undefined,
    { includeDisabled: false },
  );

  assert.equal(getMissingStaticSetGlobalWarning(getGlobalNode('dynamic-id', true), ids), undefined);
  assert.equal(getMissingStaticSetGlobalWarning(getGlobalNode(''), ids), undefined);
  assert.equal(getMissingStaticSetGlobalWarning(getGlobalNode('disabled-id', false, true), ids), undefined);
});

test('getStaticGlobalVariableIds overlays the live graph for warnings', () => {
  const ids = getStaticGlobalVariableIds(
    project({
      main: graph('main', [setGlobalNode('saved-id')]),
      other: graph('other', [setGlobalNode('other-id')]),
    }),
    graph('main', [setGlobalNode('live-id')]),
    { includeDisabled: false },
  );

  assert.deepEqual([...ids].sort(), ['live-id', 'other-id']);
});
