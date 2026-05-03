import type { NodeConnection, NodeId } from '@rivet2/rivet-core';
import { markCanvasPerfEnd, markCanvasPerfStart, setCanvasPerf } from './canvasPerfDebug.js';

export function groupConnectionsByNode(connections: NodeConnection[]): Record<NodeId, NodeConnection[]> {
  markCanvasPerfStart('groupConnectionsByNode');

  const connectionsByNodeId = {} as Record<NodeId, NodeConnection[]>;

  for (const connection of connections) {
    (connectionsByNodeId[connection.inputNodeId] ??= []).push(connection);

    if (connection.outputNodeId !== connection.inputNodeId) {
      (connectionsByNodeId[connection.outputNodeId] ??= []).push(connection);
    }
  }

  setCanvasPerf('groupConnectionsByNode:size', connections.length);
  markCanvasPerfEnd('groupConnectionsByNode');

  return connectionsByNodeId;
}
