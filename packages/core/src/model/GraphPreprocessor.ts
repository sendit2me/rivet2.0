import { values } from '../utils/typeSafety.js';
import { findStronglyConnectedComponents } from './CycleDetector.js';
import type { NodeRegistration } from './NodeRegistration.js';
import type { NodeGraph } from './NodeGraph.js';
import type { NodeConnection, NodeId, ChartNode, NodeInputDefinition, NodeOutputDefinition } from './NodeBase.js';
import type { NodeImpl } from './NodeImpl.js';
import type { Project, ProjectId } from './Project.js';

export type GraphNodeDefinitions = Record<NodeId, { inputs: NodeInputDefinition[]; outputs: NodeOutputDefinition[] }>;

export type GraphPreprocessorResult = {
  connections: Record<NodeId, NodeConnection[]>;
  definitions: GraphNodeDefinitions;
  nodeInstances: Record<NodeId, NodeImpl<ChartNode>>;
  nodesById: Record<NodeId, ChartNode>;
  nodesNotInCycle: ChartNode[];
  stronglyConnectedComponents: ChartNode[][];
};

export function preprocessGraphState(options: {
  graph: NodeGraph;
  loadedProjects: Record<ProjectId, Project>;
  project: Project;
  registry: NodeRegistration<any, any>;
  warnOnInvalidGraph: boolean;
}): GraphPreprocessorResult {
  const { graph, loadedProjects, project, registry, warnOnInvalidGraph } = options;
  const nodeInstances: Record<NodeId, NodeImpl<ChartNode>> = {};
  const nodesById: Record<NodeId, ChartNode> = {};
  const connections: Record<NodeId, NodeConnection[]> = {};

  for (const node of graph.nodes) {
    nodeInstances[node.id] = registry.createDynamicImpl(node);
    nodesById[node.id] = node;
  }

  for (const connection of graph.connections) {
    if (!nodesById[connection.inputNodeId] || !nodesById[connection.outputNodeId]) {
      if (warnOnInvalidGraph) {
        if (!nodesById[connection.inputNodeId]) {
          console.warn(
            `Missing node ${connection.inputNodeId} in graph ${graph} (connection from ${
              nodesById[connection.outputNodeId]?.title
            })`,
          );
        } else {
          console.warn(
            `Missing node ${connection.outputNodeId} in graph ${graph} (connection to ${
              nodesById[connection.inputNodeId]?.title
            }) `,
          );
        }
      }

      continue;
    }

    connections[connection.inputNodeId] ??= [];
    connections[connection.outputNodeId] ??= [];
    connections[connection.inputNodeId]!.push(connection);
    connections[connection.outputNodeId]!.push(connection);
  }

  const definitions = loadInputOutputDefinitions({
    connections,
    loadedProjects,
    nodeInstances,
    nodesById,
    project,
    warnOnInvalidGraph,
  });

  const stronglyConnectedComponents = findStronglyConnectedComponents(graph.nodes, (node) => {
    const nodeConnections = connections[node.id] ?? [];
    return nodeConnections
      .filter((connection) => connection.outputNodeId === node.id)
      .map((connection) => nodesById[connection.inputNodeId]!)
      .filter(Boolean);
  });

  return {
    connections,
    definitions,
    nodeInstances,
    nodesById,
    nodesNotInCycle: stronglyConnectedComponents.filter((component) => component.length === 1).flat(),
    stronglyConnectedComponents,
  };
}

function loadInputOutputDefinitions(options: {
  connections: Record<NodeId, NodeConnection[]>;
  loadedProjects: Record<ProjectId, Project>;
  nodeInstances: Record<NodeId, NodeImpl<ChartNode>>;
  nodesById: Record<NodeId, ChartNode>;
  project: Project;
  warnOnInvalidGraph: boolean;
}): GraphNodeDefinitions {
  const { connections, loadedProjects, nodeInstances, nodesById, project, warnOnInvalidGraph } = options;
  const definitions: GraphNodeDefinitions = {};

  for (const node of values(nodesById)) {
    const connectionsForNode = connections[node.id] ?? [];
    const inputDefinitions = nodeInstances[node.id]!.getInputDefinitionsIncludingBuiltIn(
      connectionsForNode,
      nodesById,
      project,
      loadedProjects,
    );
    const outputDefinitions = nodeInstances[node.id]!.getOutputDefinitions(
      connectionsForNode,
      nodesById,
      project,
      loadedProjects,
    );

    definitions[node.id] = {
      inputs: inputDefinitions,
      outputs: outputDefinitions,
    };

    const invalidConnections = connectionsForNode.filter((connection) => {
      if (connection.inputNodeId === node.id) {
        const inputDefinition = inputDefinitions.find((definition) => definition.id === connection.inputId);

        if (!inputDefinition) {
          if (warnOnInvalidGraph) {
            const sourceNode = nodesById[connection.outputNodeId];
            console.warn(
              `[Warn] Invalid connection going from "${sourceNode?.title}".${connection.outputId} to "${node.title}".${connection.inputId}`,
            );
          }

          return true;
        }
      } else {
        const outputDefinition = outputDefinitions.find((definition) => definition.id === connection.outputId);

        if (!outputDefinition) {
          if (warnOnInvalidGraph) {
            const targetNode = nodesById[connection.inputNodeId];
            console.warn(
              `[Warn] Invalid connection going from "${node.title}".${connection.outputId} to "${targetNode?.title}".${connection.inputId}`,
            );
          }

          return true;
        }
      }

      return false;
    });

    for (const nodeConnections of values(connections)) {
      for (const invalidConnection of invalidConnections) {
        const invalidConnectionIndex = nodeConnections.indexOf(invalidConnection);
        if (invalidConnectionIndex !== -1) {
          nodeConnections.splice(invalidConnectionIndex, 1);
        }
      }
    }
  }

  return definitions;
}
