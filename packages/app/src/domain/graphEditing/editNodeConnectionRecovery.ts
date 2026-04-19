import { produce } from 'immer';
import {
  type ChartNode,
  type NodeConnection,
  type NodeId,
  type PortId,
  type Project,
  type ProjectId,
  type NodeRegistration,
} from '@ironclad/rivet-core';

export type ReconcileNodeEditConnectionsResult = {
  nextConnections: NodeConnection[];
  nextRecoverableConnections: NodeConnection[];
};

type NodePortIds = {
  inputPortIds: Set<PortId>;
  outputPortIds: Set<PortId>;
};

type ReconcileNodeEditConnectionsParams = {
  nodeId: NodeId;
  newNode: Partial<ChartNode>;
  nodes: readonly ChartNode[];
  liveConnections: readonly NodeConnection[];
  recoverableConnections: readonly NodeConnection[];
  project: Project;
  referencedProjects: Record<ProjectId, Project>;
  projectNodeRegistry: NodeRegistration<any, any>;
};

export function getNodeConnectionKey(connection: NodeConnection): string {
  return `${connection.outputNodeId}|${connection.outputId}|${connection.inputNodeId}|${connection.inputId}`;
}

function getInputSlotKey(connection: NodeConnection): string {
  return `${connection.inputNodeId}|${connection.inputId}`;
}

function isIncidentConnection(nodeId: NodeId, connection: NodeConnection): boolean {
  return connection.inputNodeId === nodeId || connection.outputNodeId === nodeId;
}

function dedupeConnections(connections: readonly NodeConnection[]): NodeConnection[] {
  const seenKeys = new Set<string>();
  const dedupedConnections: NodeConnection[] = [];

  for (const connection of connections) {
    const key = getNodeConnectionKey(connection);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    dedupedConnections.push(structuredClone(connection));
  }

  return dedupedConnections;
}

function buildUpdatedNodes(
  nodeId: NodeId,
  newNode: Partial<ChartNode>,
  nodes: readonly ChartNode[],
): ChartNode[] {
  return produce([...nodes], (draft) => {
    const index = draft.findIndex((node) => node.id === nodeId);

    if (index < 0) {
      throw new Error(`Node with id ${nodeId} not found`);
    }

    draft[index] = {
      ...draft[index],
      ...structuredClone(newNode),
    } as ChartNode;
  });
}

function resolveNodePortIds({
  nodeId,
  nodesById,
  connections,
  project,
  referencedProjects,
  projectNodeRegistry,
}: {
  nodeId: NodeId;
  nodesById: Record<NodeId, ChartNode>;
  connections: readonly NodeConnection[];
  project: Project;
  referencedProjects: Record<ProjectId, Project>;
  projectNodeRegistry: NodeRegistration<any, any>;
}): NodePortIds | undefined {
  const nodeConnections = connections.filter((connection) => isIncidentConnection(nodeId, connection));
  const updatedNode = nodesById[nodeId];

  if (!updatedNode) {
    return undefined;
  }

  const instance = projectNodeRegistry.createDynamicImpl(updatedNode);
  const inputDefinitions = instance.getInputDefinitionsIncludingBuiltIn(
    nodeConnections,
    nodesById,
    project,
    referencedProjects,
  );
  const outputDefinitions = instance.getOutputDefinitions(nodeConnections, nodesById, project, referencedProjects);

  return {
    inputPortIds: new Set(inputDefinitions.map((definition) => definition.id)),
    outputPortIds: new Set(outputDefinitions.map((definition) => definition.id)),
  };
}

function hasValidConnectionPortIds(
  connection: NodeConnection,
  outputPortIds: NodePortIds | undefined,
  inputPortIds: NodePortIds | undefined,
): boolean {
  return !!(
    outputPortIds?.outputPortIds.has(connection.outputId) &&
    inputPortIds?.inputPortIds.has(connection.inputId)
  );
}

export function reconcileNodeEditConnections({
  nodeId,
  newNode,
  nodes,
  liveConnections,
  recoverableConnections,
  project,
  referencedProjects,
  projectNodeRegistry,
}: ReconcileNodeEditConnectionsParams): ReconcileNodeEditConnectionsResult {
  const updatedNodes = buildUpdatedNodes(nodeId, newNode, nodes);
  const nodesById = Object.fromEntries(updatedNodes.map((node) => [node.id, node])) as Record<NodeId, ChartNode>;
  const editedNodePortIds = resolveNodePortIds({
    nodeId,
    nodesById,
    connections: liveConnections,
    project,
    referencedProjects,
    projectNodeRegistry,
  });
  const newBrokenConnections = dedupeConnections(
    liveConnections.filter(
      (connection) =>
        isIncidentConnection(nodeId, connection) &&
        !hasValidConnectionPortIds(
          connection,
          connection.outputNodeId === nodeId
            ? editedNodePortIds
            : resolveNodePortIds({
                nodeId: connection.outputNodeId,
                nodesById,
                connections: liveConnections,
                project,
                referencedProjects,
                projectNodeRegistry,
              }),
          connection.inputNodeId === nodeId
            ? editedNodePortIds
            : resolveNodePortIds({
                nodeId: connection.inputNodeId,
                nodesById,
                connections: liveConnections,
                project,
                referencedProjects,
                projectNodeRegistry,
              }),
        ),
    ),
  );
  const brokenConnectionKeys = new Set(newBrokenConnections.map(getNodeConnectionKey));
  const activeLiveConnections = liveConnections.filter(
    (connection) => !brokenConnectionKeys.has(getNodeConnectionKey(connection)),
  );
  const currentLiveConnectionKeys = new Set(activeLiveConnections.map(getNodeConnectionKey));
  const occupiedIncomingSlots = new Set(activeLiveConnections.map(getInputSlotKey));
  const restorableConnections: NodeConnection[] = [];
  const stillRecoverableConnections: NodeConnection[] = [];

  for (const recoverableConnection of dedupeConnections(
    recoverableConnections.filter((connection) => isIncidentConnection(nodeId, connection)),
  )) {
    const connectionKey = getNodeConnectionKey(recoverableConnection);

    if (currentLiveConnectionKeys.has(connectionKey)) {
      continue;
    }

    const inputSlotKey = getInputSlotKey(recoverableConnection);

    if (occupiedIncomingSlots.has(inputSlotKey)) {
      continue;
    }

    const candidateConnections = [
      ...activeLiveConnections,
      ...restorableConnections,
      recoverableConnection,
    ];
    const outputPortIds = resolveNodePortIds({
      nodeId: recoverableConnection.outputNodeId,
      nodesById,
      connections: candidateConnections,
      project,
      referencedProjects,
      projectNodeRegistry,
    });
    const inputPortIds = resolveNodePortIds({
      nodeId: recoverableConnection.inputNodeId,
      nodesById,
      connections: candidateConnections,
      project,
      referencedProjects,
      projectNodeRegistry,
    });

    if (!hasValidConnectionPortIds(recoverableConnection, outputPortIds, inputPortIds)) {
      stillRecoverableConnections.push(recoverableConnection);
      continue;
    }

    occupiedIncomingSlots.add(inputSlotKey);
    currentLiveConnectionKeys.add(connectionKey);
    restorableConnections.push(recoverableConnection);
  }

  const nextConnections = dedupeConnections([
    ...activeLiveConnections,
    ...restorableConnections,
  ]);
  const nextRecoverableConnections = dedupeConnections([...stillRecoverableConnections, ...newBrokenConnections]);

  return {
    nextConnections,
    nextRecoverableConnections,
  };
}
