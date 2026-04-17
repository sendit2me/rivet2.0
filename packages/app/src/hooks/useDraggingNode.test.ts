import assert from 'node:assert/strict';
import test from 'node:test';
import { type ChartNode, type NodeId } from '@ironclad/rivet-core';
import {
  createDragDuplicatePreviewNodes,
  getDraggingConnectionSourceNodeIds,
  getDraggingPreviewNodes,
  resolveDraggedNodeIds,
  resolveDraggedSourceNodes,
  resolveDragModeFromAlt,
  shouldUseDuplicateDragModeOnKeyDown,
  shouldUseMoveDragModeOnKeyUp,
} from './useDraggingNode.js';

test('resolveDraggedNodeIds keeps the dragged node in the drag cohort and preserves unique selection ids', () => {
  assert.deepEqual(
    resolveDraggedNodeIds(['node-a' as NodeId, 'node-b' as NodeId], 'node-b' as NodeId),
    ['node-a', 'node-b'],
  );
  assert.deepEqual(resolveDraggedNodeIds([], 'node-c' as NodeId), ['node-c']);
});

test('resolveDraggedSourceNodes filters stale selected ids and keeps the drag session aligned to real source nodes', () => {
  const nodeA = {
    id: 'node-a' as NodeId,
    type: 'text',
    title: 'A',
    visualData: { x: 10, y: 20 },
    data: {},
  } as ChartNode;
  const nodeB = {
    id: 'node-b' as NodeId,
    type: 'text',
    title: 'B',
    visualData: { x: 30, y: 40 },
    data: {},
  } as ChartNode;

  const { sourceNodeIds, sourceNodes } = resolveDraggedSourceNodes(
    ['node-a' as NodeId, 'missing-node' as NodeId, 'node-b' as NodeId],
    {
      [nodeA.id]: nodeA,
      [nodeB.id]: nodeB,
    } as Record<NodeId, ChartNode | undefined>,
  );

  assert.deepEqual(sourceNodeIds, [nodeA.id, nodeB.id]);
  assert.deepEqual(sourceNodes, [nodeA, nodeB]);
});

test('resolveDragModeFromAlt maps modifier state to move vs duplicate drag mode', () => {
  assert.equal(resolveDragModeFromAlt(true), 'duplicate');
  assert.equal(resolveDragModeFromAlt(false), 'move');
});

test('drag mode keyboard helpers switch into duplicate on keydown and back to move on keyup', () => {
  assert.equal(shouldUseDuplicateDragModeOnKeyDown({ key: 'Alt', altKey: false }), true);
  assert.equal(shouldUseDuplicateDragModeOnKeyDown({ key: 'x', altKey: true }), true);
  assert.equal(shouldUseDuplicateDragModeOnKeyDown({ key: 'x', altKey: false }), false);

  assert.equal(shouldUseMoveDragModeOnKeyUp({ key: 'Alt', altKey: false }), true);
  assert.equal(shouldUseMoveDragModeOnKeyUp({ key: 'x', altKey: false }), true);
  assert.equal(shouldUseMoveDragModeOnKeyUp({ key: 'x', altKey: true }), false);
});

test('createDragDuplicatePreviewNodes creates fresh ids without mutating source node positions', () => {
  const sourceNodes = [
    {
      id: 'node-a' as NodeId,
      type: 'text',
      title: 'A',
      visualData: { x: 10, y: 20 },
      data: {},
    },
  ] as any;

  const previewNodes = createDragDuplicatePreviewNodes(sourceNodes);

  assert.equal(previewNodes.length, 1);
  assert.notEqual(previewNodes[0]!.id, sourceNodes[0]!.id);
  assert.equal(previewNodes[0]!.visualData.x, 10);
  assert.equal(previewNodes[0]!.visualData.y, 20);
  assert.equal(sourceNodes[0]!.id, 'node-a');
});

test('getDraggingPreviewNodes preserves stable duplicate previews across drag-mode toggles', () => {
  const sourceNodes = [
    {
      id: 'node-a' as NodeId,
      type: 'text',
      title: 'A',
      visualData: { x: 10, y: 20 },
      data: {},
    },
  ] as any;
  const previewNodes = createDragDuplicatePreviewNodes(sourceNodes);

  assert.equal(getDraggingPreviewNodes({ dragMode: 'move', sourceNodes, previewNodes }), sourceNodes);
  assert.equal(getDraggingPreviewNodes({ dragMode: 'duplicate', sourceNodes, previewNodes }), previewNodes);
  assert.equal(getDraggingPreviewNodes({ dragMode: 'duplicate', sourceNodes, previewNodes })[0]!.id, previewNodes[0]!.id);
});

test('getDraggingConnectionSourceNodeIds only exposes overlay wires while moving source nodes', () => {
  const sourceNodeIds = ['node-a' as NodeId, 'node-b' as NodeId];

  assert.deepEqual(getDraggingConnectionSourceNodeIds({ dragMode: 'move', sourceNodeIds }), sourceNodeIds);
  assert.deepEqual(getDraggingConnectionSourceNodeIds({ dragMode: 'duplicate', sourceNodeIds }), []);
});
