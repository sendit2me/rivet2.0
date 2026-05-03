import {
  coerceTypeOptional,
  extractInterpolationVariables,
  interpolate,
  type ChartNode,
  type DataValue,
  type NodeGraph,
  type NodeId,
  type PortId,
} from '@rivet2/rivet-core';

const API_KEY_INPUT_ID = 'apiKey' as PortId;
const TEXT_OUTPUT_ID = 'output' as PortId;
const GRAPH_INPUT_OUTPUT_ID = 'data' as PortId;

type StaticOutputResolverState = {
  graph: NodeGraph;
  nodesById: Map<NodeId, ChartNode>;
  visited: Set<string>;
};

export function getStaticInputApiKey(options: { graph: NodeGraph | undefined; nodeId: NodeId }): string | undefined {
  const graph = options.graph;
  if (!graph) {
    return undefined;
  }

  const value = resolveStaticInputValue(
    {
      graph,
      nodesById: new Map(graph.nodes.map((node) => [node.id, node])),
      visited: new Set(),
    },
    options.nodeId,
    API_KEY_INPUT_ID,
  );

  return coerceTypeOptional(value, 'string')?.trim() || undefined;
}

function resolveStaticInputValue(
  state: StaticOutputResolverState,
  inputNodeId: NodeId,
  inputId: PortId,
): DataValue | undefined {
  const connection = state.graph.connections.find(
    (candidate) => candidate.inputNodeId === inputNodeId && candidate.inputId === inputId,
  );

  if (!connection) {
    return undefined;
  }

  const sourceNode = state.nodesById.get(connection.outputNodeId);
  if (!sourceNode) {
    return undefined;
  }

  return resolveStaticOutputValue(state, sourceNode, connection.outputId);
}

function resolveStaticOutputValue(
  state: StaticOutputResolverState,
  node: ChartNode,
  outputId: PortId,
): DataValue | undefined {
  const visitKey = `${node.id}:${outputId}`;
  if (state.visited.has(visitKey)) {
    return undefined;
  }

  state.visited.add(visitKey);
  try {
    switch (node.type) {
      case 'text':
        return resolveTextNodeOutput(state, node, outputId);
      case 'graphInput':
        return resolveGraphInputNodeOutput(node, outputId);
      case 'passthrough':
        return resolvePassthroughNodeOutput(state, node, outputId);
      default:
        return undefined;
    }
  } finally {
    state.visited.delete(visitKey);
  }
}

function resolveTextNodeOutput(
  state: StaticOutputResolverState,
  node: ChartNode,
  outputId: PortId,
): DataValue | undefined {
  if (outputId !== TEXT_OUTPUT_ID) {
    return undefined;
  }

  const data = node.data as { text?: string; normalizeLineEndings?: boolean };
  const text = data.text ?? '';
  const inputMap: Record<string, DataValue> = {};

  for (const inputName of extractInterpolationVariables(text)) {
    const value = resolveStaticInputValue(state, node.id, inputName as PortId);
    if (!value) {
      return undefined;
    }

    inputMap[inputName] = value;
  }

  let value = interpolate(text, inputMap);
  if (data.normalizeLineEndings) {
    value = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  return {
    type: 'string',
    value,
  };
}

function resolveGraphInputNodeOutput(node: ChartNode, outputId: PortId): DataValue | undefined {
  if (outputId !== GRAPH_INPUT_OUTPUT_ID) {
    return undefined;
  }

  const data = node.data as { dataType?: string; defaultValue?: unknown; useDefaultValueInput?: boolean };
  if (data.dataType !== 'string' || data.useDefaultValueInput || data.defaultValue == null) {
    return undefined;
  }

  return {
    type: 'string',
    value: String(data.defaultValue),
  };
}

function resolvePassthroughNodeOutput(
  state: StaticOutputResolverState,
  node: ChartNode,
  outputId: PortId,
): DataValue | undefined {
  const outputIndex = /^output(\d+)$/.exec(outputId)?.[1];
  if (!outputIndex) {
    return undefined;
  }

  return resolveStaticInputValue(state, node.id, `input${outputIndex}` as PortId);
}
