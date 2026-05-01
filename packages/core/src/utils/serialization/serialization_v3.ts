import { mapValues } from 'lodash-es';
import type {
  NodeGraph,
  Project,
  GraphId,
  NodeId,
  NodeConnection,
  ChartNode,
  ChartNodeVariant,
  ProjectId,
} from '../../index.js';
import { doubleCheckProject } from './serializationUtils.js';
import {
  type SerializedNodeConnection,
  serializeConnection,
  deserializeConnection,
  parseVisualData,
  packVisualDataV3,
  wrapInYamlEnvelope,
  unwrapYamlEnvelope,
} from './serializationHelpers.js';

type SerializedProject = {
  metadata: {
    id: ProjectId;
    title: string;
    description: string;
  };

  graphs: Record<GraphId, SerializedGraph>;
};

type SerializedGraph = {
  metadata: {
    id: GraphId;
    name: string;
    description: string;
  };

  nodes: Record<NodeId, SerializedNode>;
};

export type SerializedNode = {
  type: string;
  id: string;
  title: string;
  description?: string;
  isSplitRun?: boolean;
  splitRunMax?: number;
  splitRunConcurrency?: number;

  // x/y/width/zIndex
  visualData: `${string}/${string}/${string}/${string}`;
  outgoingConnections: SerializedNodeConnection[];
  data?: unknown;
  variants?: ChartNodeVariant<unknown>[];
};

export function projectV3Deserializer(data: unknown): Project {
  const serializedProject = unwrapYamlEnvelope<SerializedProject>(data, 3, 'Project v3');
  const project = fromSerializedProject(serializedProject);
  doubleCheckProject(project);
  return project;
}

export function graphV3Deserializer(data: unknown): NodeGraph {
  const serializedGraph = unwrapYamlEnvelope<SerializedGraph>(data, 3, 'Graph v3');
  return fromSerializedGraph(serializedGraph);
}

export function projectV3Serializer(project: Project): unknown {
  return wrapInYamlEnvelope(3, toSerializedProject(project));
}

export function graphV3Serializer(graph: NodeGraph): unknown {
  return wrapInYamlEnvelope(3, toSerializedGraph(graph));
}

function toSerializedProject(project: Project): SerializedProject {
  return {
    metadata: project.metadata,
    graphs: mapValues(project.graphs, (graph) => toSerializedGraph(graph)),
  };
}

function fromSerializedProject(serializedProject: SerializedProject): Project {
  return {
    metadata: serializedProject.metadata,
    graphs: mapValues(serializedProject.graphs, (graph) => fromSerializedGraph(graph)) as Record<GraphId, NodeGraph>,
    plugins: [],
  };
}

function toSerializedGraph(graph: NodeGraph): SerializedGraph {
  return {
    metadata: {
      id: graph.metadata!.id!,
      name: graph.metadata!.name!,
      description: graph.metadata!.description!,
    },
    nodes: graph.nodes.reduce(
      (acc, node) => ({
        ...acc,
        [node.id]: toSerializedNode(node, graph.nodes, graph.connections),
      }),
      {} as Record<NodeId, SerializedNode>,
    ),
  };
}

function fromSerializedGraph(serializedGraph: SerializedGraph): NodeGraph {
  const allConnections: NodeConnection[] = [];
  const allNodes: ChartNode[] = [];

  for (const node of Object.values(serializedGraph.nodes)) {
    const [chartNode, connections] = fromSerializedNode(node);
    allNodes.push(chartNode);
    allConnections.push(...connections);
  }

  return {
    metadata: {
      id: serializedGraph.metadata.id,
      name: serializedGraph.metadata.name,
      description: serializedGraph.metadata.description,
    },
    nodes: allNodes,
    connections: allConnections,
  };
}

function toSerializedNode(node: ChartNode, allNodes: ChartNode[], allConnections: NodeConnection[]): SerializedNode {
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    type: node.type,
    visualData: packVisualDataV3(node) as SerializedNode['visualData'],
    isSplitRun: node.isSplitRun,
    splitRunMax: node.splitRunMax,
    splitRunConcurrency: node.splitRunConcurrency,
    data: node.data,
    outgoingConnections: allConnections
      .filter((connection) => connection.outputNodeId === node.id)
      .map((connection) => serializeConnection(connection, allNodes))
      .sort(),
    variants: (node.variants?.length ?? 0) > 0 ? node.variants : undefined,
  };
}

function fromSerializedNode(serializedNode: SerializedNode): [ChartNode, NodeConnection[]] {
  const { x, y, width, zIndex } = parseVisualData(serializedNode.visualData);

  const connections = serializedNode.outgoingConnections.map((conn) =>
    deserializeConnection(conn, serializedNode.id as NodeId),
  );

  return [
    {
      id: serializedNode.id as NodeId,
      title: serializedNode.title,
      description: serializedNode.description,
      type: serializedNode.type,
      isSplitRun: serializedNode.isSplitRun,
      splitRunMax: serializedNode.splitRunMax,
      splitRunConcurrency: serializedNode.splitRunConcurrency,
      visualData: { x, y, width, zIndex },
      data: serializedNode.data,
      variants: serializedNode.variants,
    },
    connections,
  ];
}
