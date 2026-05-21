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
import { propagateGraphOutputRename } from './graphOutputRenamePropagation.js';

const registry = createBuiltInRegistry();
const subGraphId = 'sub-graph' as GraphId;
const parentGraphId = 'parent-graph' as GraphId;

function makeGraphOutput(nodeId: string, outputId: string): ChartNode {
  const node = registry.createDynamic('graphOutput');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    id: outputId,
  };
  return node;
}

function makeTextNode(nodeId: string): ChartNode {
  const node = registry.createDynamic('text');
  node.id = nodeId as NodeId;
  return node;
}

function makeSubGraphNode(nodeId: string, graphId = subGraphId): ChartNode {
  const node = registry.createDynamic('subGraph');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId,
  };
  return node;
}

function makeGraphReferenceNode(nodeId: string, graphId = subGraphId): ChartNode {
  const node = registry.createDynamic('graphReference');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId,
    useGraphIdOrNameInput: false,
  };
  return node;
}

function makeCallGraphNode(nodeId: string): ChartNode {
  const node = registry.createDynamic('callGraph');
  node.id = nodeId as NodeId;
  return node;
}

function makeConnection(overrides: Partial<NodeConnection> = {}): NodeConnection {
  return {
    outputNodeId: 'subgraph' as NodeId,
    outputId: 'old' as PortId,
    inputNodeId: 'target' as NodeId,
    inputId: 'input' as PortId,
    ...overrides,
  };
}

function makeGraph(id: GraphId, nodes: ChartNode[], connections: NodeConnection[] = []): NodeGraph {
  return {
    metadata: {
      id,
      name: id,
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

test('propagateGraphOutputRename renames direct subgraph output connections', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const subGraphNode = makeSubGraphNode('subgraph');
  const targetNode = makeTextNode('target');
  const parentConnection = makeConnection();
  const parentGraph = makeGraph(parentGraphId, [subGraphNode, targetNode], [parentConnection]);

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [],
    nextCurrentNodes: [nextOutputNode],
    previousCurrentNodes: [previousOutputNode],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(result.projectGraphSnapshots[parentGraphId]!.nextGraph.connections, [
    {
      ...parentConnection,
      outputId: 'new' as PortId,
    },
  ]);
  assert.deepEqual(result.projectGraphSnapshots[parentGraphId]!.previousGraph.connections, [parentConnection]);
});

test('propagateGraphOutputRename preserves fan-out connections from the renamed output', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const subGraphNode = makeSubGraphNode('subgraph');
  const firstConnection = makeConnection({ inputNodeId: 'first-target' as NodeId, inputId: 'value' as PortId });
  const secondConnection = makeConnection({ inputNodeId: 'second-target' as NodeId, inputId: 'value' as PortId });
  const parentGraph = makeGraph(
    parentGraphId,
    [subGraphNode, makeTextNode('first-target'), makeTextNode('second-target')],
    [firstConnection, secondConnection],
  );

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [],
    nextCurrentNodes: [nextOutputNode],
    previousCurrentNodes: [previousOutputNode],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(result.projectGraphSnapshots[parentGraphId]!.nextGraph.connections, [
    {
      ...firstConnection,
      outputId: 'new' as PortId,
    },
    {
      ...secondConnection,
      outputId: 'new' as PortId,
    },
  ]);
});

test('propagateGraphOutputRename drops exact duplicate connections created by the rewrite', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const subGraphNode = makeSubGraphNode('subgraph');
  const oldConnection = makeConnection();
  const newConnection = makeConnection({ outputId: 'new' as PortId });
  const parentGraph = makeGraph(parentGraphId, [subGraphNode, makeTextNode('target')], [oldConnection, newConnection]);

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [],
    nextCurrentNodes: [nextOutputNode],
    previousCurrentNodes: [previousOutputNode],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(result.projectGraphSnapshots[parentGraphId]!.nextGraph.connections, [
    {
      ...oldConnection,
      outputId: 'new' as PortId,
    },
  ]);
});

