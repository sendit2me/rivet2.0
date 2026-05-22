import {
  createBuiltInRegistry,
  type ChartNode,
  type GraphId,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type PortId,
  type Project,
  type ProjectId,
} from '@valerypopoff/rivet2-core';

export function createTestNodeRegistry() {
  return createBuiltInRegistry();
}

const defaultNodeRegistry = createTestNodeRegistry();

type NodeOverrides = Omit<Partial<ChartNode>, 'data' | 'id'> & {
  data?: Record<string, unknown>;
  id?: NodeId | string;
};

function withNodeOverrides(node: ChartNode, overrides: NodeOverrides = {}): ChartNode {
  const { data, id, ...rest } = overrides;

  return {
    ...node,
    ...rest,
    id: (id ?? node.id) as NodeId,
    data: {
      ...(node.data as Record<string, unknown>),
      ...data,
    },
  };
}

export function makeTextNode(nodeId: string, text?: string, overrides?: NodeOverrides): ChartNode {
  const node = defaultNodeRegistry.createDynamic('text');
  node.id = nodeId as NodeId;

  if (text !== undefined) {
    node.data = {
      ...(node.data as Record<string, unknown>),
      text,
    };
  }

  return withNodeOverrides(node, overrides);
}

export function makeObjectNode(nodeId: string, jsonTemplate: string, overrides?: NodeOverrides): ChartNode {
  const node = defaultNodeRegistry.createDynamic('object');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    jsonTemplate,
  };

  return withNodeOverrides(node, overrides);
}

export function makeGraphInputNode(nodeId: string, inputId: string, overrides?: NodeOverrides): ChartNode {
  const node = defaultNodeRegistry.createDynamic('graphInput');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    id: inputId,
  };

  return withNodeOverrides(node, overrides);
}

export function makeGraphOutputNode(nodeId: string, outputId: string, overrides?: NodeOverrides): ChartNode {
  const node = defaultNodeRegistry.createDynamic('graphOutput');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    id: outputId,
  };

  return withNodeOverrides(node, overrides);
}

export function makeSubGraphNode(
  nodeId: string,
  graphId: GraphId | string = 'sub-graph',
  overrides?: NodeOverrides,
): ChartNode {
  const node = defaultNodeRegistry.createDynamic('subGraph');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId,
  };

  return withNodeOverrides(node, overrides);
}

export function makeGraphReferenceNode(
  nodeId: string,
  graphId: GraphId | string = 'sub-graph',
  useGraphIdOrNameInput = false,
  overrides?: NodeOverrides,
): ChartNode {
  const node = defaultNodeRegistry.createDynamic('graphReference');
  node.id = nodeId as NodeId;
  node.data = {
    ...(node.data as Record<string, unknown>),
    graphId,
    useGraphIdOrNameInput,
  };

  return withNodeOverrides(node, overrides);
}

export function makeCallGraphNode(nodeId: string, overrides?: NodeOverrides): ChartNode {
  const node = defaultNodeRegistry.createDynamic('callGraph');
  node.id = nodeId as NodeId;

  return withNodeOverrides(node, overrides);
}

export function makeConnection(overrides: Partial<NodeConnection> = {}): NodeConnection {
  return {
    outputNodeId: 'source' as NodeId,
    outputId: 'output' as PortId,
    inputNodeId: 'target' as NodeId,
    inputId: 'foo' as PortId,
    ...overrides,
  };
}

export function makeGraph(
  id: GraphId | string,
  nodes: ChartNode[] = [],
  connections: NodeConnection[] = [],
  name = String(id),
): NodeGraph {
  return {
    metadata: {
      id: id as GraphId,
      name,
      description: '',
    },
    nodes,
    connections,
  };
}

export function makeProject(graphs: NodeGraph[] = []): Project {
  return {
    metadata: {
      id: 'project' as ProjectId,
      title: 'Project',
      description: '',
    },
    graphs: Object.fromEntries(graphs.map((graph) => [graph.metadata!.id!, graph])),
  } as Project;
}
