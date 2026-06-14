import type { GraphId, NodeGraph } from '@valerypopoff/rivet2-core';
import { orderBy } from 'lodash-es';

export type GraphSelectorOption = {
  label: string;
  value: GraphId;
};

export function getProjectGraphSelectorOptions(
  graphs: Record<GraphId, NodeGraph>,
  options: { selectedGraphId?: GraphId; includeMissingSelectedGraph?: boolean } = {},
): GraphSelectorOption[] {
  const graphOptions = orderBy(
    Object.entries(graphs).map(([graphId, graph]) => {
      const value = (graph.metadata?.id ?? graphId) as GraphId;

      return {
        label: graph.metadata?.name ?? graph.metadata?.id ?? graphId,
        value,
      };
    }),
    [(option) => option.label.toLocaleLowerCase(), 'label'],
  );

  if (
    options.includeMissingSelectedGraph &&
    options.selectedGraphId &&
    !graphOptions.some((option) => option.value === options.selectedGraphId)
  ) {
    return [
      {
        label: `Missing graph: ${options.selectedGraphId}`,
        value: options.selectedGraphId,
      },
      ...graphOptions,
    ];
  }

  return graphOptions;
}
