import stableStringify from 'safe-stable-stringify';
import type { ChartNode, NodeConnection, NodeId } from '../model/NodeBase.js';
import type { GraphId, NodeGraph } from '../model/NodeGraph.js';
import type { Project } from '../model/Project.js';

export type ProjectComparisonChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';

export type ProjectNodeComparison = {
  id: NodeId;
  kind: ProjectComparisonChangeKind;
  before?: ChartNode;
  after?: ChartNode;
};

export type ProjectNodeFieldComparison = {
  field: string;
  path: string[];
  before?: unknown;
  after?: unknown;
};

export type ProjectConnectionComparison = {
  key: string;
  kind: ProjectComparisonChangeKind;
  before?: NodeConnection;
  after?: NodeConnection;
};

export type ProjectGraphComparison = {
  id: GraphId;
  kind: ProjectComparisonChangeKind;
  before?: NodeGraph;
  after?: NodeGraph;
  metadataChanged: boolean;
  nodes: Record<NodeId, ProjectNodeComparison>;
  connections: Record<string, ProjectConnectionComparison>;
  summary: {
    addedNodes: number;
    removedNodes: number;
    changedNodes: number;
    addedConnections: number;
    removedConnections: number;
    changedConnections: number;
  };
};

export type ProjectComparison = {
  beforeProjectId: Project['metadata']['id'];
  afterProjectId: Project['metadata']['id'];
  metadataChanged: boolean;
  graphs: Record<GraphId, ProjectGraphComparison>;
  summary: {
    addedGraphs: number;
    removedGraphs: number;
    changedGraphs: number;
    addedNodes: number;
    removedNodes: number;
    changedNodes: number;
    addedConnections: number;
    removedConnections: number;
    changedConnections: number;
  };
};

export function compareProjects(before: Project, after: Project): ProjectComparison {
  const graphIds = unionKeys(before.graphs, after.graphs) as GraphId[];
  const graphs = Object.fromEntries(
    graphIds.map((graphId) => [graphId, compareGraphs(graphId, before.graphs[graphId], after.graphs[graphId])]),
  ) as Record<GraphId, ProjectGraphComparison>;

  const summary = Object.values(graphs).reduce(
    (acc, graph) => {
      if (graph.kind === 'added') acc.addedGraphs += 1;
      if (graph.kind === 'removed') acc.removedGraphs += 1;
      if (graph.kind === 'changed') acc.changedGraphs += 1;

      acc.addedNodes += graph.summary.addedNodes;
      acc.removedNodes += graph.summary.removedNodes;
      acc.changedNodes += graph.summary.changedNodes;
      acc.addedConnections += graph.summary.addedConnections;
      acc.removedConnections += graph.summary.removedConnections;
      acc.changedConnections += graph.summary.changedConnections;
      return acc;
    },
    {
      addedGraphs: 0,
      removedGraphs: 0,
      changedGraphs: 0,
      addedNodes: 0,
      removedNodes: 0,
      changedNodes: 0,
      addedConnections: 0,
      removedConnections: 0,
      changedConnections: 0,
    },
  );

  return {
    beforeProjectId: before.metadata.id,
    afterProjectId: after.metadata.id,
    metadataChanged: !areComparisonValuesEqual(before.metadata, after.metadata),
    graphs,
    summary,
  };
}

export function getProjectConnectionComparisonKey(connection: NodeConnection): string {
  return stableStringify([
    connection.outputNodeId,
    connection.outputId,
    connection.inputNodeId,
    connection.inputId,
  ])!;
}

export function getProjectNodeFieldComparisons(comparison: ProjectNodeComparison): ProjectNodeFieldComparison[] {
  const before = comparison.before;
  const after = comparison.after;

  if (!before || !after) {
    return [];
  }

  const beforeRecord = getComparableNodeRecord(before);
  const afterRecord = getComparableNodeRecord(after);

  return getChangedValueComparisons([], beforeRecord, afterRecord);
}

