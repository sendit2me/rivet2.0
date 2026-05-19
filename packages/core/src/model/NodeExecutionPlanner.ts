import { uniqBy } from 'lodash-es';
import { type DataValue, getScalarTypeOf } from './DataValue.js';
import type {
  ChartNode,
  NodeConnection,
  NodeId,
  NodeInputDefinition,
  NodeOutputDefinition,
} from './NodeBase.js';
import type { Inputs } from './GraphProcessor.js';
import { isNotNull } from '../utils/genericUtilFunctions.js';
import type { GraphExecutionPlan, GraphOutputNodeResult } from './GraphPreprocessor.js';

export type ExecutionState = {
  connections: Record<NodeId, NodeConnection[]>;
  definitions: Record<NodeId, { inputs: NodeInputDefinition[]; outputs: NodeOutputDefinition[] }>;
  erroredNodes: Map<NodeId, Error | string>;
  executionPlan?: GraphExecutionPlan;
  loopControllersSeen: Set<NodeId>;
  nodesById: Record<NodeId, ChartNode>;
  stronglyConnectedComponents: ChartNode[][];
  visitedNodes: Set<NodeId>;
};

export type OutputNodeResult = GraphOutputNodeResult;

export function getStartNodes(
  state: ExecutionState,
  graphNodes: ChartNode[],
  runToNodeIds?: NodeId[],
): ChartNode[] {
  if (runToNodeIds) {
    return graphNodes.filter((node) => runToNodeIds.includes(node.id));
  }

  return state.executionPlan?.startNodes ?? graphNodes.filter((node) => getOutputNodesFrom(state, node).nodes.length === 0);
}

export function getInputNodesTo(state: ExecutionState, node: ChartNode): ChartNode[] {
  const plannedInputNodes = state.executionPlan?.inputNodesByNode[node.id];
  if (plannedInputNodes) {
    return plannedInputNodes;
  }

  const connections = state.connections[node.id];
  if (!connections) {
    return [];
  }

  const connectionsToNode = connections.filter((conn) => conn.inputNodeId === node.id).filter(isNotNull);
  const inputDefinitions = state.definitions[node.id]?.inputs ?? [];

  return connectionsToNode
    .filter((connection) => {
      const connectionDefinition = inputDefinitions.find((def) => def.id === connection.inputId);
      return connectionDefinition != null;
    })
    .map((conn) => state.nodesById[conn.outputNodeId])
    .filter(isNotNull);
}

export function getOutputNodesFrom(state: ExecutionState, node: ChartNode): OutputNodeResult {
  const plannedOutputNodes = state.executionPlan?.outputNodeResultsByNode[node.id];
  if (plannedOutputNodes) {
    return plannedOutputNodes;
  }

  const connections = state.connections[node.id];
  if (!connections) {
    return { nodes: [], connections: [], connectionsToNodes: [] };
  }

  const connectionsFromNode = connections.filter((conn) => conn.outputNodeId === node.id);
  const outputDefinitions = state.definitions[node.id]?.outputs ?? [];
  const outputConnections = connectionsFromNode.filter((connection) => {
    const connectionDefinition = outputDefinitions.find((def) => def.id === connection.outputId);
    return connectionDefinition != null;
  });

  const outputNodes = uniqBy(
    outputConnections.map((conn) => state.nodesById[conn.inputNodeId]).filter(isNotNull),
    (candidate) => candidate.id,
  );

  const connectionsToNodes = outputNodes.map((outputNode) => ({
    connections: outputConnections.filter((conn) => conn.inputNodeId === outputNode.id),
    node: outputNode,
  }));

  return { nodes: outputNodes, connections: outputConnections, connectionsToNodes };
}

export function hasErroredInputNode(
  state: ExecutionState,
  node: ChartNode,
  inputNodes: ChartNode[],
  onTrace?: (message: string) => void,
): boolean {
  for (const inputNode of inputNodes) {
    if (state.erroredNodes.has(inputNode.id)) {
      onTrace?.(`Node ${node.title} has errored input node ${inputNode.title}`);
      return true;
    }
  }

  return false;
}

export function getMissingRequiredInputs(state: ExecutionState, node: ChartNode): NodeInputDefinition[] {
  const plannedMissingInputs = state.executionPlan?.missingRequiredInputsByNode[node.id];
  if (plannedMissingInputs) {
    return plannedMissingInputs;
  }

  const connections = state.connections[node.id] ?? [];

  return state.definitions[node.id]!.inputs.filter((input) => {
    const connectionToInput = connections.find((conn) => conn.inputId === input.id && conn.inputNodeId === node.id);
    return input.required && !connectionToInput;
  });
}

export function getWaitingForInputNode(
  state: ExecutionState,
  node: ChartNode,
  inputNodes: ChartNode[],
  inputValues: Inputs,
): false | string {
  let waitingForInputNode: false | string = false;
  const anyInputIsValid = Object.values(inputValues).some((value) => value && !isControlFlowExcluded(value));

  for (const inputNode of inputNodes) {
    if (
      node.type === 'loopController' &&
      !state.loopControllersSeen.has(node.id) &&
      nodesAreInSameCycle(state, node.id, inputNode.id)
    ) {
      continue;
    }

    if (node.type === 'raceInputs' && state.visitedNodes.has(inputNode.id) && anyInputIsValid) {
      waitingForInputNode = false;
      break;
    }

    if (waitingForInputNode === false && state.visitedNodes.has(inputNode.id) === false) {
      waitingForInputNode = inputNode.title;
    }
  }

  return waitingForInputNode;
}

function nodesAreInSameCycle(state: ExecutionState, a: NodeId, b: NodeId) {
  const plannedCycleIndexByNode = state.executionPlan?.cycleIndexByNode;
  if (plannedCycleIndexByNode) {
    return plannedCycleIndexByNode[a] != null && plannedCycleIndexByNode[a] === plannedCycleIndexByNode[b];
  }

  return state.stronglyConnectedComponents.find(
    (cycle) => cycle.find((node) => node.id === a) && cycle.find((node) => node.id === b),
  );
}

function isControlFlowExcluded(value: DataValue | undefined): boolean {
  return value != null && getScalarTypeOf(value.type) === 'control-flow-excluded';
}