test('propagateGraphOutputRename does not treat a missing graph output id as an empty-string rename', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  delete (previousOutputNode.data as Record<string, unknown>).id;
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const subGraphNode = makeSubGraphNode('subgraph');
  const parentGraph = makeGraph(
    parentGraphId,
    [subGraphNode],
    [
      makeConnection({
        outputId: '' as PortId,
      }),
    ],
  );

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [],
    nextCurrentNodes: [nextOutputNode],
    previousCurrentNodes: [previousOutputNode],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(result.projectGraphSnapshots, {});
});

test('propagateGraphOutputRename preserves unrelated exact duplicate connections', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const subGraphNode = makeSubGraphNode('subgraph');
  const oldConnection = makeConnection();
  const unrelatedDuplicateConnection = makeConnection({
    outputNodeId: 'other-source' as NodeId,
    outputId: 'output' as PortId,
    inputNodeId: 'other-target' as NodeId,
  });
  const parentGraph = makeGraph(
    parentGraphId,
    [subGraphNode, makeTextNode('target')],
    [unrelatedDuplicateConnection, oldConnection, unrelatedDuplicateConnection],
  );

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [],
    nextCurrentNodes: [nextOutputNode],
    previousCurrentNodes: [previousOutputNode],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(result.projectGraphSnapshots[parentGraphId]!.nextGraph.connections, [
    unrelatedDuplicateConnection,
    {
      ...oldConnection,
      outputId: 'new' as PortId,
    },
    unrelatedDuplicateConnection,
  ]);
});

test('propagateGraphOutputRename does not rewrite while another old graph output remains', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const remainingOldOutputNode = makeGraphOutput('remaining-output-node', 'old');
  const subGraphNode = makeSubGraphNode('subgraph');
  const parentGraph = makeGraph(parentGraphId, [subGraphNode], [makeConnection()]);

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [],
    nextCurrentNodes: [nextOutputNode, remainingOldOutputNode],
    previousCurrentNodes: [previousOutputNode, remainingOldOutputNode],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(result.projectGraphSnapshots, {});
});

test('propagateGraphOutputRename updates recursive current-graph subgraph callers', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const targetNode = makeTextNode('target');
  const connection = makeConnection({
    outputNodeId: subGraphNode.id,
    inputNodeId: targetNode.id,
  });

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [connection],
    nextCurrentNodes: [nextOutputNode, subGraphNode, targetNode],
    previousCurrentNodes: [previousOutputNode, subGraphNode, targetNode],
    project: makeProject([]),
  });

  assert.deepEqual(result.nextCurrentConnections, [
    {
      ...connection,
      outputId: 'new' as PortId,
    },
  ]);
  assert.deepEqual(result.projectGraphSnapshots, {});
});

test('propagateGraphOutputRename leaves graph reference and call graph paths unchanged', () => {
  const previousOutputNode = makeGraphOutput('output-node', 'old');
  const nextOutputNode = makeGraphOutput('output-node', 'new');
  const graphReferenceNode = makeGraphReferenceNode('graph-reference');
  const callGraphNode = makeCallGraphNode('call-graph');
  const graphConnection = makeConnection({
    outputNodeId: graphReferenceNode.id,
    outputId: 'graph' as PortId,
    inputNodeId: callGraphNode.id,
    inputId: 'graph' as PortId,
  });
  const parentGraph = makeGraph(parentGraphId, [graphReferenceNode, callGraphNode], [graphConnection]);

  const result = propagateGraphOutputRename({
    currentGraphId: subGraphId,
    editedNodeId: previousOutputNode.id,
    nextCurrentConnections: [],
    nextCurrentNodes: [nextOutputNode],
    previousCurrentNodes: [previousOutputNode],
    project: makeProject([parentGraph]),
  });

  assert.deepEqual(result.projectGraphSnapshots, {});
});