function compareGraphs(id: GraphId, before: NodeGraph | undefined, after: NodeGraph | undefined): ProjectGraphComparison {
  if (!before && after) {
    const afterNodes = getComparableGraphNodes(after.nodes);
    const afterConnections = getComparableGraphConnections(after.connections, after.nodes);
    const nodes = Object.fromEntries(
      afterNodes.map((node) => [node.id, { id: node.id, kind: 'added', after: node } satisfies ProjectNodeComparison]),
    ) as Record<NodeId, ProjectNodeComparison>;
    const connections = Object.fromEntries(
      afterConnections.map((connection) => [
        getProjectConnectionComparisonKey(connection),
        { key: getProjectConnectionComparisonKey(connection), kind: 'added', after: connection } satisfies ProjectConnectionComparison,
      ]),
    );

    return {
      id,
      kind: 'added',
      after,
      metadataChanged: true,
      nodes,
      connections,
      summary: {
        addedNodes: afterNodes.length,
        removedNodes: 0,
        changedNodes: 0,
        addedConnections: afterConnections.length,
        removedConnections: 0,
        changedConnections: 0,
      },
    };
  }

  if (before && !after) {
    const beforeNodes = getComparableGraphNodes(before.nodes);
    const beforeConnections = getComparableGraphConnections(before.connections, before.nodes);
    const nodes = Object.fromEntries(
      beforeNodes.map((node) => [node.id, { id: node.id, kind: 'removed', before: node } satisfies ProjectNodeComparison]),
    ) as Record<NodeId, ProjectNodeComparison>;
    const connections = Object.fromEntries(
      beforeConnections.map((connection) => [
        getProjectConnectionComparisonKey(connection),
        {
          key: getProjectConnectionComparisonKey(connection),
          kind: 'removed',
          before: connection,
        } satisfies ProjectConnectionComparison,
      ]),
    );

    return {
      id,
      kind: 'removed',
      before,
      metadataChanged: true,
      nodes,
      connections,
      summary: {
        addedNodes: 0,
        removedNodes: beforeNodes.length,
        changedNodes: 0,
        addedConnections: 0,
        removedConnections: beforeConnections.length,
        changedConnections: 0,
      },
    };
  }

  if (!before || !after) {
    throw new Error(`Cannot compare missing graph ${id}`);
  }

  const nodes = compareNodes(getComparableGraphNodes(before.nodes), getComparableGraphNodes(after.nodes));
  const connections = compareConnections(
    getComparableGraphConnections(before.connections, before.nodes),
    getComparableGraphConnections(after.connections, after.nodes),
  );
  const summary = summarizeGraphComparison(nodes, connections);
  const metadataChanged = !areComparisonValuesEqual(before.metadata, after.metadata);
  const hasChanges =
    metadataChanged ||
    summary.addedNodes > 0 ||
    summary.removedNodes > 0 ||
    summary.changedNodes > 0 ||
    summary.addedConnections > 0 ||
    summary.removedConnections > 0 ||
    summary.changedConnections > 0;

  return {
    id,
    kind: hasChanges ? 'changed' : 'unchanged',
    before,
    after,
    metadataChanged,
    nodes,
    connections,
    summary,
  };
}

function getComparableGraphNodes(nodes: ChartNode[]): ChartNode[] {
  return nodes.filter((node) => node.type !== 'comment');
}

function getComparableGraphConnections(connections: NodeConnection[], nodes: ChartNode[]): NodeConnection[] {
  const commentNodeIds = new Set(nodes.filter((node) => node.type === 'comment').map((node) => node.id));
  return connections.filter(
    (connection) => !commentNodeIds.has(connection.outputNodeId) && !commentNodeIds.has(connection.inputNodeId),
  );
}

function compareNodes(beforeNodes: ChartNode[], afterNodes: ChartNode[]): Record<NodeId, ProjectNodeComparison> {
  const beforeById = new Map(beforeNodes.map((node) => [node.id, node]));
  const afterById = new Map(afterNodes.map((node) => [node.id, node]));
  const nodeIds = unionKeys(Object.fromEntries(beforeById), Object.fromEntries(afterById)) as NodeId[];

  return Object.fromEntries(
    nodeIds.map((nodeId) => {
      const before = beforeById.get(nodeId);
      const after = afterById.get(nodeId);

      if (!before && after) {
        return [nodeId, { id: nodeId, kind: 'added', after } satisfies ProjectNodeComparison];
      }

      if (before && !after) {
        return [nodeId, { id: nodeId, kind: 'removed', before } satisfies ProjectNodeComparison];
      }

      return [
        nodeId,
        {
          id: nodeId,
          kind: areComparisonNodesEqual(before, after) ? 'unchanged' : 'changed',
          before,
          after,
        } satisfies ProjectNodeComparison,
      ];
    }),
  ) as Record<NodeId, ProjectNodeComparison>;
}

