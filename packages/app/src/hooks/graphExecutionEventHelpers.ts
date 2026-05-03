import type { GraphId, GraphRunId } from '@rivet2/rivet-core';
import type { GraphViewKey } from '../domain/graphEditing/navigationActions.js';
import type { GraphRunSelection } from '../state/dataFlow.js';

export function removeRunningGraphEntry(runningGraphs: GraphId[], graphId: GraphId): GraphId[] {
  const nextRunningGraphs = [...runningGraphs];
  const graphIndex = nextRunningGraphs.indexOf(graphId);
  if (graphIndex !== -1) {
    nextRunningGraphs.splice(graphIndex, 1);
  }
  return nextRunningGraphs;
}

export function updateSelectedGraphRunForGraphStart(
  previousSelections: Record<GraphViewKey, GraphRunSelection>,
  graphViewKey: GraphViewKey,
): Record<GraphViewKey, GraphRunSelection> {
  const previousSelection = previousSelections[graphViewKey];
  if (previousSelection != null && previousSelection !== 'latest') {
    return previousSelections;
  }

  return {
    ...previousSelections,
    [graphViewKey]: 'latest',
  };
}
