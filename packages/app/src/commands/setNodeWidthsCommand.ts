import { type ChartNode, type NodeId } from '@valerypopoff/rivet2-core';
import { useSetAtom } from 'jotai';
import { useCommand } from './Command';
import { nodesState } from '../state/graph';

export type NodeWidthChange = {
  nodeId: NodeId;
  width: number;
};

type PreviousNodeWidth = {
  nodeId: NodeId;
  width?: number;
};

function setNodeVisualWidth(node: ChartNode, width: number | undefined): ChartNode {
  const visualData = { ...node.visualData };

  if (width == null) {
    delete visualData.width;
  } else {
    visualData.width = width;
  }

  return {
    ...node,
    visualData,
  };
}

export function useSetNodeWidthsCommand() {
  const setNodes = useSetAtom(nodesState);

  return useCommand<
    {
      widths: NodeWidthChange[];
    },
    {
      previousWidths: PreviousNodeWidth[];
    }
  >({
    type: 'setNodeWidths',
    apply(params, _appliedData, currentState) {
      const nextWidthsByNodeId = new Map(params.widths.map((widthChange) => [widthChange.nodeId, widthChange.width]));
      const previousWidths = params.widths.map((widthChange) => {
        const node = currentState.nodes.find((candidate) => candidate.id === widthChange.nodeId);

        if (!node) {
          throw new Error(`Node with id ${widthChange.nodeId} not found`);
        }

        return {
          nodeId: widthChange.nodeId,
          width: node.visualData.width,
        };
      });

      setNodes(
        currentState.nodes.map((node) => {
          const nextWidth = nextWidthsByNodeId.get(node.id);
          return nextWidth == null ? node : setNodeVisualWidth(node, nextWidth);
        }),
      );

      return { previousWidths };
    },
    undo(_data, appliedData, currentState) {
      const previousWidthsByNodeId = new Map(
        appliedData.previousWidths.map((previousWidth) => [previousWidth.nodeId, previousWidth.width]),
      );

      setNodes(
        currentState.nodes.map((node) => {
          return previousWidthsByNodeId.has(node.id)
            ? setNodeVisualWidth(node, previousWidthsByNodeId.get(node.id))
            : node;
        }),
      );
    },
  });
}
