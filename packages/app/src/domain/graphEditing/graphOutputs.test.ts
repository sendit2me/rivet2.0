import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartNode, GraphId, NodeGraph, NodeId } from '@valerypopoff/rivet2-core';
import { getDuplicateGraphOutputIds, getDuplicateGraphOutputIdWarning } from './graphOutputs.js';

function graphOutputNode(id: unknown, disabled = false, nodeId = String(id)): ChartNode {
  return {
    type: 'graphOutput',
    id: `graph-output-${nodeId}` as NodeId,
    title: 'Graph Output',
    visualData: {
      x: 0,
      y: 0,
      width: 200,
    },
    data: {
      id,
      dataType: 'string',
    },
    disabled,
  } as ChartNode;
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

test('getDuplicateGraphOutputIds detects duplicate enabled Graph Output IDs in one graph', () => {
  const duplicateIds = getDuplicateGraphOutputIds(
    graph('main', [
      graphOutputNode('shared', false, 'a'),
      graphOutputNode('other'),
      graphOutputNode('shared', false, 'b'),
    ]),
  );

  assert.deepEqual([...duplicateIds], ['shared']);
  assert.equal(
    getDuplicateGraphOutputIdWarning(graphOutputNode('shared'), duplicateIds),
    'Another enabled Graph Output node in this graph uses output ID "shared".',
  );
});

test('getDuplicateGraphOutputIds ignores unique Graph Output IDs', () => {
  const duplicateIds = getDuplicateGraphOutputIds(graph('main', [graphOutputNode('first'), graphOutputNode('second')]));

  assert.deepEqual([...duplicateIds], []);
  assert.equal(getDuplicateGraphOutputIdWarning(graphOutputNode('first'), duplicateIds), undefined);
});

test('getDuplicateGraphOutputIds ignores disabled duplicates', () => {
  const duplicateIds = getDuplicateGraphOutputIds(
    graph('main', [graphOutputNode('shared'), graphOutputNode('shared', true, 'disabled')]),
  );

  assert.deepEqual([...duplicateIds], []);
});

test('getDuplicateGraphOutputIds ignores blank and non-string IDs', () => {
  const duplicateIds = getDuplicateGraphOutputIds(
    graph('main', [
      graphOutputNode(''),
      graphOutputNode('   '),
      graphOutputNode(undefined, false, 'undefined'),
      graphOutputNode(123, false, 'number'),
    ]),
  );

  assert.deepEqual([...duplicateIds], []);
});

test('getDuplicateGraphOutputIds treats IDs as exact graph-local output keys', () => {
  const firstGraphIds = getDuplicateGraphOutputIds(graph('first', [graphOutputNode('result')]));
  const secondGraphIds = getDuplicateGraphOutputIds(graph('second', [graphOutputNode('result')]));
  const exactIds = getDuplicateGraphOutputIds(
    graph('exact', [
      graphOutputNode('result'),
      graphOutputNode('Result'),
      graphOutputNode(' result'),
      graphOutputNode('result '),
    ]),
  );

  assert.deepEqual([...firstGraphIds], []);
  assert.deepEqual([...secondGraphIds], []);
  assert.deepEqual([...exactIds], []);
});

test('getDuplicateGraphOutputIdWarning ignores disabled and non-Graph Output nodes', () => {
  const duplicateIds = new Set(['shared']);

  assert.equal(getDuplicateGraphOutputIdWarning(graphOutputNode('shared', true), duplicateIds), undefined);
  assert.equal(
    getDuplicateGraphOutputIdWarning(
      {
        ...graphOutputNode('shared'),
        type: 'text',
      } as ChartNode,
      duplicateIds,
    ),
    undefined,
  );
});
