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
} from '@rivet2/rivet-core';
import { findConnectedGraphInputUsages } from './graphInputUsage.js';

const registry = createBuiltInRegistry();
const currentGraphId = 'current-graph' as GraphId;
const parentGraphId = 'parent-graph' as GraphId;

function makeGraphInput(nodeId: string, inputId: string): ChartNode {
  const node = registry.createDynamic('graphInput');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    id: inputId,
  };
  return node;
}

function makeTextNode(nodeId: string): ChartNode {
  const node = registry.createDynamic('text');
  node.id = nodeId as NodeId;
  return node;
}

function makeObjectNode(nodeId: string, jsonTemplate: string): ChartNode {
  const node = registry.createDynamic('object');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    jsonTemplate,
  };
  return node;
}

function makeSubGraphNode(nodeId: string, graphId = currentGraphId): ChartNode {
  const node = registry.createDynamic('subGraph');
  node.id = nodeId as NodeId;
  node.title = 'Call current graph';
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId,
  };
  return node;
}

function makeGraphReferenceNode(
  nodeId: string,
  graphId = currentGraphId,
  useGraphIdOrNameInput = false,
): ChartNode {
  const node = registry.createDynamic('graphReference');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId,
    useGraphIdOrNameInput,
  };
  return node;
}

function makeCallGraphNode(nodeId: string): ChartNode {
  const node = registry.createDynamic('callGraph');
  node.id = nodeId as NodeId;
  node.title = 'Call by reference';
  return node;
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

function makeCallGraphConnections({
  callGraphNodeId = 'call-graph',
  graphReferenceNodeId = 'graph-reference',
  inputSourceNodeId = 'object-source',
}: {
  callGraphNodeId?: string;
  graphReferenceNodeId?: string;
  inputSourceNodeId?: string;
} = {}): NodeConnection[] {
  return [
    makeConnection({
      outputNodeId: graphReferenceNodeId as NodeId,
      outputId: 'graph' as PortId,
      inputNodeId: callGraphNodeId as NodeId,
      inputId: 'graph' as PortId,
    }),
    makeConnection({
      outputNodeId: inputSourceNodeId as NodeId,
      outputId: 'output' as PortId,
      inputNodeId: callGraphNodeId as NodeId,
      inputId: 'inputs' as PortId,
    }),
  ];
}

function makeGraph(id: GraphId, nodes: ChartNode[], connections: NodeConnection[] = []): NodeGraph {
  return {
    metadata: {
      id,
      name: id === parentGraphId ? 'Parent Graph' : 'Current Graph',
      description: '',
    },
    nodes,
    connections,
  };
}

function makeProject(graphs: NodeGraph[]): Project {
  return {
    metadata: {
      id: 'project' as ProjectId,
      title: 'Project',
      description: '',
    },
    graphs: Object.fromEntries(graphs.map((graph) => [graph.metadata!.id!, graph])),
  } as Project;
}

test('findConnectedGraphInputUsages reports connected subgraph input ports removed by deletion', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const sourceNode = makeTextNode('source');
  const subGraphNode = makeSubGraphNode('subgraph');
  const parentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [makeConnection()]);

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, [
    {
      callerLabel: 'Call current graph (Subgraph)',
      graphId: parentGraphId,
      graphName: 'Parent Graph',
      inputId: 'input',
      displayPath: 'Parent Graph / Call current graph (Subgraph) / input',
      callerNodeId: subGraphNode.id,
      callerNodeTitle: 'Call current graph',
      callerType: 'subGraph',
    },
  ]);
});

test('findConnectedGraphInputUsages reports call graph inputs passed through an object node', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const objectNode = makeObjectNode('object-source', '{ "input": "{{value}}", "other": 1 }');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, objectNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, [
    {
      callerLabel: 'Call by reference (Call Graph)',
      graphId: parentGraphId,
      graphName: 'Parent Graph',
      inputId: 'input',
      displayPath: 'Parent Graph / Call by reference (Call Graph) / input',
      callerNodeId: callGraphNode.id,
      callerNodeTitle: 'Call by reference',
      callerType: 'callGraph',
    },
  ]);
});

test('findConnectedGraphInputUsages reports call graph inputs conservatively for dynamic input objects', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const sourceNode = makeTextNode('object-source');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, sourceNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.equal(usages.length, 1);
  assert.equal(usages[0]!.callerType, 'callGraph');
  assert.equal(usages[0]!.inputId, 'input');
});

