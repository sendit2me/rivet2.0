import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBuiltInRegistry,
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type PortId,
  type Project,
  type ProjectId,
} from '@valerypopoff/rivet2-core';
import { filterValidSubGraphConnections } from './connectionValidation.js';

const registry = createBuiltInRegistry();
const subGraphId = 'sub-graph' as GraphId;

function makeTextNode(nodeId: string, text = ''): ChartNode {
  const node = registry.createDynamic('text');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    text,
  };
  return node;
}

function makeSubGraphNode(nodeId: string): ChartNode {
  const node = registry.createDynamic('subGraph');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId: subGraphId,
  };
  return node;
}

function makeGraphInput(id: string): ChartNode {
  const node = registry.createDynamic('graphInput');
  node.data = {
    ...(node.data as Record<string, unknown>),
    id,
    dataType: 'string',
  };
  return node;
}

function makeGraphOutput(id: string): ChartNode {
  const node = registry.createDynamic('graphOutput');
  node.data = {
    ...(node.data as Record<string, unknown>),
    id,
    dataType: 'string',
  };
  return node;
}

function makeProject(subGraphNodes: ChartNode[]): Project {
  return {
    metadata: {
      id: 'project' as ProjectId,
      title: 'Project',
      description: '',
    },
    graphs: {
      [subGraphId]: {
        metadata: {
          id: subGraphId,
          name: 'Subgraph',
          description: '',
        },
        nodes: subGraphNodes,
        connections: [],
      } satisfies NodeGraph,
    },
  } as Project;
}

function makeConnection(overrides: Partial<NodeConnection> = {}): NodeConnection {
  return {
    outputNodeId: 'source' as NodeId,
    outputId: 'output' as PortId,
    inputNodeId: 'subgraph' as NodeId,
    inputId: 'input' as PortId,
    ...overrides,
  };
}

test('filterValidSubGraphConnections keeps valid subgraph input connections', () => {
  const sourceNode = makeTextNode('source');
  const subGraphNode = makeSubGraphNode('subgraph');
  const connection = makeConnection();

  const filtered = filterValidSubGraphConnections({
    connections: [connection],
    nodesById: {
      [sourceNode.id]: sourceNode,
      [subGraphNode.id]: subGraphNode,
    },
    project: makeProject([makeGraphInput('input')]),
    projectNodeRegistry: registry,
    referencedProjects: {},
  });

  assert.deepEqual(filtered, [connection]);
});

test('filterValidSubGraphConnections removes stale subgraph input connections', () => {
  const sourceNode = makeTextNode('source');
  const subGraphNode = makeSubGraphNode('subgraph');
  const connection = makeConnection();

  const filtered = filterValidSubGraphConnections({
    connections: [connection],
    nodesById: {
      [sourceNode.id]: sourceNode,
      [subGraphNode.id]: subGraphNode,
    },
    project: makeProject([makeGraphInput('renamed')]),
    projectNodeRegistry: registry,
    referencedProjects: {},
  });

  assert.deepEqual(filtered, []);
});

test('filterValidSubGraphConnections removes stale subgraph output connections', () => {
  const subGraphNode = makeSubGraphNode('subgraph');
  const targetNode = makeTextNode('target', '{{value}}');
  const connection = makeConnection({
    outputNodeId: subGraphNode.id,
    outputId: 'output' as PortId,
    inputNodeId: targetNode.id,
    inputId: 'value' as PortId,
  });

  const filtered = filterValidSubGraphConnections({
    connections: [connection],
    nodesById: {
      [subGraphNode.id]: subGraphNode,
      [targetNode.id]: targetNode,
    },
    project: makeProject([makeGraphOutput('renamed')]),
    projectNodeRegistry: registry,
    referencedProjects: {},
  });

  assert.deepEqual(filtered, []);
});

test('filterValidSubGraphConnections leaves non-subgraph connections untouched', () => {
  const sourceNode = makeTextNode('source');
  const targetNode = makeTextNode('target');
  const connection = makeConnection({
    inputNodeId: targetNode.id,
    inputId: 'missing' as PortId,
  });

  const filtered = filterValidSubGraphConnections({
    connections: [connection],
    nodesById: {
      [sourceNode.id]: sourceNode,
      [targetNode.id]: targetNode,
    },
    project: makeProject([]),
    projectNodeRegistry: registry,
    referencedProjects: {},
  });

  assert.deepEqual(filtered, [connection]);
});
