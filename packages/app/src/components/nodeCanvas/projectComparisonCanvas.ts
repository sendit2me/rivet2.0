import type { NodeId, ProjectComparisonChangeKind, ProjectGraphComparison } from '@valerypopoff/rivet2-core';

export function getCanvasNodeCompareKindsById(
  graphComparison: ProjectGraphComparison | undefined,
): Record<NodeId, ProjectComparisonChangeKind | undefined> {
  if (!graphComparison) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(graphComparison.nodes)
      .filter(
        ([, comparison]) =>
          (comparison.kind === 'added' || comparison.kind === 'changed') &&
          comparison.after &&
          comparison.after.type !== 'comment',
      )
      .map(([nodeId, comparison]) => [nodeId, comparison.kind]),
  ) as Record<NodeId, ProjectComparisonChangeKind | undefined>;
}