function compareConnections(
  beforeConnections: NodeConnection[],
  afterConnections: NodeConnection[],
): Record<string, ProjectConnectionComparison> {
  const beforeByKey = new Map(beforeConnections.map((connection) => [getProjectConnectionComparisonKey(connection), connection]));
  const afterByKey = new Map(afterConnections.map((connection) => [getProjectConnectionComparisonKey(connection), connection]));
  const removedKeys = beforeConnections
    .map(getProjectConnectionComparisonKey)
    .filter((key) => !afterByKey.has(key));
  const addedKeys = afterConnections
    .map(getProjectConnectionComparisonKey)
    .filter((key) => !beforeByKey.has(key));
  const changedRemovedKeys = new Set<string>();
  const changedAddedKeys = new Set<string>();

  for (const addedKey of addedKeys) {
    const addedConnection = afterByKey.get(addedKey)!;
    const matchingRemovedKey = removedKeys.find((removedKey) => {
      if (changedRemovedKeys.has(removedKey)) {
        return false;
      }

      const removedConnection = beforeByKey.get(removedKey)!;
      return (
        removedConnection.outputNodeId === addedConnection.outputNodeId &&
        removedConnection.inputNodeId === addedConnection.inputNodeId
      );
    });

    if (matchingRemovedKey) {
      changedRemovedKeys.add(matchingRemovedKey);
      changedAddedKeys.add(addedKey);
    }
  }

  const keys = unionKeys(Object.fromEntries(beforeByKey), Object.fromEntries(afterByKey));

  return Object.fromEntries(
    keys.map((key) => {
      const before = beforeByKey.get(key);
      const after = afterByKey.get(key);
      const kind = changedAddedKeys.has(key) || changedRemovedKeys.has(key)
        ? 'changed'
        : !before && after
          ? 'added'
          : before && !after
            ? 'removed'
            : 'unchanged';

      return [
        key,
        {
          key,
          kind,
          before,
          after,
        } satisfies ProjectConnectionComparison,
      ];
    }),
  );
}

function summarizeGraphComparison(
  nodes: Record<NodeId, ProjectNodeComparison>,
  connections: Record<string, ProjectConnectionComparison>,
): ProjectGraphComparison['summary'] {
  const nodeComparisons = Object.values(nodes);
  const connectionComparisons = Object.values(connections);

  return {
    addedNodes: nodeComparisons.filter((node) => node.kind === 'added').length,
    removedNodes: nodeComparisons.filter((node) => node.kind === 'removed').length,
    changedNodes: nodeComparisons.filter((node) => node.kind === 'changed').length,
    addedConnections: connectionComparisons.filter((connection) => connection.kind === 'added').length,
    removedConnections: connectionComparisons.filter((connection) => connection.kind === 'removed').length,
    changedConnections: connectionComparisons.filter((connection) => connection.kind === 'changed' && connection.after).length,
  };
}

function areComparisonValuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function areComparisonNodesEqual(left: ChartNode | undefined, right: ChartNode | undefined): boolean {
  return areComparisonValuesEqual(
    left ? getComparableNodeRecord(left) : left,
    right ? getComparableNodeRecord(right) : right,
  );
}

function getComparableNodeRecord(node: ChartNode): Record<string, unknown> {
  const { data, visualData, ...rest } = node as unknown as Record<string, unknown>;

  return {
    ...rest,
    data: getComparableNodeData(node, data),
    visualData: getComparableVisualData(visualData),
  };
}

function getComparableNodeData(node: ChartNode, data: unknown): unknown {
  if (node.type !== 'subGraph' || !isComparisonRecord(data)) {
    return data;
  }

  const { inputPortOrder: _inputPortOrder, outputPortOrder: _outputPortOrder, ...semanticData } = data;
  return semanticData;
}

function getComparableVisualData(visualData: unknown): Record<string, unknown> {
  if (!isComparisonRecord(visualData)) {
    return {};
  }

  const { x: _x, y: _y, zIndex: _zIndex, ...semanticVisualData } = visualData;
  return semanticVisualData;
}

function unionKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
}

function getRecordValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function getChangedValueComparisons(
  path: string[],
  before: unknown,
  after: unknown,
): ProjectNodeFieldComparison[] {
  if (areComparisonValuesEqual(before, after)) {
    return [];
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    return unionArrayIndexes(before, after).flatMap((index) =>
      getChangedValueComparisons([...path, String(index)], before[index], after[index]),
    );
  }

  if (isComparisonRecord(before) && isComparisonRecord(after)) {
    return unionKeys(before, after).flatMap((key) =>
      getChangedValueComparisons([...path, key], getRecordValue(before, key), getRecordValue(after, key)),
    );
  }

  return [
    {
      after,
      before,
      field: formatComparisonPath(path),
      path,
    },
  ];
}

function isComparisonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function unionArrayIndexes(left: readonly unknown[], right: readonly unknown[]): number[] {
  const maxLength = Math.max(left.length, right.length);
  return Array.from({ length: maxLength }, (_value, index) => index);
}

function formatComparisonPath(path: readonly string[]): string {
  return path.reduce((formatted, segment) => {
    if (/^\d+$/.test(segment)) {
      return `${formatted}[${segment}]`;
    }

    if (formatted.length === 0) {
      return segment;
    }

    return /^[A-Za-z_$][\w$]*$/.test(segment) ? `${formatted}.${segment}` : `${formatted}[${JSON.stringify(segment)}]`;
  }, '');
}
