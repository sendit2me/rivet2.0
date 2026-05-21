import type { ChartNode, NodeGraph, Project } from '@valerypopoff/rivet2-core';

export type GlobalVariableOption = {
  label: string;
  value: string;
};

type SetGlobalNodeData = {
  id?: unknown;
  useIdInput?: unknown;
};

function getStaticSetGlobalId(node: ChartNode): string | undefined {
  if (node.type !== 'setGlobal') {
    return undefined;
  }

  const data = node.data as SetGlobalNodeData;
  if (data.useIdInput) {
    return undefined;
  }

  return typeof data.id === 'string' && data.id.trim() ? data.id : undefined;
}

function getGraphsWithLiveGraph(
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

export function getGlobalVariableOptions(
  project: Pick<Project, 'graphs'> | undefined,
  liveGraph?: NodeGraph,
): GlobalVariableOption[] {
  const ids = new Set<string>();

  for (const graph of getGraphsWithLiveGraph(project, liveGraph)) {
    for (const node of graph.nodes ?? []) {
      const id = getStaticSetGlobalId(node);
      if (id != null) {
        ids.add(id);
      }
    }
  }

  return Array.from(ids)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      label: id,
      value: id,
    }));
}
