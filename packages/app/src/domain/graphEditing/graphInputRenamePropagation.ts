import {
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type PortId,
  type Project,
} from '@valerypopoff/rivet2-core';
import { renameSubGraphPortOrder } from './subGraphPortOrder.js';

export type GraphInputRenameProjectGraphSnapshots = Record<
  GraphId,
  {
    previousGraph: NodeGraph;
    nextGraph: NodeGraph;
  }
>;

export type PropagateGraphInputRenameResult = {
  nextCurrentConnections: NodeConnection[];
  nextCurrentNodes: ChartNode[];
  projectGraphSnapshots: GraphInputRenameProjectGraphSnapshots;
};

function getGraphInputId(node: ChartNode | undefined): string | undefined {
  if (node?.type !== 'graphInput') {
    return undefined;
  }

  const id = (node.data as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function getRename({
  editedNodeId,
  previousCurrentNodes,
  nextCurrentNodes,
}: {
  editedNodeId: NodeId;
  previousCurrentNodes: readonly ChartNode[];
  nextCurrentNodes: readonly ChartNode[];
}): { oldInputId: string; newInputId: string } | undefined {
  const previousNode = previousCurrentNodes.find((node) => node.id === editedNodeId);
  const nextNode = nextCurrentNodes.find((node) => node.id === editedNodeId);
  const oldInputId = getGraphInputId(previousNode);
  const newInputId = getGraphInputId(nextNode);

  if (oldInputId == null || newInputId == null || oldInputId === newInputId) {
    return undefined;
  }

  const oldInputStillExists = nextCurrentNodes.some(
    (node) => node.id !== editedNodeId && getGraphInputId(node) === oldInputId,
  );

  if (oldInputStillExists) {
    return undefined;
  }

  return { oldInputId, newInputId };
}

function renameSubGraphInputData(
  node: ChartNode,
  oldInputId: string,
  newInputId: string,
): { node: ChartNode; changed: boolean } {
  if (node.type !== 'subGraph') {
    return { node, changed: false };
  }

  const nodeData = node.data as Record<string, unknown> & { inputData?: Record<string, unknown> };
  const inputData = nodeData.inputData;

  if (!inputData || !(oldInputId in inputData)) {
    return { node, changed: false };
  }

  const nextInputData = { ...inputData };

  if (!(newInputId in nextInputData)) {
    nextInputData[newInputId] = nextInputData[oldInputId];
  }

  delete nextInputData[oldInputId];

  return {
    node: {
      ...node,
      data: {
        ...nodeData,
        inputData: nextInputData,
      },
    } as ChartNode,
    changed: true,
  };
}

function rewriteConnectionsForSubGraphInputRename({
  connections,
  newInputId,
  oldInputId,
  subGraphNodeId,
}: {
  connections: readonly NodeConnection[];
  newInputId: string;
  oldInputId: string;
  subGraphNodeId: NodeId;
}): { connections: NodeConnection[]; changed: boolean } {
  const hasExistingNewConnection = connections.some(
    (connection) => connection.inputNodeId === subGraphNodeId && connection.inputId === newInputId,
  );
  let keptNewConnection = false;
  let movedOldConnection = false;
  let changed = false;
  const nextConnections: NodeConnection[] = [];

  for (const connection of connections) {
    const isConnectionToSubGraph = connection.inputNodeId === subGraphNodeId;

    if (!isConnectionToSubGraph || (connection.inputId !== oldInputId && connection.inputId !== newInputId)) {
      nextConnections.push(connection);
      continue;
    }

    if (connection.inputId === newInputId) {
      if (keptNewConnection) {
        changed = true;
        continue;
      }

      keptNewConnection = true;
      nextConnections.push(connection);
      continue;
    }

    if (hasExistingNewConnection || movedOldConnection) {
      changed = true;
      continue;
    }

    movedOldConnection = true;
    changed = true;
    nextConnections.push({
      ...connection,
      inputId: newInputId as PortId,
    });
  }

  return {
    connections: changed ? nextConnections : [...connections],
    changed,
  };
}

function reconcileGraph({
  graph,
  newInputId,
  oldInputId,
  targetGraphId,
}: {
  graph: NodeGraph;
  newInputId: string;
  oldInputId: string;
  targetGraphId: GraphId;
}): { graph: NodeGraph; changed: boolean } {
  let changed = false;
  let nextConnections = [...graph.connections];
  const nextNodes = graph.nodes.map((node) => {
    if (node.type !== 'subGraph' || (node.data as { graphId?: GraphId }).graphId !== targetGraphId) {
      return node;
    }

    const connectionResult = rewriteConnectionsForSubGraphInputRename({
      connections: nextConnections,
      newInputId,
      oldInputId,
      subGraphNodeId: node.id,
    });
    nextConnections = connectionResult.connections;
    changed ||= connectionResult.changed;

    const inputDataResult = renameSubGraphInputData(node, oldInputId, newInputId);
    const orderResult = renameSubGraphPortOrder(inputDataResult.node, 'inputPortOrder', oldInputId, newInputId);
    changed ||= inputDataResult.changed || orderResult.changed;
    return orderResult.node;
  });

  return {
    graph: {
      ...graph,
      nodes: changed ? nextNodes : [...graph.nodes],
      connections: changed ? nextConnections : [...graph.connections],
    },
    changed,
  };
}

export function rewriteSubGraphCallerGraphForGraphInputRename({
  graph,
  newInputId,
  oldInputId,
  targetGraphId,
}: {
  graph: NodeGraph;
  newInputId: string;
  oldInputId: string;
  targetGraphId: GraphId;
}): { graph: NodeGraph; changed: boolean } {
  return reconcileGraph({
    graph,
    newInputId,
    oldInputId,
    targetGraphId,
  });
}

export function propagateGraphInputRename({
  currentGraphId,
  editedNodeId,
  nextCurrentConnections,
  nextCurrentNodes,
  previousCurrentNodes,
  project,
}: {
  currentGraphId: GraphId | undefined;
  editedNodeId: NodeId;
  nextCurrentConnections: readonly NodeConnection[];
  nextCurrentNodes: readonly ChartNode[];
  previousCurrentNodes: readonly ChartNode[];
  project: Project;
}): PropagateGraphInputRenameResult {
  const fallbackResult: PropagateGraphInputRenameResult = {
    nextCurrentConnections: [...nextCurrentConnections],
    nextCurrentNodes: [...nextCurrentNodes],
    projectGraphSnapshots: {},
  };

  if (!currentGraphId) {
    return fallbackResult;
  }

  const rename = getRename({
    editedNodeId,
    previousCurrentNodes,
    nextCurrentNodes,
  });

  if (!rename) {
    return fallbackResult;
  }

  const currentGraph: NodeGraph = {
    metadata: project.graphs[currentGraphId]?.metadata ?? {
      id: currentGraphId,
      name: 'Current Graph',
      description: '',
    },
    nodes: [...nextCurrentNodes],
    connections: [...nextCurrentConnections],
  };

  const projectGraphSnapshots: GraphInputRenameProjectGraphSnapshots = {};
  let resolvedCurrentGraph = currentGraph;

  const graphEntries: Array<[GraphId, NodeGraph]> = Object.entries(project.graphs).map(([graphId, graph]) => [
    graphId as GraphId,
    graphId === currentGraphId ? currentGraph : graph,
  ]);

  if (!graphEntries.some(([graphId]) => graphId === currentGraphId)) {
    graphEntries.push([currentGraphId, currentGraph]);
  }

  for (const [graphId, graph] of graphEntries) {
    const { graph: nextGraph, changed } = reconcileGraph({
      graph,
      newInputId: rename.newInputId,
      oldInputId: rename.oldInputId,
      targetGraphId: currentGraphId,
    });

    if (!changed) {
      continue;
    }

    if (graphId === currentGraphId) {
      resolvedCurrentGraph = nextGraph;
      continue;
    }

    projectGraphSnapshots[graphId] = {
      previousGraph: structuredClone(project.graphs[graphId]!),
      nextGraph,
    };
  }

  return {
    nextCurrentConnections: resolvedCurrentGraph.connections,
    nextCurrentNodes: resolvedCurrentGraph.nodes,
    projectGraphSnapshots,
  };
}
