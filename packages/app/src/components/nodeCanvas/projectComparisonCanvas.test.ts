import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartNode, GraphId, NodeId, PortId, ProjectGraphComparison } from '@valerypopoff/rivet2-core';
import { getCanvasNodeCompareKindsById } from './projectComparisonCanvas.js';

function asGraphId(id: string): GraphId {
  return id as GraphId;
}

function asNodeId(id: string): NodeId {
  return id as NodeId;
}

function asPortId(id: string): PortId {
  return id as PortId;
}

function node(id: NodeId): ChartNode {
  return {
    id,
    data: {},
    title: id,
    type: 'text',
    visualData: {
      x: 0,
      y: 0,
    },
  };
}

function commentNode(id: NodeId): ChartNode {
  return {
    ...node(id),
    type: 'comment',
  };
}

test('getCanvasNodeCompareKindsById ignores existing nodes touched only by new connections', () => {
  const sourceNodeId = asNodeId('source-node');
  const targetNodeId = asNodeId('target-node');

  const graphComparison = {
    id: asGraphId('graph'),
    kind: 'changed',
    metadataChanged: false,
    nodes: {
      [sourceNodeId]: {
        id: sourceNodeId,
        kind: 'unchanged',
      },
      [targetNodeId]: {
        id: targetNodeId,
        kind: 'unchanged',
      },
    },
    connections: {
      '["source-node","output","target-node","input"]': {
        key: '["source-node","output","target-node","input"]',
        kind: 'added',
        after: {
          inputId: asPortId('input'),
          inputNodeId: targetNodeId,
          outputId: asPortId('output'),
          outputNodeId: sourceNodeId,
        },
      },
    },
    summary: {
      addedConnections: 1,
      addedNodes: 0,
      changedConnections: 0,
      changedNodes: 0,
      removedConnections: 0,
      removedNodes: 0,
    },
  } satisfies ProjectGraphComparison;

  assert.deepEqual(getCanvasNodeCompareKindsById(graphComparison), {});
});

test('getCanvasNodeCompareKindsById keeps actual node additions and changes', () => {
  const addedNodeId = asNodeId('added-node');
  const changedNodeId = asNodeId('changed-node');
  const addedCommentId = asNodeId('added-comment');
  const changedCommentId = asNodeId('changed-comment');

  const graphComparison = {
    id: asGraphId('graph'),
    kind: 'changed',
    metadataChanged: false,
    nodes: {
      [addedNodeId]: {
        id: addedNodeId,
        kind: 'added',
        after: node(addedNodeId),
      },
      [changedNodeId]: {
        id: changedNodeId,
        kind: 'changed',
        after: node(changedNodeId),
      },
      [addedCommentId]: {
        id: addedCommentId,
        kind: 'added',
        after: commentNode(addedCommentId),
      },
      [changedCommentId]: {
        id: changedCommentId,
        kind: 'changed',
        after: commentNode(changedCommentId),
      },
    },
    connections: {},
    summary: {
      addedConnections: 0,
      addedNodes: 2,
      changedConnections: 0,
      changedNodes: 2,
      removedConnections: 0,
      removedNodes: 0,
    },
  } satisfies ProjectGraphComparison;

  assert.deepEqual(getCanvasNodeCompareKindsById(graphComparison), {
    [addedNodeId]: 'added',
    [changedNodeId]: 'changed',
  });
});

test('getCanvasNodeCompareKindsById highlights added nodes even when added wires also touch them', () => {
  const addedConnectedNodeId = asNodeId('added-connected-node');
  const addedStandaloneNodeId = asNodeId('added-standalone-node');
  const existingNodeId = asNodeId('existing-node');

  const graphComparison = {
    id: asGraphId('graph'),
    kind: 'changed',
    metadataChanged: false,
    nodes: {
      [addedConnectedNodeId]: {
        id: addedConnectedNodeId,
        kind: 'added',
        after: node(addedConnectedNodeId),
      },
      [addedStandaloneNodeId]: {
        id: addedStandaloneNodeId,
        kind: 'added',
        after: node(addedStandaloneNodeId),
      },
      [existingNodeId]: {
        id: existingNodeId,
        kind: 'unchanged',
        after: node(existingNodeId),
      },
    },
    connections: {
      '["existing-node","output","added-connected-node","input"]': {
        key: '["existing-node","output","added-connected-node","input"]',
        kind: 'added',
        after: {
          inputId: asPortId('input'),
          inputNodeId: addedConnectedNodeId,
          outputId: asPortId('output'),
          outputNodeId: existingNodeId,
        },
      },
    },
    summary: {
      addedConnections: 1,
      addedNodes: 2,
      changedConnections: 0,
      changedNodes: 0,
      removedConnections: 0,
      removedNodes: 0,
    },
  } satisfies ProjectGraphComparison;

  assert.deepEqual(getCanvasNodeCompareKindsById(graphComparison), {
    [addedConnectedNodeId]: 'added',
    [addedStandaloneNodeId]: 'added',
  });
});
