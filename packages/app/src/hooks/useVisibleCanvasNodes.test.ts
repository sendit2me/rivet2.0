import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartNode, CommentNode, NodeId } from '@rivet2/rivet-core';
import { calculateCanvasNodeVisibilitySnapshot } from './useVisibleCanvasNodes.js';
import { getCanvasVisibilityBounds } from './canvasVisibilityBounds.js';

const asNodeId = (value: string) => value as NodeId;

function createNode(id: NodeId, x: number, y: number, width = 320): ChartNode {
  return {
    data: {},
    id,
    title: id,
    type: 'test-node',
    visualData: {
      x,
      y,
      width,
    },
  } as ChartNode;
}

function createCommentNode(id: NodeId, x: number, y: number, width: number, height: number): CommentNode {
  return {
    data: {
      backgroundColor: 'rgba(0,0,0,0.05)',
      color: 'rgba(255,255,255,1)',
      height,
      text: '',
    },
    id,
    title: id,
    type: 'comment',
    visualData: {
      width,
      x,
      y,
    },
  };
}

const viewportBounds = {
  bottom: 1000,
  left: 0,
  right: 1000,
  top: 0,
};

test('calculateCanvasNodeVisibilitySnapshot includes nodes inside the padded viewport', () => {
  const snapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: null,
    expandedOutputNodeIds: [],
    hoveringNodeId: undefined,
    nodes: [createNode(asNodeId('visible-node'), 100, 100)],
    selectedNodeIds: [],
    viewportBounds,
  });

  assert.equal(snapshot.visibleNodeIdSet.has(asNodeId('visible-node')), true);
});

test('calculateCanvasNodeVisibilitySnapshot excludes nodes outside the padded viewport', () => {
  const snapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: null,
    expandedOutputNodeIds: [],
    hoveringNodeId: undefined,
    nodes: [createNode(asNodeId('far-node'), 3000, 3000)],
    selectedNodeIds: [],
    viewportBounds,
  });

  assert.equal(snapshot.visibleNodeIdSet.has(asNodeId('far-node')), false);
});

test('calculateCanvasNodeVisibilitySnapshot prewarms heavy content for nodes near the viewport edge', () => {
  const snapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: null,
    expandedOutputNodeIds: [],
    hoveringNodeId: undefined,
    nodes: [createNode(asNodeId('near-node'), 1150, 100)],
    selectedNodeIds: [],
    viewportBounds,
  });

  assert.equal(snapshot.nearViewportNodeIdSet.has(asNodeId('near-node')), true);
  assert.equal(snapshot.heavyContentNodeIdSet.has(asNodeId('near-node')), true);
});

test('calculateCanvasNodeVisibilitySnapshot keeps selected and editing nodes heavy-content-active offscreen', () => {
  const snapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: asNodeId('editing-node'),
    expandedOutputNodeIds: [],
    hoveringNodeId: undefined,
    nodes: [createNode(asNodeId('selected-node'), 3000, 3000), createNode(asNodeId('editing-node'), 3200, 3200)],
    selectedNodeIds: [asNodeId('selected-node')],
    viewportBounds,
  });

  assert.equal(snapshot.heavyContentNodeIdSet.has(asNodeId('selected-node')), true);
  assert.equal(snapshot.heavyContentNodeIdSet.has(asNodeId('editing-node')), true);
});

test('calculateCanvasNodeVisibilitySnapshot keeps expanded-output nodes visible and heavy-content-active offscreen', () => {
  const snapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: null,
    expandedOutputNodeIds: [asNodeId('expanded-node')],
    hoveringNodeId: undefined,
    nodes: [createNode(asNodeId('expanded-node'), 3000, 3000)],
    selectedNodeIds: [],
    viewportBounds,
  });

  assert.equal(snapshot.visibleNodeIdSet.has(asNodeId('expanded-node')), true);
  assert.equal(snapshot.heavyContentNodeIdSet.has(asNodeId('expanded-node')), true);
});

test('calculateCanvasNodeVisibilitySnapshot limits heavy content more aggressively for medium graphs', () => {
  const mediumGraphNodes = Array.from({ length: 50 }, (_, index) =>
    index === 0
      ? createNode(asNodeId('edge-node'), 1600, 100)
      : createNode(asNodeId(`node-${index}`), 100, 100 + index * 10),
  );
  const smallGraphNodes = [createNode(asNodeId('edge-node'), 1600, 100)];

  const mediumGraphSnapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: null,
    expandedOutputNodeIds: [],
    hoveringNodeId: undefined,
    nodes: mediumGraphNodes,
    selectedNodeIds: [],
    viewportBounds,
  });
  const smallGraphSnapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: null,
    expandedOutputNodeIds: [],
    hoveringNodeId: undefined,
    nodes: smallGraphNodes,
    selectedNodeIds: [],
    viewportBounds,
  });

  assert.equal(mediumGraphSnapshot.visibleNodeIdSet.has(asNodeId('edge-node')), true);
  assert.equal(mediumGraphSnapshot.heavyContentNodeIdSet.has(asNodeId('edge-node')), false);
  assert.equal(smallGraphSnapshot.heavyContentNodeIdSet.has(asNodeId('edge-node')), true);
});

test('calculateCanvasNodeVisibilitySnapshot keeps partially visible comment nodes mounted', () => {
  const snapshot = calculateCanvasNodeVisibilitySnapshot({
    draggingNodeIds: [],
    editingNodeId: null,
    expandedOutputNodeIds: [],
    hoveringNodeId: undefined,
    nodes: [createCommentNode(asNodeId('comment-node'), 100, -1200, 600, 1400)],
    selectedNodeIds: [],
    viewportBounds,
  });

  assert.equal(snapshot.visibleNodeIdSet.has(asNodeId('comment-node')), true);
  assert.equal(snapshot.nearViewportNodeIdSet.has(asNodeId('comment-node')), true);
});

test('getCanvasVisibilityBounds uses comment height but keeps normal nodes heightless for culling', () => {
  assert.deepEqual(getCanvasVisibilityBounds(createNode(asNodeId('normal-node'), 0, 0, 123)), {
    width: 123,
    height: 0,
  });

  assert.deepEqual(getCanvasVisibilityBounds(createCommentNode(asNodeId('comment-node'), 0, 0, 456, 789)), {
    width: 456,
    height: 789,
  });

  const legacyCommentNode = createCommentNode(asNodeId('legacy-comment-node'), 0, 0, 456, 789);
  delete (legacyCommentNode.data as Partial<CommentNode['data']>).height;

  assert.deepEqual(getCanvasVisibilityBounds(legacyCommentNode), {
    width: 456,
    height: 456,
  });

  const malformedWidthNode = createNode(asNodeId('malformed-width-node'), 0, 0, Number.NaN);

  assert.deepEqual(getCanvasVisibilityBounds(malformedWidthNode), {
    width: 300,
    height: 0,
  });
});
