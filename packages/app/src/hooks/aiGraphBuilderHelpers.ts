import {
  type DataValue,
  type ExternalFunction,
  globalRivetNodeRegistry,
  type NodeGraph,
  type NodeId,
  type PortId,
  type Project,
} from '@ironclad/rivet-core';

export function parseConnectionOptions(options: unknown) {
  if (
    typeof options !== 'object' ||
    options == null ||
    !('sourceNodeId' in options) ||
    !('destNodeId' in options) ||
    !('sourcePortId' in options) ||
    !('destPortId' in options)
  ) {
    throw new Error('Invalid connection options');
  }

  return options as {
    sourceNodeId: NodeId;
    destNodeId: NodeId;
    sourcePortId: PortId;
    destPortId: PortId;
  };
}

export function buildAiGraphBuilderExternalFunctions(options: {
  project: Project;
  referencedProjects: Record<string, Project>;
  showChanges: () => void;
  workingGraph: () => NodeGraph;
  setWorkingGraph: (graph: NodeGraph) => void;
}): Record<string, ExternalFunction> {
  const getWorkingGraph = options.workingGraph;
  const setWorkingGraph = options.setWorkingGraph;

  return {
    createNode: async (_ctx: unknown, nodeType: unknown) => {
      const graph = getWorkingGraph();
      const newNode = globalRivetNodeRegistry.createDynamic(nodeType as string);
      graph.nodes.push(newNode);
      setWorkingGraph(graph);
      options.showChanges();
      return {
        type: 'string',
        value: newNode.id,
      };
    },
    connectNodes: async (_ctx: unknown, rawOptions: unknown) => {
      const { sourceNodeId, destNodeId, sourcePortId, destPortId } = parseConnectionOptions(rawOptions);
      const graph = getWorkingGraph();
      const sourceNode = graph.nodes.find((node) => node.id === sourceNodeId);
      const destNode = graph.nodes.find((node) => node.id === destNodeId);

      if (!sourceNode) {
        throw new Error(`Node with ID ${sourceNodeId} not found`);
      }

      if (!destNode) {
        throw new Error(`Node with ID ${destNodeId} not found`);
      }

      const sourceInstance = globalRivetNodeRegistry.createDynamicImpl(sourceNode);
      const destInstance = globalRivetNodeRegistry.createDynamicImpl(destNode);
      const sourceNodeConnections = graph.connections.filter((connection) => connection.outputNodeId === sourceNodeId);
      const destNodeConnections = graph.connections.filter((connection) => connection.inputNodeId === destNodeId);
      const nodesById = Object.fromEntries(graph.nodes.map((node) => [node.id, node]));
      const sourcePort = sourceInstance
        .getOutputDefinitions(sourceNodeConnections, nodesById, options.project, options.referencedProjects)
        .find((port) => port.id === sourcePortId);
      const destPort = destInstance
        .getInputDefinitions(destNodeConnections, nodesById, options.project, options.referencedProjects)
        .find((port) => port.id === destPortId);

      if (!sourcePort) {
        throw new Error(`Output port with ID ${sourcePortId} not found on node ${sourceNodeId}`);
      }

      if (!destPort) {
        throw new Error(`Input port with ID ${destPortId} not found on node ${destNodeId}`);
      }

      const alreadyConnectedToDest = graph.connections.find(
        (connection) => connection.inputNodeId === destNodeId && connection.inputId === destPortId,
      );

      if (alreadyConnectedToDest) {
        throw new Error(`Node ${destNodeId} is already connected to this output. Disconnect it first.`);
      }

      graph.connections.push({
        outputNodeId: sourceNodeId,
        outputId: sourcePortId,
        inputNodeId: destNodeId,
        inputId: destPortId,
      });
      setWorkingGraph(graph);
      options.showChanges();

      return {
        type: 'boolean',
        value: true,
      };
    },
    disconnectNodes: async (_ctx: unknown, rawOptions: unknown) => {
      const { sourceNodeId, destNodeId, sourcePortId, destPortId } = parseConnectionOptions(rawOptions);
      const graph = getWorkingGraph();
      const toRemove = graph.connections.find(
        (connection) =>
          connection.outputNodeId === sourceNodeId &&
          connection.inputNodeId === destNodeId &&
          connection.outputId === sourcePortId &&
          connection.inputId === destPortId,
      );

      if (!toRemove) {
        throw new Error('Connection not found. Use reviewGraph to see all connections.');
      }

      graph.connections = graph.connections.filter((connection) => connection !== toRemove);
      setWorkingGraph(graph);
      options.showChanges();

      return {
        type: 'boolean',
        value: true,
      };
    },
    getSerializedGraph: async () => ({
      type: 'string',
      value: JSON.stringify(getWorkingGraph(), null, 2),
    }),
    getPorts: async (_ctx: unknown, nodeId: unknown) => {
      const graph = getWorkingGraph();
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);

      if (!node) {
        throw new Error(`Node with ID ${nodeId} not found`);
      }

      const connectionsToNode = graph.connections.filter(
        (connection) => connection.inputNodeId === node.id || connection.outputNodeId === node.id,
      );
      const instance = globalRivetNodeRegistry.createDynamicImpl(node);
      const nodesById = Object.fromEntries(graph.nodes.map((candidate) => [candidate.id, candidate]));
      const inputs = instance.getInputDefinitions(connectionsToNode, nodesById, options.project, options.referencedProjects);
      const outputs = instance.getOutputDefinitions(connectionsToNode, nodesById, options.project, options.referencedProjects);

      return {
        type: 'object',
        value: {
          inputs: inputs.map((input) => ({
            definition: input,
            connectedTo: connectionsToNode.find(
              (connection) => connection.inputNodeId === node.id && connection.inputId === input.id,
            ),
            actualDataType: node.isSplitRun ? `${input.dataType}[]` : input.dataType,
          })),
          outputs: outputs.map((output) => ({
            definition: output,
            connectedTo: connectionsToNode.filter(
              (connection) => connection.outputNodeId === node.id && connection.outputId === output.id,
            ),
            actualDataType: node.isSplitRun ? `${output.dataType}[]` : output.dataType,
          })),
        },
      } as DataValue;
    },
  };
}
