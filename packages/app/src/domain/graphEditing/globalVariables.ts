import type { ChartNode, NodeGraph, Project } from '@valerypopoff/rivet2-core';

type SetGlobalNodeData = {
  id?: unknown;
  useIdInput?: unknown;
};

type GetGlobalNodeData = {
  id?: unknown;
  useIdInput?: unknown;
};

export type StaticSetGlobalIdOptions = {
  includeDisabled?: boolean;
};

export function getStaticSetGlobalId(
  node: ChartNode,
  { includeDisabled = true }: StaticSetGlobalIdOptions = {},
): string | undefined {
  if (node.type !== 'setGlobal') {
    return undefined;
  }

  if (!includeDisabled && node.disabled) {
    return undefined;
  }

  const data = node.data as SetGlobalNodeData;
  if (data.useIdInput) {
    return undefined;
  }

  return typeof data.id === 'string' && data.id.trim() ? data.id : undefined;
}

function getStaticGetGlobalId(node: ChartNode): string | undefined {
  if (node.type !== 'getGlobal') {
    return undefined;
  }

  if (node.disabled) {
    return undefined;
  }

  const data = node.data as GetGlobalNodeData;
  if (data.useIdInput) {
    return undefined;
  }

  return typeof data.id === 'string' && data.id.trim() ? data.id : undefined;
}

export function getGraphsWithLiveGraph(
  project: Pick<Project, 'graphs'> | undefined,
  liveGraph: NodeGraph | undefined,
): NodeGraph[] {
  if (!liveGraph) {
    return Object.values(project?.graphs ?? {});
  }

  const liveGraphId = liveGraph.metadata?.id;
  const projectGraphs = Object.values(project?.graphs ?? {});
  const projectGraphsWithoutLiveGraph = liveGraphId
    ? projectGraphs.filter((graph) => graph.metadata?.id !== liveGraphId)
    : projectGraphs;

  return [...projectGraphsWithoutLiveGraph, liveGraph];
}

export function getStaticGlobalVariableIds(
  project: Pick<Project, 'graphs'> | undefined,
  liveGraph?: NodeGraph,
  options?: StaticSetGlobalIdOptions,
): Set<string> {
  const ids = new Set<string>();

  for (const graph of getGraphsWithLiveGraph(project, liveGraph)) {
    for (const node of graph.nodes ?? []) {
      const id = getStaticSetGlobalId(node, options);
      if (id != null) {
        ids.add(id);
      }
    }
  }

  return ids;
}

export function getMissingStaticSetGlobalWarning(
  node: ChartNode,
  staticSetGlobalIds: ReadonlySet<string>,
): string | undefined {
  const id = getStaticGetGlobalId(node);
  if (!id || staticSetGlobalIds.has(id)) {
    return undefined;
  }

  return `No enabled Set Global node in this project sets variable ID "${id}".`;
}
