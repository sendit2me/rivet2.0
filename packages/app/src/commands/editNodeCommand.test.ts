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
import type { GraphCommandState } from './Command.js';
import { buildEditNodeAppliedData, shouldMergeEditNodeCommand } from './editNodeCommand.js';

const registry = createBuiltInRegistry();
const graphId = 'graph-1' as GraphId;
const subGraphId = 'sub-graph' as GraphId;
const parentGraphId = 'parent-graph' as GraphId;

function makeProject(graphs: NodeGraph[] = []): Project {
  return {
    metadata: {
      id: 'project' as ProjectId,
      title: 'Project',
      description: '',
    },
    graphs: Object.fromEntries(graphs.map((graph) => [graph.metadata!.id!, graph])),
  } as Project;
}

const project = makeProject();

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

function makeGraphInputNode(nodeId: string, inputId: string): ChartNode {
  const node = registry.createDynamic('graphInput');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    id: inputId,
  };
  return node;
}

function makeSubGraphNode(nodeId: string, targetGraphId = subGraphId): ChartNode {
  const node = registry.createDynamic('subGraph');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId: targetGraphId,
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

function makeCommandState({
  nodes,
  connections,
  graphId: stateGraphId = graphId,
  project = makeProject(),
  recoverableNodeConnections = {},
}: {
  nodes: ChartNode[];
  connections: NodeConnection[];
  graphId?: GraphId;
  project?: Project;
  recoverableNodeConnections?: Record<NodeId, NodeConnection[]>;
}): GraphCommandState {
  return {
    nodes,
    connections,
    recoverableNodeConnections,
    project,
    commandHistoryStack: [],
    graphId: stateGraphId,
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

test('editNode applied data snapshots external subgraph caller rewrites on graph input rename', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'old');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'new',
    },
  } as ChartNode;
  const sourceNode = makeTextNode('source', 'source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const parentConnection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const parentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [parentConnection]);
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), parentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: graphInputNode,
    previousConnections: currentState.connections,
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.previousGraph.connections, [parentConnection]);
  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    {
      ...parentConnection,
      inputId: 'new' as PortId,
    },
  ]);
});

test('editNode merged graph input renames keep the original undo snapshot and final external rewrite', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'new',
    },
  } as ChartNode;
  const sourceNode = makeTextNode('source', 'source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldParentConnection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempParentConnection = {
    ...oldParentConnection,
    inputId: 'temp' as PortId,
  };
  const previousParentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [oldParentConnection]);
  const currentParentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [tempParentConnection]);
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), currentParentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    previousProjectGraphSnapshots: {
      [parentGraphId]: {
        previousGraph: previousParentGraph,
        nextGraph: currentParentGraph,
      },
    },
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.previousGraph.connections, [
    oldParentConnection,
  ]);
  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    {
      ...oldParentConnection,
      inputId: 'new' as PortId,
    },
  ]);
});

test('editNode merged graph input renames preserve original external connections after a transient collision', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'final',
    },
  } as ChartNode;
  const oldSourceNode = makeTextNode('old-source', 'old source');
  const tempSourceNode = makeTextNode('temp-source', 'temp source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldParentConnection = makeConnection({
    outputNodeId: oldSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempParentConnection = makeConnection({
    outputNodeId: tempSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'temp' as PortId,
  });
  const previousParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [oldParentConnection, tempParentConnection],
  );
  const currentParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [tempParentConnection],
  );
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), currentParentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    isMergedEdit: true,
    previousProjectGraphSnapshots: {
      [parentGraphId]: {
        previousGraph: previousParentGraph,
        nextGraph: currentParentGraph,
      },
    },
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    {
      ...oldParentConnection,
      inputId: 'final' as PortId,
    },
    tempParentConnection,
  ]);
});

test('editNode merged graph input renames restore external callers when the final id returns to the original id', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'old',
    },
  } as ChartNode;
  const oldSourceNode = makeTextNode('old-source', 'old source');
  const tempSourceNode = makeTextNode('temp-source', 'temp source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldParentConnection = makeConnection({
    outputNodeId: oldSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempParentConnection = makeConnection({
    outputNodeId: tempSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'temp' as PortId,
  });
  const previousParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [oldParentConnection, tempParentConnection],
  );
  const currentParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [tempParentConnection],
  );
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), currentParentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    isMergedEdit: true,
    previousProjectGraphSnapshots: {
      [parentGraphId]: {
        previousGraph: previousParentGraph,
        nextGraph: currentParentGraph,
      },
    },
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    oldParentConnection,
    tempParentConnection,
  ]);
});

test('editNode merged graph input renames preserve original current-graph connections after a transient collision', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'final',
    },
  } as ChartNode;
  const oldSourceNode = makeTextNode('old-source', 'old source');
  const tempSourceNode = makeTextNode('temp-source', 'temp source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldConnection = makeConnection({
    outputNodeId: oldSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempConnection = makeConnection({
    outputNodeId: tempSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'temp' as PortId,
  });
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode, oldSourceNode, tempSourceNode, subGraphNode],
    connections: [tempConnection],
    project: makeProject([makeGraph(subGraphId, [graphInputNode, oldSourceNode, tempSourceNode, subGraphNode])]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [oldConnection, tempConnection],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    isMergedEdit: true,
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.nextConnections, [
    {
      ...oldConnection,
      inputId: 'final' as PortId,
    },
    tempConnection,
  ]);
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
