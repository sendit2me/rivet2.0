import {
  type ChartNode,
  type NodeConnection,
  type NodeId,
  type NodeRegistration,
  type PortId,
  type Project,
  type ProjectId,
} from '@valerypopoff/rivet2-core';

type NodePortIds = {
  inputPortIds: Set<PortId>;
  outputPortIds: Set<PortId>;
} | undefined;

function getConnectionsByNodeId(connections: readonly NodeConnection[]): Record<NodeId, NodeConnection[]> {
  const connectionsByNodeId: Record<NodeId, NodeConnection[]> = {};

  for (const connection of connections) {
    connectionsByNodeId[connection.inputNodeId] ??= [];
    connectionsByNodeId[connection.inputNodeId]!.push(connection);

    connectionsByNodeId[connection.outputNodeId] ??= [];
    connectionsByNodeId[connection.outputNodeId]!.push(connection);
  }

  return connectionsByNodeId;
}

function resolveSubGraphPortIds({
  node,
  nodesById,
  connectionsByNodeId,
  project,
  referencedProjects,
  projectNodeRegistry,
}: {
  node: ChartNode;
  nodesById: Record<NodeId, ChartNode>;
  connectionsByNodeId: Record<NodeId, NodeConnection[]>;
  project: Project;
  referencedProjects: Record<ProjectId, Project>;
  projectNodeRegistry: NodeRegistration<any, any>;
}): NodePortIds {
  if (node.type !== 'subGraph') {
    return undefined;
  }

  try {
    const instance = projectNodeRegistry.createDynamicImpl(node);
    const nodeConnections = connectionsByNodeId[node.id] ?? [];

    return {
      inputPortIds: new Set(
        instance
          .getInputDefinitionsIncludingBuiltIn(nodeConnections, nodesById, project, referencedProjects)
          .map((definition) => definition.id),
      ),
      outputPortIds: new Set(
        instance
          .getOutputDefinitions(nodeConnections, nodesById, project, referencedProjects)
          .map((definition) => definition.id),
      ),
    };
  } catch {
    return undefined;
  }
}

function isSubGraphConnectionValid(
  connection: NodeConnection,
  outputPortIds: NodePortIds,
  inputPortIds: NodePortIds,
): boolean {
  const outputIsValid = outputPortIds ? outputPortIds.outputPortIds.has(connection.outputId) : true;
  const inputIsValid = inputPortIds ? inputPortIds.inputPortIds.has(connection.inputId) : true;

  return outputIsValid && inputIsValid;
}

export function filterValidSubGraphConnections({
  connections,
  nodesById,
  project,
  referencedProjects,
  projectNodeRegistry,
}: {
  connections: readonly NodeConnection[];
  nodesById: Record<NodeId, ChartNode>;
  project: Project;
  referencedProjects: Record<ProjectId, Project>;
  projectNodeRegistry: NodeRegistration<any, any>;
}): NodeConnection[] {
  const connectionsByNodeId = getConnectionsByNodeId(connections);
  const portIdsByNodeId = new Map<NodeId, NodePortIds>();

  const getPortIds = (node: ChartNode) => {
    if (!portIdsByNodeId.has(node.id)) {
      portIdsByNodeId.set(
        node.id,
        resolveSubGraphPortIds({
          node,
          nodesById,
          connectionsByNodeId,
          project,
          referencedProjects,
          projectNodeRegistry,
        }),
      );
    }

    return portIdsByNodeId.get(node.id);
  };

  const filteredConnections = connections.filter((connection) => {
    const outputNode = nodesById[connection.outputNodeId];
    const inputNode = nodesById[connection.inputNodeId];

    if (!outputNode || !inputNode) {
      return true;
    }

    const outputPortIds = getPortIds(outputNode);
    const inputPortIds = getPortIds(inputNode);

    if (!outputPortIds && !inputPortIds) {
      return true;
    }

    return isSubGraphConnectionValid(connection, outputPortIds, inputPortIds);
  });

  return filteredConnections.length === connections.length ? (connections as NodeConnection[]) : filteredConnections;
}
