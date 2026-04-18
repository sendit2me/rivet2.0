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
import { reconcileNodeEditConnections } from './editNodeConnectionRecovery.js';

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

function makeCodeNode(nodeId: string, outputNames: string[]): ChartNode {
  const node = registry.createDynamic('code');

  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    outputNames,
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

test('removed dynamic inputs become recoverable and exact same ids restore later', () => {
  const targetNode = makeTextNode('target', '{{foo}}');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
    outputNodeId: sourceNode.id,
  });

  const removedResult = reconcileNodeEditConnections({
    nodeId: targetNode.id,
    newNode: {
      data: {
        ...(targetNode.data as Record<string, unknown>),
        text: '',
      },
    },
    nodes: [sourceNode, targetNode],
    liveConnections: [connection],
    recoverableConnections: [],
    project,
    referencedProjects: {},
    projectNodeRegistry: registry,
  });

  assert.deepEqual(removedResult.nextConnections, []);
  assert.deepEqual(removedResult.nextRecoverableConnections, [connection]);

  const restoredTargetNode = makeTextNode('target', '');
  const restoredResult = reconcileNodeEditConnections({
    nodeId: restoredTargetNode.id,
    newNode: {
      data: {
        ...(restoredTargetNode.data as Record<string, unknown>),
        text: '{{foo}}',
      },
    },
    nodes: [sourceNode, restoredTargetNode],
    liveConnections: [],
    recoverableConnections: removedResult.nextRecoverableConnections,
    project,
    referencedProjects: {},
    projectNodeRegistry: registry,
  });

  assert.deepEqual(restoredResult.nextConnections, [connection]);
  assert.deepEqual(restoredResult.nextRecoverableConnections, []);
});

test('different dynamic input ids do not restore previous connections', () => {
  const targetNode = makeTextNode('target', '');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
    outputNodeId: sourceNode.id,
  });

  const result = reconcileNodeEditConnections({
    nodeId: targetNode.id,
    newNode: {
      data: {
        ...(targetNode.data as Record<string, unknown>),
        text: '{{bar}}',
      },
    },
    nodes: [sourceNode, targetNode],
    liveConnections: [],
    recoverableConnections: [connection],
    project,
    referencedProjects: {},
    projectNodeRegistry: registry,
  });

  assert.deepEqual(result.nextConnections, []);
  assert.deepEqual(result.nextRecoverableConnections, [connection]);
});

test('manual retyping restores only the matching pooled connections', () => {
  const targetNode = makeTextNode('target', '');
  const sourceNode = makeTextNode('source', 'source');
  const fooConnection = makeConnection({
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
    outputNodeId: sourceNode.id,
  });
  const barConnection = makeConnection({
    inputNodeId: targetNode.id,
    inputId: 'bar' as PortId,
    outputNodeId: sourceNode.id,
  });

  const result = reconcileNodeEditConnections({
    nodeId: targetNode.id,
    newNode: {
      data: {
        ...(targetNode.data as Record<string, unknown>),
        text: '{{foo}}',
      },
    },
    nodes: [sourceNode, targetNode],
    liveConnections: [],
    recoverableConnections: [fooConnection, barConnection],
    project,
    referencedProjects: {},
    projectNodeRegistry: registry,
  });

  assert.deepEqual(result.nextConnections, [fooConnection]);
  assert.deepEqual(result.nextRecoverableConnections, [barConnection]);
});

test('a live incoming connection on the same port supersedes an older recoverable one', () => {
  const targetNode = makeTextNode('target', '{{foo}}');
  const sourceNode = makeTextNode('source', 'source');
  const oldConnection = makeConnection({
    outputNodeId: 'old-source' as NodeId,
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
  });
  const liveConnection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
  });

  const result = reconcileNodeEditConnections({
    nodeId: targetNode.id,
    newNode: {
      data: {
        ...(targetNode.data as Record<string, unknown>),
        text: '{{foo}}',
      },
    },
    nodes: [sourceNode, targetNode],
    liveConnections: [liveConnection],
    recoverableConnections: [oldConnection],
    project,
    referencedProjects: {},
    projectNodeRegistry: registry,
  });

  assert.deepEqual(result.nextConnections, [liveConnection]);
  assert.deepEqual(result.nextRecoverableConnections, []);
});

test('identical live connections clear stale recoverable duplicates', () => {
  const targetNode = makeTextNode('target', '{{foo}}');
  const sourceNode = makeTextNode('source', 'source');
  const connection = makeConnection({
    inputNodeId: targetNode.id,
    inputId: 'foo' as PortId,
    outputNodeId: sourceNode.id,
  });

  const result = reconcileNodeEditConnections({
    nodeId: targetNode.id,
    newNode: {
      data: {
        ...(targetNode.data as Record<string, unknown>),
        text: '{{foo}}',
      },
    },
    nodes: [sourceNode, targetNode],
    liveConnections: [connection],
    recoverableConnections: [connection],
    project,
    referencedProjects: {},
    projectNodeRegistry: registry,
  });

  assert.deepEqual(result.nextConnections, [connection]);
  assert.deepEqual(result.nextRecoverableConnections, []);
});

test('dynamic outputs restore their exact outgoing connections when the same id returns', () => {
  const codeNode = makeCodeNode('code-node', []);
  const downstreamNode = makeTextNode('downstream', '{{input}}');
  const connection = makeConnection({
    outputNodeId: codeNode.id,
    outputId: 'foo' as PortId,
    inputNodeId: downstreamNode.id,
    inputId: 'input' as PortId,
  });

  const result = reconcileNodeEditConnections({
    nodeId: codeNode.id,
    newNode: {
      data: {
        ...(codeNode.data as Record<string, unknown>),
        outputNames: ['foo'],
      },
    },
    nodes: [codeNode, downstreamNode],
    liveConnections: [],
    recoverableConnections: [connection],
    project,
    referencedProjects: {},
    projectNodeRegistry: registry,
  });

  assert.deepEqual(result.nextConnections, [connection]);
  assert.deepEqual(result.nextRecoverableConnections, []);
});
