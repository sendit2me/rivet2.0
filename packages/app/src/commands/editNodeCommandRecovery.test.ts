import assert from 'node:assert/strict';
import test from 'node:test';
import { type NodeConnection, type NodeId, type PortId } from '@valerypopoff/rivet2-core';
import { makeConnection, makeTextNode } from '../domain/graphEditing/testGraphBuilders.js';
import { buildEditNodeAppliedData } from './editNodeCommand.js';
import { makeCommandState, registry } from './editNodeCommandTestUtils.js';

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

test('editNode applied data preserves connections on clear interpolation input rename', () => {
  const targetNode = makeTextNode('target', '{{foo}}');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
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
          text: '{{bar}}',
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
  assert.deepEqual(appliedData.nextConnections, [
    {
      ...connection,
      inputId: 'bar' as PortId,
    },
  ]);
  assert.deepEqual(appliedData.nextRecoverableConnections, []);
});

test('editNode applied data does not steal an occupied interpolation rename target slot', () => {
  const targetNode = makeTextNode('target', '{{foo}}');
  const oldSourceNode = makeTextNode('old-source', 'old source');
  const newSourceNode = makeTextNode('new-source', 'new source');
  const oldConnection = makeConnection({
    outputNodeId: oldSourceNode.id,
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
  });
  const newConnection = makeConnection({
    outputNodeId: newSourceNode.id,
    inputNodeId: targetNode.id,
    inputId: 'bar' as PortId,
  });
  const currentState = makeCommandState({
    nodes: [oldSourceNode, newSourceNode, targetNode],
    connections: [oldConnection, newConnection],
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: targetNode.id,
      newNode: {
        data: {
          ...(targetNode.data as Record<string, unknown>),
          text: '{{bar}}',
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

  assert.deepEqual(appliedData.nextConnections, [newConnection]);
  assert.deepEqual(appliedData.nextRecoverableConnections, [oldConnection]);
});

test('editNode merged interpolation input rename does not rename a recoverable connection after deletion', () => {
  const targetNode = makeTextNode('target', '');
  const previousTargetNode = makeTextNode('target', '{{foo}}');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
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
          text: '{{bar}}',
        },
      },
    },
    currentState,
    previousNode: previousTargetNode,
    previousConnections: [connection],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [connection],
    isMergedEdit: true,
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.previousNode, previousTargetNode);
  assert.deepEqual(appliedData.previousConnections, [connection]);
  assert.deepEqual(appliedData.nextConnections, []);
  assert.deepEqual(appliedData.previousRecoverableConnections, []);
  assert.deepEqual(appliedData.nextRecoverableConnections, [connection]);
});

test('editNode merged interpolation input rename does not restore a deleted longer-name port to a prefix token', () => {
  const targetNode = makeTextNode('target', '');
  const previousTargetNode = makeTextNode('target', '{{name}}');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: targetNode.id,
    inputId: 'name' as PortId,
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
          text: '{{n}}',
        },
      },
    },
    currentState,
    previousNode: previousTargetNode,
    previousConnections: [connection],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [connection],
    isMergedEdit: true,
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.nextConnections, []);
  assert.deepEqual(appliedData.nextRecoverableConnections, [connection]);
});

test('editNode merged interpolation input rename keeps rewriting the current live port', () => {
  const previousTargetNode = makeTextNode('target', '{{a}}');
  const targetNode = makeTextNode('target', '{{aa}}');
  const sourceNode = makeTextNode('source', 'source');
  const originalConnection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: targetNode.id,
    inputId: 'a' as PortId,
  });
  const currentConnection = {
    ...originalConnection,
    inputId: 'aa' as PortId,
  };
  const currentState = makeCommandState({
    nodes: [sourceNode, targetNode],
    connections: [currentConnection],
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: targetNode.id,
      newNode: {
        data: {
          ...(targetNode.data as Record<string, unknown>),
          text: '{{aaa}}',
        },
      },
    },
    currentState,
    previousNode: previousTargetNode,
    previousConnections: [originalConnection],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    isMergedEdit: true,
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.previousNode, previousTargetNode);
  assert.deepEqual(appliedData.previousConnections, [originalConnection]);
  assert.deepEqual(appliedData.nextConnections, [
    {
      ...currentConnection,
      inputId: 'aaa' as PortId,
    },
  ]);
  assert.deepEqual(appliedData.nextRecoverableConnections, []);
});
