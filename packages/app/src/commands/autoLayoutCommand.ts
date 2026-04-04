import { type ChartNode, type NodeGraph } from '@ironclad/rivet-core';
import { useSetAtom } from 'jotai';
import { nodesState } from '../state/graph';
import { useCommand } from './Command';
import { useAutoLayoutGraph } from '../hooks/useAutoLayoutGraph';

export function useAutoLayoutCommand(recalculatePortPositions: () => void) {
  const autoLayout = useAutoLayoutGraph();
  const setNodes = useSetAtom(nodesState);

  return useCommand<
    Record<string, never>,
    {
      previousNodes: ChartNode[];
      nextNodes: ChartNode[];
    }
  >({
    type: 'autoLayout',
    apply(_data, appliedData, currentState) {
      const nextNodes =
        appliedData?.nextNodes ??
        autoLayout({
          metadata: undefined,
          nodes: currentState.nodes,
          connections: currentState.connections,
        } as NodeGraph);

      setNodes(nextNodes);
      recalculatePortPositions();

      return {
        previousNodes: appliedData?.previousNodes ?? structuredClone(currentState.nodes),
        nextNodes,
      };
    },
    undo(_data, appliedData) {
      setNodes(appliedData.previousNodes);
      recalculatePortPositions();
    },
  });
}
