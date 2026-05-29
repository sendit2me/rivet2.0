import type { ChartNode, NodeGraph } from '@valerypopoff/rivet2-core';

type GraphOutputNodeData = {
  id?: unknown;
};

function getEnabledStaticGraphOutputId(node: ChartNode): string | undefined {
  if (node.type !== 'graphOutput' || node.disabled) {
    return undefined;
  }

  const id = (node.data as GraphOutputNodeData).id;
  return typeof id === 'string' && id.trim() ? id : undefined;
}

export function getDuplicateGraphOutputIds(graph: Pick<NodeGraph, 'nodes'> | undefined): Set<string> {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const node of graph?.nodes ?? []) {
    const id = getEnabledStaticGraphOutputId(node);
    if (id == null) {
      continue;
    }

    if (seenIds.has(id)) {
      duplicateIds.add(id);
    } else {
      seenIds.add(id);
    }
  }

  return duplicateIds;
}

export function getDuplicateGraphOutputIdWarning(
  node: ChartNode,
  duplicateGraphOutputIds: ReadonlySet<string>,
): string | undefined {
  const id = getEnabledStaticGraphOutputId(node);
  if (!id || !duplicateGraphOutputIds.has(id)) {
    return undefined;
  }

  return `Another enabled Graph Output node in this graph uses output ID "${id}".`;
}
