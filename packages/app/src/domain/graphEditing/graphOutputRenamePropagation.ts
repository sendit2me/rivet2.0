import {
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type PortId,
  type Project,
} from '@valerypopoff/rivet2-core';

export type GraphOutputRenameProjectGraphSnapshots = Record<
  GraphId,
  {
    previousGraph: NodeGraph;
    nextGraph: NodeGraph;
  }
>;

export type PropagateGraphOutputRenameResult = {
  nextCurrentConnections: NodeConnection[];
  nextCurrentNodes: ChartNode[];
  projectGraphSnapshots: GraphOutputRenameProjectGraphSnapshots;
};

function getGraphOutputId(node: ChartNode | undefined): string | undefined {
  if (node?.type !== 'graphOutput') {
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
}): { oldOutputId: string; newOutputId: string } | undefined {
  const previousNode = previousCurrentNodes.find((node) => node.id === editedNodeId);
  const nextNode = nextCurrentNodes.find((node) => node.id === editedNodeId);
  const oldOutputId = getGraphOutputId(previousNode);
  const newOutputId = getGraphOutputId(nextNode);

  if (oldOutputId == null || newOutputId == null || oldOutputId === newOutputId) {
    return undefined;
  }

  const oldOutputStillExists = nextCurrentNodes.some(
    (node) => node.id !== editedNodeId && getGraphOutputId(node) === oldOutputId,
  );

  if (oldOutputStillExists) {
    return undefined;
  }

  return { oldOutputId, newOutputId };
}

function getConnectionKey(connection: NodeConnection): string {
  return `${connection.outputNodeId}|${connection.outputId}|${connection.inputNodeId}|${connection.inputId}`;
}

function rewriteConnectionsForSubGraphOutputRename({
  connections,
  newOutputId,
  oldOutputId,
  subGraphNodeId,
}: {
  connections: readonly NodeConnection[];
  newOutputId: string;
  oldOutputId: string;
  subGraphNodeId: NodeId;
}): { connections: NodeConnection[]; changed: boolean } {
  let changed = false;
  const seenKeys = new Map<string, { rewritten: boolean }>();
  const nextConnections: NodeConnection[] = [];

  for (const connection of connections) {
    const rewritten = connection.outputNodeId === subGraphNodeId && connection.outputId === oldOutputId;
    const nextConnection =
      rewritten
        ? {
            ...connection,
            outputId: newOutputId as PortId,
          }
        : connection;
    const key = getConnectionKey(nextConnection);
    const existingConnection = seenKeys.get(key);

    if (existingConnection && (existingConnection.rewritten || rewritten)) {
      changed = true;
      continue;
    }

    seenKeys.set(key, { rewritten });
    nextConnections.push(nextConnection);
    changed ||= nextConnection !== connection;
  }

  return {
    connections: changed ? nextConnections : [...connections],
    changed,
  };
}

function reconcileGraph({
  graph,
  newOutputId,
  oldOutputId,
  targetGraphId,
}: {
  graph: NodeGraph;
  newOutputId: string;
  oldOutputId: string;
  targetGraphId: GraphId;
}): { graph: NodeGraph; changed: boolean } {
  let changed = false;
  let nextConnections = [...graph.connections];

  for (const node of graph.nodes) {
    if (node.type !== 'subGraph' || (node.data as { graphId?: GraphId }).graphId !== targetGraphId) {
      continue;
    }

    const connectionResult = rewriteConnectionsForSubGraphOutputRename({
      connections: nextConnections,
      newOutputId,
      oldOutputId,
      subGraphNodeId: node.id,
    });
    nextConnections = connectionResult.connections;
    changed ||= connectionResult.changed;
  }

  return {
    graph: {
      ...graph,
      nodes: [...graph.nodes],
      connections: changed ? nextConnections : [...graph.connections],
    },
    changed,
  };
}

export function rewriteSubGraphCallerGraphForGraphOutputRename({
  graph,
  newOutputId,
  oldOutputId,
  targetGraphId,
}: {
  graph: NodeGraph;
  newOutputId: string;
  oldOutputId: string;
  targetGraphId: GraphId;
}): { graph: NodeGraph; changed: boolean } {
  return reconcileGraph({
    graph,
    newOutputId,
    oldOutputId,
    targetGraphId,
  });
}

export function propagateGraphOutputRename({
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
}): PropagateGraphOutputRenameResult {
  const fallbackResult: PropagateGraphOutputRenameResult = {
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

  const projectGraphSnapshots: GraphOutputRenameProjectGraphSnapshots = {};
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
      newOutputId: rename.newOutputId,
      oldOutputId: rename.oldOutputId,
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
