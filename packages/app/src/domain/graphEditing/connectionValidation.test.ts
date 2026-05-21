import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeId,
  type PortId,
  type Project,
} from '@valerypopoff/rivet2-core';
import { filterValidSubGraphConnections } from './connectionValidation.js';
import {
  createTestNodeRegistry,
  makeConnection as makeBaseConnection,
  makeGraph,
  makeGraphInputNode,
  makeGraphOutputNode,
  makeProject,
  makeSubGraphNode,
  makeTextNode,
} from './testGraphBuilders.js';

const registry = createTestNodeRegistry();
const subGraphId = 'sub-graph' as GraphId;

function makeProjectWithSubGraph(subGraphNodes: ChartNode[]): Project {
  return makeProject([makeGraph(subGraphId, subGraphNodes, [], 'Subgraph')]);
}

function makeConnection(overrides: Partial<NodeConnection> = {}): NodeConnection {
  return makeBaseConnection({
    inputNodeId: 'subgraph' as NodeId,
    inputId: 'input' as PortId,
    ...overrides,
  });
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
    project: makeProjectWithSubGraph([makeGraphInputNode('input-node', 'input')]),
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
    project: makeProjectWithSubGraph([makeGraphInputNode('input-node', 'renamed')]),
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
    project: makeProjectWithSubGraph([makeGraphOutputNode('output-node', 'renamed')]),
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
    project: makeProjectWithSubGraph([]),
    projectNodeRegistry: registry,
    referencedProjects: {},
  });

  assert.deepEqual(filtered, [connection]);
});
