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

function resolveNodePortIdsAfterEdit({
  nodeId,
  newNode,
  nodes,
  liveConnections,
  project,
  referencedProjects,
  projectNodeRegistry,
}: Omit<ReconcileNodeEditConnectionsParams, 'recoverableConnections'>): NodePortIds {
  const updatedNodes = buildUpdatedNodes(nodeId, newNode, nodes);
  const nodeConnections = liveConnections.filter((connection) => isIncidentConnection(nodeId, connection));
  const nodesById = Object.fromEntries(updatedNodes.map((node) => [node.id, node]));
  const updatedNode = nodesById[nodeId];

  if (!updatedNode) {
    throw new Error(`Node with id ${nodeId} not found`);
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

function hasValidConnectionPort(
  nodeId: NodeId,
  connection: NodeConnection,
  portIds: NodePortIds,
): boolean {
  if (connection.inputNodeId === nodeId) {
    return portIds.inputPortIds.has(connection.inputId);
  }

  return portIds.outputPortIds.has(connection.outputId);
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
  const validPortIds = resolveNodePortIdsAfterEdit({
    nodeId,
    newNode,
    nodes,
    liveConnections,
    project,
    referencedProjects,
    projectNodeRegistry,
  });
  const newBrokenConnections = dedupeConnections(
    liveConnections.filter(
      (connection) => isIncidentConnection(nodeId, connection) && !hasValidConnectionPort(nodeId, connection, validPortIds),
    ),
  );
  const brokenConnectionKeys = new Set(newBrokenConnections.map(getNodeConnectionKey));
  const currentLiveConnectionKeys = new Set(liveConnections.map(getNodeConnectionKey));
  const occupiedIncomingSlots = new Set(
    liveConnections
      .filter((connection) => connection.inputNodeId === nodeId)
      .map(getInputSlotKey),
  );
  const restorableConnections: NodeConnection[] = [];
  const stillRecoverableConnections: NodeConnection[] = [];

  for (const recoverableConnection of dedupeConnections(
    recoverableConnections.filter((connection) => isIncidentConnection(nodeId, connection)),
  )) {
    const connectionKey = getNodeConnectionKey(recoverableConnection);

    if (currentLiveConnectionKeys.has(connectionKey)) {
      continue;
    }

    if (!hasValidConnectionPort(nodeId, recoverableConnection, validPortIds)) {
      stillRecoverableConnections.push(recoverableConnection);
      continue;
    }

    if (recoverableConnection.inputNodeId === nodeId) {
      const inputSlotKey = getInputSlotKey(recoverableConnection);

      if (occupiedIncomingSlots.has(inputSlotKey)) {
        continue;
      }

      occupiedIncomingSlots.add(inputSlotKey);
    }

    currentLiveConnectionKeys.add(connectionKey);
    restorableConnections.push(recoverableConnection);
  }

  const nextConnections = dedupeConnections([
    ...liveConnections.filter((connection) => !brokenConnectionKeys.has(getNodeConnectionKey(connection))),
    ...restorableConnections,
  ]);
  const nextRecoverableConnections = dedupeConnections([...stillRecoverableConnections, ...newBrokenConnections]);

  return {
    nextConnections,
    nextRecoverableConnections,
  };
}
