import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBuiltInRegistry,
  type ChartNode,
  type NodeConnection,
  type NodeId,
  type PortId,
  type Project,
} from '@ironclad/rivet-core';
import type { GraphCommandState } from './Command.js';
import { buildEditNodeAppliedData, shouldMergeEditNodeCommand } from './editNodeCommand.js';

const registry = createBuiltInRegistry();
const project = {
  graphs: {},
} as Project;

function makeTextNode(nodeId: string, text: string): ChartNode {
  const node = registry.createDynamic('text');

  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    text,
    normalizeLineEndings: true,
  };

  return node;
}

function makeConnection(overrides: Partial<NodeConnection> = {}): NodeConnection {
  return {
    outputNodeId: 'source' as NodeId,
    outputId: 'output' as PortId,
    inputNodeId: 'target' as NodeId,
    inputId: 'foo' as PortId,
    ...overrides,
  };
}

function makeCommandState({
  nodes,
  connections,
  recoverableNodeConnections = {},
}: {
  nodes: ChartNode[];
  connections: NodeConnection[];
  recoverableNodeConnections?: Record<NodeId, NodeConnection[]>;
}): GraphCommandState {
  return {
    nodes,
    connections,
    recoverableNodeConnections,
    project,
    commandHistoryStack: [],
    graphId: 'graph-1' as any,
    editingNodeId: null,
    referencedProjects: {},
  };
}

test('editNode applied data snapshots both connection state and recovery pool', () => {
  const targetNode = makeTextNode('target', '{{foo}}');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: targetNode.id,
  });
  const currentState = makeCommandState({
    nodes: [sourceNode, targetNode],
    connections: [connection],
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: targetNode.id,
      newNode: {
        data: {
          ...(targetNode.data as Record<string, unknown>),
          text: '',
        },
      },
    },
    currentState,
    previousNode: targetNode,
    previousConnections: currentState.connections,
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.previousConnections, [connection]);
  assert.deepEqual(appliedData.nextConnections, []);
  assert.deepEqual(appliedData.previousRecoverableConnections, []);
  assert.deepEqual(appliedData.nextRecoverableConnections, [connection]);
});

test('editNode applied data restores pooled connections when the same port comes back', () => {
  const targetNode = makeTextNode('target', '');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: targetNode.id,
  });
  const currentState = makeCommandState({
    nodes: [sourceNode, targetNode],
    connections: [],
    recoverableNodeConnections: {
      [targetNode.id]: [connection],
    } as Record<NodeId, NodeConnection[]>,
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: targetNode.id,
      newNode: {
        data: {
          ...(targetNode.data as Record<string, unknown>),
          text: '{{foo}}',
        },
      },
    },
    currentState,
    previousNode: targetNode,
    previousConnections: currentState.connections,
    previousRecoverableConnections: [connection],
    currentRecoverableConnections: [connection],
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.nextConnections, [connection]);
  assert.deepEqual(appliedData.nextRecoverableConnections, []);
});

test('editNode merge helper only merges recent edits for the same node and command type', () => {
  const recentMatchingCommand = {
    timestamp: 10_000,
    command: {
      type: 'editNode',
    },
    data: {
      nodeId: 'node-a' as NodeId,
    },
  };

  assert.equal(shouldMergeEditNodeCommand(recentMatchingCommand as any, 'node-a' as NodeId, 12_000), true);
  assert.equal(shouldMergeEditNodeCommand(recentMatchingCommand as any, 'node-b' as NodeId, 12_000), false);
  assert.equal(
    shouldMergeEditNodeCommand(
      {
        ...recentMatchingCommand,
        command: {
          type: 'editNodeWithConnections',
        },
      } as any,
      'node-a' as NodeId,
      12_000,
    ),
    false,
  );
  assert.equal(shouldMergeEditNodeCommand(recentMatchingCommand as any, 'node-a' as NodeId, 16_100), false);
});
