import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartNode, NodeId } from '@valerypopoff/rivet2-core';
import { getDraggingViewportNodeIds, shouldFreezeViewportVisibility } from './viewportVisibilityPolicy.js';

const asNodeId = (value: string) => value as NodeId;

test('getDraggingViewportNodeIds merges source and overlay node ids without duplicates', () => {
  assert.deepEqual(
    getDraggingViewportNodeIds({
      draggedSourceNodeIds: [asNodeId('a'), asNodeId('b')],
      draggingNodes: [{ id: asNodeId('b') }, { id: asNodeId('c') }] as ChartNode[],
    }),
    [asNodeId('a'), asNodeId('b'), asNodeId('c')],
  );
});

test('shouldFreezeViewportVisibility freezes only passive viewport motion', () => {
  assert.equal(
    shouldFreezeViewportVisibility({
      isDraggingNode: false,
      isDraggingWire: false,
      isViewportMoving: true,
    }),
    true,
  );
  assert.equal(
    shouldFreezeViewportVisibility({
      isDraggingNode: true,
      isDraggingWire: false,
      isViewportMoving: true,
    }),
    false,
  );
  assert.equal(
    shouldFreezeViewportVisibility({
      isDraggingNode: false,
      isDraggingWire: true,
      isViewportMoving: true,
    }),
    false,
  );
});
