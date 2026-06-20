import {
  type NodeId,
  type ChartNode,
  type BuiltInNodeType,
  type PortId,
  type GraphId,
  type NodeGraph,
} from '@valerypopoff/rivet2-core';
import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { lastRunDataByNodeState } from '../state/dataFlow';
import { graphState } from '../state/graph';
import { projectState } from '../state/savedGraphs';
import { entries } from '../utils/typeSafety';
import { useDataRefs } from '../providers/ProvidersContext.js';
import { coerceStoredPortValue } from '../utils/executionDataReaders.js';

export function useTotalRunCost() {
  const lastRunData = useAtomValue(lastRunDataByNodeState);
  const project = useAtomValue(projectState);
  const graph = useAtomValue(graphState);
  const dataRefs = useDataRefs();

  const allNodesById = useMemo(() => {
    if (!project) {
      return {};
    }

    const combinedGraphs: Record<GraphId, NodeGraph> = { ...project.graphs, [graph.metadata!.id!]: graph };
    const allNodes = entries(combinedGraphs).flatMap(([graphId, projectGraph]) => {
      if (projectGraph.metadata!.id! === graph.metadata!.id!) {
        return graph.nodes.map((node) => {
          return { graphId, nodeId: node.id, node };
        });
      }
      return projectGraph.nodes.map((node) => {
        return { graphId, nodeId: node.id, node };
      });
    });

    return Object.fromEntries(allNodes.map((node) => [node.nodeId, node.node])) as Record<NodeId, ChartNode>;
  }, [project, graph]); // TODO this is a lot of calc on every node change

  const totals = useMemo(() => {
    if (!lastRunData) {
      return 0;
    }

    let totalCost = 0;

    for (const [nodeId, nodeLastRunData] of entries(lastRunData)) {
      const node = allNodesById[nodeId];

      if (!node) {
        continue;
      }

      if ((node.type as BuiltInNodeType) === 'subGraph') {
        // Cost is aggregated for subgraphs, but we're aggregating manually here
        continue;
      }

      const cost = nodeLastRunData.reduce((acc: number, curr) => {
        if (curr.data.status?.type !== 'ok') {
          return acc;
        }

        const outputData = curr.data.outputData;

        if (!outputData) {
          return acc;
        }

        const restoredCostArray = coerceStoredPortValue(outputData, 'cost' as PortId, 'number[]', dataRefs);
        if (restoredCostArray) {
          return sumNumberArray(restoredCostArray.value, acc);
        }

        const restoredCost = coerceStoredPortValue(outputData, 'cost' as PortId, 'number', dataRefs);
        if (restoredCost && typeof restoredCost.value === 'number') {
          return restoredCost.value + acc;
        }

        return acc;
      }, 0);

      if (cost) {
        totalCost += cost;
      }
    }

    return totalCost;
  }, [allNodesById, dataRefs, lastRunData]);

  return totals;
}

function sumNumberArray(value: unknown, initialValue: number): number {
  if (!Array.isArray(value)) {
    return initialValue;
  }

  return value.reduce(
    (runningTotal, current) => runningTotal + (typeof current === 'number' ? current : 0),
    initialValue,
  );
}
