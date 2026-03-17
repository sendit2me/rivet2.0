import {
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeId,
  type NodeRegistration,
  type Project,
  type ProjectId,
  type ReferencedGraphAliasNode,
} from '@ironclad/rivet-core';
import { cloneDeep, partition } from 'lodash-es';

export function createAddedNode(options: {
  nodeType: string;
  position: { x: number; y: number };
  registry: NodeRegistration<any, any>;
  referencedProjects: Record<ProjectId, Project>;
  appliedId?: NodeId;
}) {
  let nodeType = options.nodeType as string | undefined;
  let referencedProjectId: string | undefined;
  let referencedGraphId: string | undefined;

  if (nodeType?.startsWith('referencedGraphAlias')) {
    [nodeType, referencedProjectId, referencedGraphId] = nodeType.split(':');
  }

  if (!nodeType) {
    throw new Error('Node type is required');
  }

  const newNode = options.registry.createDynamic(nodeType);

  newNode.visualData.x = options.position.x;
  newNode.visualData.y = options.position.y;

  if (options.appliedId) {
    newNode.id = options.appliedId;
  }

  newNode.visualData.width = (newNode.visualData.width ?? 200) + 30;

  if (newNode.type === 'referencedGraphAlias') {
    if (!referencedProjectId || !referencedGraphId) {
      throw new Error('Referenced graph alias node requires project and graph IDs');
    }

    const data = newNode.data as ReferencedGraphAliasNode['data'];
    data.projectId = referencedProjectId as ProjectId;
    data.graphId = referencedGraphId as GraphId;

    const graphName = options.referencedProjects[data.projectId]?.graphs[data.graphId]?.metadata?.name;
    newNode.title = graphName ?? 'Unknown Graph';
  }

  return newNode;
}

export function duplicateNodeWithConnections(options: {
  node: ChartNode;
  connections: NodeConnection[];
  registry: NodeRegistration<any, any>;
}) {
  const newNode = options.registry.createDynamic(options.node.type);
  newNode.data = cloneDeep(options.node.data);
  newNode.visualData = {
    ...options.node.visualData,
    x: options.node.visualData.x,
    y: options.node.visualData.y + 200,
  };
  newNode.title = options.node.title;
  newNode.description = options.node.description;
  newNode.isSplitRun = options.node.isSplitRun;
  newNode.splitRunMax = options.node.splitRunMax;

  const duplicatedIncomingConnections = options.connections
    .filter((connection) => connection.inputNodeId === options.node.id)
    .map((connection) => ({
      ...connection,
      inputNodeId: newNode.id,
    }));

  return {
    newNode,
    duplicatedIncomingConnections,
  };
}

export function deleteNodesFromGraph(options: {
  nodeIds: NodeId[];
  nodes: ChartNode[];
  connections: NodeConnection[];
}) {
  const newNodes = [...options.nodes];
  let newConnections = [...options.connections];
  const removedNodes: ChartNode[] = [];
  const removedConnections: NodeConnection[] = [];

  for (const nodeId of options.nodeIds) {
    const nodeIndex = newNodes.findIndex((node) => node.id === nodeId);
    if (nodeIndex >= 0) {
      const [removedNode] = newNodes.splice(nodeIndex, 1);
      removedNodes.push(removedNode!);
    }

    const [connectionsToRemove, connectionsToKeep] = partition(
      newConnections,
      (connection) => connection.inputNodeId === nodeId || connection.outputNodeId === nodeId,
    );

    newConnections = connectionsToKeep;
    removedConnections.push(...connectionsToRemove);
  }

  return {
    newNodes,
    newConnections,
    removedNodes,
    removedConnections,
  };
}
