import {
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type Project,
} from '@ironclad/rivet-core';

export type ConnectedGraphInputUsage = {
  callerLabel: string;
  inputId: string;
  displayPath: string;
  graphId: GraphId;
  graphName: string;
  callerNodeId: NodeId;
  callerNodeTitle: string;
  callerType: 'subGraph' | 'callGraph';
};

const CALL_GRAPH_GRAPH_INPUT_ID = 'graph';
const CALL_GRAPH_INPUTS_INPUT_ID = 'inputs';
const GRAPH_REFERENCE_OUTPUT_ID = 'graph';
const OBJECT_OUTPUT_ID = 'output';

function formatGraphInputUsageCallerLabel({
  callerNodeTitle,
  callerType,
}: {
  callerNodeTitle: string;
  callerType: ConnectedGraphInputUsage['callerType'];
}) {
  const callerTypeLabel = callerType === 'callGraph' ? 'Call Graph' : 'Subgraph';
  const callerTitle = callerNodeTitle.trim() || callerTypeLabel;

  return callerTitle === callerTypeLabel ? callerTitle : `${callerTitle} (${callerTypeLabel})`;
}

function createConnectedGraphInputUsage(
  usage: Omit<ConnectedGraphInputUsage, 'callerLabel' | 'displayPath'>,
): ConnectedGraphInputUsage {
  const callerLabel = formatGraphInputUsageCallerLabel(usage);

  return {
    ...usage,
    callerLabel,
    displayPath: `${usage.graphName} / ${callerLabel} / ${usage.inputId}`,
  };
}

function getGraphInputIdsRemovedByDeletingNodes(nodes: readonly ChartNode[], nodeIdsToDelete: ReadonlySet<NodeId>) {
  const deletedInputIds = new Set<string>();
  const remainingInputIds = new Set<string>();

  for (const node of nodes) {
    if (node.type !== 'graphInput') {
      continue;
    }

    const inputId = String((node.data as { id?: unknown }).id ?? '');

    if (nodeIdsToDelete.has(node.id)) {
      deletedInputIds.add(inputId);
    } else {
      remainingInputIds.add(inputId);
    }
  }

  const removedInputIds = new Set<string>();

  for (const inputId of deletedInputIds) {
    if (!remainingInputIds.has(inputId)) {
      removedInputIds.add(inputId);
    }
  }

  return removedInputIds;
}

function getGraphsToSearch({
  currentGraph,
  currentGraphId,
  project,
}: {
  currentGraph: Pick<NodeGraph, 'connections' | 'nodes'>;
  currentGraphId: GraphId;
  project: Project;
}): Array<{ graphId: GraphId; graph: Pick<NodeGraph, 'connections' | 'metadata' | 'nodes'> }> {
  const graphs = Object.entries(project.graphs).map(([graphId, graph]) => ({
    graphId: graphId as GraphId,
    graph:
      graphId === currentGraphId
        ? {
            ...graph,
            connections: currentGraph.connections,
            nodes: currentGraph.nodes,
          }
        : graph,
  }));

  if (graphs.some((entry) => entry.graphId === currentGraphId)) {
    return graphs;
  }

  return [
    ...graphs,
    {
      graphId: currentGraphId,
      graph: {
        connections: currentGraph.connections,
        metadata: {
          id: currentGraphId,
          name: 'Current Graph',
          description: '',
        },
        nodes: currentGraph.nodes,
      },
    },
  ];
}

function getConnectionsByInputNodeId(connections: readonly NodeConnection[]) {
  const byInputNodeId = new Map<NodeId, NodeConnection[]>();

  for (const connection of connections) {
    const existingConnections = byInputNodeId.get(connection.inputNodeId) ?? [];
    existingConnections.push(connection);
    byInputNodeId.set(connection.inputNodeId, existingConnections);
  }

  return byInputNodeId;
}

function getInputConnection(
  connectionsByInputNodeId: ReadonlyMap<NodeId, readonly NodeConnection[]>,
  nodeId: NodeId,
  inputId: string,
) {
  return connectionsByInputNodeId.get(nodeId)?.find((connection) => connection.inputId === inputId);
}

function extractTopLevelObjectKeys(jsonTemplate: string): Set<string> | undefined {
  const trimmedTemplate = jsonTemplate.trim();

  if (!trimmedTemplate) {
    return new Set();
  }

  if (trimmedTemplate.startsWith('{{')) {
    return undefined;
  }

  // undefined means the inputs object may be dynamic, so callers should warn conservatively.
  if (trimmedTemplate[0] !== '{') {
    return trimmedTemplate.includes('{{') ? undefined : new Set();
  }

  const keys = new Set<string>();
  let depth = 0;
  let inString = false;
  let isEscaped = false;
  let stringStart = -1;

  for (let index = 0; index < jsonTemplate.length; index++) {
    const char = jsonTemplate[index]!;

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char !== '"') {
        continue;
      }

      inString = false;

      if (depth !== 1) {
        continue;
      }

      let nextNonWhitespaceIndex = index + 1;
      while (/\s/.test(jsonTemplate[nextNonWhitespaceIndex] ?? '')) {
        nextNonWhitespaceIndex++;
      }

      if (jsonTemplate[nextNonWhitespaceIndex] !== ':') {
        continue;
      }

      try {
        const key = JSON.parse(jsonTemplate.slice(stringStart, index + 1));

        if (typeof key !== 'string') {
          return undefined;
        }

        if (key.includes('{{')) {
          return undefined;
        }

        keys.add(key);
      } catch {
        return undefined;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      stringStart = index;
      continue;
    }

    if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;

      if (depth < 0) {
        return undefined;
      }
    }
  }

  if (inString || depth !== 0) {
    return undefined;
  }

  return keys;
}

