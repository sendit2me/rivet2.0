import assert from 'node:assert/strict';
import test from 'node:test';
import { type PortId } from '@valerypopoff/rivet2-core';
import { makeSubGraphNode, makeTextNode } from './testGraphBuilders.js';
import {
  moveSubGraphPortIdToIndexInOrder,
  normalizeSubGraphPortOrder,
  renameSubGraphPortOrder,
} from './subGraphPortOrder.js';

test('normalizeSubGraphPortOrder ignores stale and duplicate ids and appends new ports', () => {
  assert.deepEqual(normalizeSubGraphPortOrder(['a', 'b', 'c'], ['c', 'missing', 'a', 'c']), ['c', 'a', 'b']);
});

test('normalizeSubGraphPortOrder preserves default order when no order is stored', () => {
  assert.deepEqual(normalizeSubGraphPortOrder(['a', 'b', 'c'], undefined), ['a', 'b', 'c']);
});

test('moveSubGraphPortIdToIndexInOrder moves to the requested insertion point', () => {
  assert.deepEqual(
    moveSubGraphPortIdToIndexInOrder({
      portIds: ['a', 'b', 'c', 'd'],
      portOrder: undefined,
      sourcePortId: 'a' as PortId,
      targetIndex: 2,
    }),
    ['b', 'c', 'a', 'd'],
  );

  assert.deepEqual(
    moveSubGraphPortIdToIndexInOrder({
      portIds: ['a', 'b', 'c', 'd'],
      portOrder: undefined,
      sourcePortId: 'd' as PortId,
      targetIndex: 1,
    }),
    ['a', 'd', 'b', 'c'],
  );

  assert.deepEqual(
    moveSubGraphPortIdToIndexInOrder({
      portIds: ['a', 'b', 'c', 'd'],
      portOrder: undefined,
      sourcePortId: 'b' as PortId,
      targetIndex: 3,
    }),
    ['a', 'c', 'd', 'b'],
  );

  assert.equal(
    moveSubGraphPortIdToIndexInOrder({
      portIds: ['a', 'b', 'c'],
      portOrder: undefined,
      sourcePortId: 'b' as PortId,
      targetIndex: 1,
    }),
    undefined,
  );
});

test('renameSubGraphPortOrder rewrites matching subgraph order entries and removes collisions', () => {
  const subGraphNode = makeSubGraphNode('subgraph', 'child', {
    data: {
      inputPortOrder: ['new', 'old', 'tail'],
    },
  });

  const result = renameSubGraphPortOrder(subGraphNode, 'inputPortOrder', 'old', 'new');

  assert.equal(result.changed, true);
  assert.deepEqual((result.node.data as { inputPortOrder?: string[] }).inputPortOrder, ['new', 'tail']);
});

test('renameSubGraphPortOrder ignores unrelated nodes', () => {
  const textNode = makeTextNode('text');

  const result = renameSubGraphPortOrder(textNode, 'outputPortOrder', 'old', 'new');

  assert.equal(result.changed, false);
  assert.equal(result.node, textNode);
});
