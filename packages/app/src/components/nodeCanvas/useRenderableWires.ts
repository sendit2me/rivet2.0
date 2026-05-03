import { useEffect, useMemo, useState } from 'react';
import type { ChartNode, NodeConnection, NodeId, PortId } from '@rivet2/rivet-core';
import { getConnectionCacheKeys, getNodePortPosition } from '../Wire.js';
import type { PortPositions } from '../NodeCanvas.js';
import { lineCrossesViewport } from '../../utils/lineClipping.js';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { markCanvasPerfEnd, markCanvasPerfStart, setCanvasPerf } from './canvasPerfDebug.js';
import { getRenderableWireCandidates } from './getRenderableWireCandidates.js';

type CanvasPositionConverter = (x: number, y: number) => { x: number; y: number };

export function useRenderableWires({
  canvasToClientPosition,
  connections,
  draggingNode,
  draggingWire,
  highlightedNodes,
  highlightedPort,
  isViewportMoving,
  isViewportVisibilitySettled,
  nearViewportNodeIdSet,
  nodesById,
  portPositions,
  runningNodeIdSet,
  visibleNodeIdSet,
}: {
  canvasToClientPosition: CanvasPositionConverter;
  connections: NodeConnection[];
  draggingNode: boolean;
  draggingWire: boolean;
  highlightedNodes?: NodeId[];
  highlightedPort?:
    | {
        isInput: boolean;
        nodeId: NodeId;
        portId: PortId;
      }
    | undefined;
  isViewportMoving: boolean;
  isViewportVisibilitySettled: boolean;
  nearViewportNodeIdSet: ReadonlySet<NodeId>;
  nodesById: Record<NodeId, ChartNode>;
  portPositions: PortPositions;
  runningNodeIdSet: ReadonlySet<NodeId>;
  visibleNodeIdSet: ReadonlySet<NodeId>;
}): NodeConnection[] {
  const candidateConnections = useMemo(
    () =>
      getRenderableWireCandidates({
        connections,
        draggingNode,
        draggingWire,
        highlightedNodes,
        highlightedPort,
        nearViewportNodeIdSet,
        runningNodeIdSet,
        visibleNodeIdSet,
      }),
    [
      connections,
      draggingNode,
      draggingWire,
      highlightedNodes,
      highlightedPort,
      nearViewportNodeIdSet,
      runningNodeIdSet,
      visibleNodeIdSet,
    ],
  );
  const [renderableWires, setRenderableWires] = useState<NodeConnection[]>(candidateConnections);

  const recalculateRenderableWires = useStableCallback(() => {
    markCanvasPerfStart('WireLayer:recalculateRenderableWires');

    const nextRenderableWires = candidateConnections.filter((connection) => {
      const inputNode = nodesById[connection.inputNodeId];
      const outputNode = nodesById[connection.outputNodeId];

      if (!inputNode || !outputNode) {
        return false;
      }

      const [outputCacheKey, inputCacheKey] = getConnectionCacheKeys(connection);
      const start = getNodePortPosition(outputNode, connection.outputId, outputCacheKey, portPositions);
      const end = getNodePortPosition(inputNode, connection.inputId, inputCacheKey, portPositions);

      return lineCrossesViewport(canvasToClientPosition(start.x, start.y), canvasToClientPosition(end.x, end.y));
    });

    setCanvasPerf('WireLayer:renderableWireCount', nextRenderableWires.length);
    markCanvasPerfEnd('WireLayer:recalculateRenderableWires');

    setRenderableWires((previousRenderableWires) =>
      areConnectionListsEqual(previousRenderableWires, nextRenderableWires) ? previousRenderableWires : nextRenderableWires,
    );
  });

  useEffect(() => {
    const shouldFreezeStaticWires = isViewportMoving && !isViewportVisibilitySettled && !draggingWire && !draggingNode;

    if (shouldFreezeStaticWires) {
      return;
    }

    recalculateRenderableWires();
  }, [
    canvasToClientPosition,
    candidateConnections,
    draggingNode,
    draggingWire,
    isViewportMoving,
    isViewportVisibilitySettled,
    nodesById,
    portPositions,
    recalculateRenderableWires,
  ]);

  return renderableWires;
}

function areConnectionListsEqual(previous: NodeConnection[], next: NodeConnection[]): boolean {
  return previous.length === next.length && previous.every((connection, index) => connection === next[index]);
}