function getCallGraphInputKeys(
  inputsConnection: NodeConnection,
  nodesById: ReadonlyMap<NodeId, ChartNode>,
): ReadonlySet<string> | undefined {
  const inputSourceNode = nodesById.get(inputsConnection.outputNodeId);

  if (inputSourceNode?.type !== 'object' || inputsConnection.outputId !== OBJECT_OUTPUT_ID) {
    return undefined;
  }

  return extractTopLevelObjectKeys(String((inputSourceNode.data as { jsonTemplate?: unknown }).jsonTemplate ?? ''));
}

function getStaticGraphReferenceTargetGraphId(
  graphConnection: NodeConnection | undefined,
  nodesById: ReadonlyMap<NodeId, ChartNode>,
) {
  if (!graphConnection || graphConnection.outputId !== GRAPH_REFERENCE_OUTPUT_ID) {
    return undefined;
  }

  const graphReferenceNode = nodesById.get(graphConnection.outputNodeId);

  if (graphReferenceNode?.type !== 'graphReference') {
    return undefined;
  }

  const data = graphReferenceNode.data as { graphId?: GraphId; useGraphIdOrNameInput?: boolean };

  if (data.useGraphIdOrNameInput) {
    return undefined;
  }

  return data.graphId;
}

export function findConnectedGraphInputUsages({
  currentGraph,
  currentGraphId,
  nodeIdsToDelete,
  project,
}: {
  currentGraph: Pick<NodeGraph, 'connections' | 'nodes'>;
  currentGraphId: GraphId | undefined;
  nodeIdsToDelete: readonly NodeId[];
  project: Project;
}): ConnectedGraphInputUsage[] {
  if (!currentGraphId) {
    return [];
  }

  const removedInputIds = getGraphInputIdsRemovedByDeletingNodes(currentGraph.nodes, new Set(nodeIdsToDelete));

  if (removedInputIds.size === 0) {
    return [];
  }

  const deletedNodeIds = new Set(nodeIdsToDelete);
  const usages: ConnectedGraphInputUsage[] = [];
  const usageKeys = new Set<string>();

  function addUsage(usage: Omit<ConnectedGraphInputUsage, 'callerLabel' | 'displayPath'>) {
    const usageKey = `${usage.graphId}:${usage.callerType}:${usage.callerNodeId}:${usage.inputId}`;

    if (usageKeys.has(usageKey)) {
      return;
    }

    usageKeys.add(usageKey);
    usages.push(createConnectedGraphInputUsage(usage));
  }

  for (const graphEntry of getGraphsToSearch({ currentGraph, currentGraphId, project })) {
    const { graphId, graph } = graphEntry;
    const isCurrentGraph: boolean = graphId === currentGraphId;
    const nodesToSearch: ChartNode[] = isCurrentGraph
      ? graph.nodes.filter((node) => !deletedNodeIds.has(node.id))
      : graph.nodes;
    const connectionsToSearch: NodeConnection[] = isCurrentGraph
      ? graph.connections.filter(
          (connection) =>
            !deletedNodeIds.has(connection.inputNodeId) && !deletedNodeIds.has(connection.outputNodeId),
        )
      : graph.connections;
    const graphName = graph.metadata?.name ?? graphId;
    const nodesById = new Map<NodeId, ChartNode>(nodesToSearch.map((node) => [node.id, node]));
    const connectionsByInputNodeId = getConnectionsByInputNodeId(connectionsToSearch);

    for (const node of nodesToSearch) {
      if (node.type === 'subGraph' && (node.data as { graphId?: GraphId }).graphId === currentGraphId) {
        const inputConnections = connectionsByInputNodeId.get(node.id) ?? [];

        for (const connection of inputConnections) {
          if (!removedInputIds.has(connection.inputId)) {
            continue;
          }

          addUsage({
            graphId,
            graphName,
            inputId: connection.inputId,
            callerNodeId: node.id,
            callerNodeTitle: node.title,
            callerType: 'subGraph',
          });
        }
      }

      if (node.type !== 'callGraph') {
        continue;
      }

      const graphConnection = getInputConnection(
        connectionsByInputNodeId,
        node.id,
        CALL_GRAPH_GRAPH_INPUT_ID,
      );
      const targetGraphId = getStaticGraphReferenceTargetGraphId(graphConnection, nodesById);

      if (targetGraphId !== currentGraphId) {
        continue;
      }

      const inputsConnection = getInputConnection(
        connectionsByInputNodeId,
        node.id,
        CALL_GRAPH_INPUTS_INPUT_ID,
      );

      if (!inputsConnection) {
        continue;
      }

      const inputKeys = getCallGraphInputKeys(inputsConnection, nodesById);

      for (const inputId of removedInputIds) {
        if (inputKeys && !inputKeys.has(inputId)) {
          continue;
        }

        addUsage({
          graphId,
          graphName,
          inputId,
          callerNodeId: node.id,
          callerNodeTitle: node.title,
          callerType: 'callGraph',
        });
      }
    }
  }

  return usages;
}
