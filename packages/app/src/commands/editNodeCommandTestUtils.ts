import {
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeId,
  type Project,
} from '@valerypopoff/rivet2-core';
import type { GraphCommandState } from './Command.js';
import { createTestNodeRegistry, makeProject } from '../domain/graphEditing/testGraphBuilders.js';

export const registry = createTestNodeRegistry();
export const graphId = 'graph-1' as GraphId;
export const subGraphId = 'sub-graph' as GraphId;
export const parentGraphId = 'parent-graph' as GraphId;

export function makeCommandState({
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