test('findConnectedGraphInputUsages returns display-ready caller labels without duplicating default type names', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const objectNode = makeObjectNode('object-source', '{ "input": "{{value}}" }');
  const callGraphNode = makeCallGraphNode('call-graph');
  callGraphNode.title = 'Call Graph';
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, objectNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.equal(usages[0]!.callerLabel, 'Call Graph');
  assert.equal(usages[0]!.displayPath, 'Parent Graph / Call Graph / input');
});

test('findConnectedGraphInputUsages ignores call graph object keys that do not include the removed input', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const objectNode = makeObjectNode('object-source', '{ "other": "{{value}}" }');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, objectNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages ignores call graph nodes without an inputs connection', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(parentGraphId, [graphReferenceNode, callGraphNode], [
    makeConnection({
      outputNodeId: graphReferenceNode.id,
      outputId: 'graph' as PortId,
      inputNodeId: callGraphNode.id,
      inputId: 'graph' as PortId,
    }),
  ]);

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages ignores call graph nodes with dynamic graph references', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference', currentGraphId, true);
  const objectNode = makeObjectNode('object-source', '{ "input": "{{value}}" }');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, objectNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages ignores call graph nodes that reference another graph', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference', 'other-graph' as GraphId);
  const objectNode = makeObjectNode('object-source', '{ "input": "{{value}}" }');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, objectNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages reports call graph inputs conservatively for dynamic object keys', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const objectNode = makeObjectNode('object-source', '{ "{{dynamicKey}}": "{{value}}" }');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, objectNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.equal(usages.length, 1);
  assert.equal(usages[0]!.callerType, 'callGraph');
  assert.equal(usages[0]!.inputId, 'input');
});

test('findConnectedGraphInputUsages reports call graph inputs conservatively for dynamic whole-object templates', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const objectNode = makeObjectNode('object-source', '{{inputsObject}}');
  const callGraphNode = makeCallGraphNode('call-graph');
  const parentGraph = makeGraph(
    parentGraphId,
    [graphReferenceNode, objectNode, callGraphNode],
    makeCallGraphConnections(),
  );

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.equal(usages.length, 1);
  assert.equal(usages[0]!.callerType, 'callGraph');
  assert.equal(usages[0]!.inputId, 'input');
});

test('findConnectedGraphInputUsages ignores unconnected subgraph input ports', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const subGraphNode = makeSubGraphNode('subgraph');
  const parentGraph = makeGraph(parentGraphId, [subGraphNode]);

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages ignores deleted duplicate graph inputs when the same port remains', () => {
  const deletedInputNode = makeGraphInput('deleted-input-node', 'input');
  const remainingInputNode = makeGraphInput('remaining-input-node', 'input');
  const sourceNode = makeTextNode('source');
  const subGraphNode = makeSubGraphNode('subgraph');
  const parentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [makeConnection()]);

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [deletedInputNode, remainingInputNode]),
    currentGraphId,
    nodeIdsToDelete: [deletedInputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages ignores subgraph nodes that reference another graph', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const sourceNode = makeTextNode('source');
  const subGraphNode = makeSubGraphNode('subgraph', 'other-graph' as GraphId);
  const parentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [makeConnection()]);

  const usages = findConnectedGraphInputUsages({
    currentGraph: makeGraph(currentGraphId, [inputNode]),
    currentGraphId,
    nodeIdsToDelete: [inputNode.id],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages ignores current-graph usages that are deleted with the input', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const sourceNode = makeTextNode('source');
  const subGraphNode = makeSubGraphNode('subgraph');
  const currentGraph = makeGraph(currentGraphId, [inputNode, sourceNode, subGraphNode], [makeConnection()]);

  const usages = findConnectedGraphInputUsages({
    currentGraph,
    currentGraphId,
    nodeIdsToDelete: [inputNode.id, subGraphNode.id],
    project: makeProject([currentGraph]),
  });

  assert.deepEqual(usages, []);
});

test('findConnectedGraphInputUsages ignores current-graph connections removed with the input', () => {
  const inputNode = makeGraphInput('input-node', 'input');
  const sourceNode = makeTextNode('source');
  const subGraphNode = makeSubGraphNode('subgraph');
  const currentGraph = makeGraph(currentGraphId, [inputNode, sourceNode, subGraphNode], [makeConnection()]);

  const usages = findConnectedGraphInputUsages({
    currentGraph,
    currentGraphId,
    nodeIdsToDelete: [inputNode.id, sourceNode.id],
    project: makeProject([currentGraph]),
  });

  assert.deepEqual(usages, []);
});
