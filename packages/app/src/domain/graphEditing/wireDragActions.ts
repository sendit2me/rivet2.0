import { type NodeConnection, type NodeId, type PortId } from '@ironclad/rivet-core';
import { removeMatchingConnection } from './connectionActions.js';

export type DraggingWireActionState = {
  startNodeId: NodeId;
  startPortId: PortId;
  originalConnection?: NodeConnection;
  rewireSourceInput?: {
    nodeId: NodeId;
    portId: PortId;
  };
};

export type ResolvedWireDragAction =
  | {
      type: 'makeConnection';
      params: {
        outputNodeId: NodeId;
        outputId: PortId;
        inputNodeId: NodeId;
        inputId: PortId;
      };
    }
  | {
      type: 'rewireConnection';
      originalConnection: NodeConnection;
      params: {
        outputNodeId: NodeId;
        outputId: PortId;
        inputNodeId: NodeId;
        inputId: PortId;
      };
    }
  | {
      type: 'breakConnection';
      connection: NodeConnection;
    }
  | {
      type: 'none';
      reason: 'emptyCanvas' | 'sameEndpoint';
    };

export function resolveWireDragAction(options: {
  draggingWire: DraggingWireActionState;
  dropTarget?: {
    nodeId: NodeId;
    portId: PortId;
  };
}): ResolvedWireDragAction {
  const { draggingWire, dropTarget } = options;

  if (!dropTarget) {
    return draggingWire.originalConnection
      ? { type: 'breakConnection', connection: draggingWire.originalConnection }
      : { type: 'none', reason: 'emptyCanvas' };
  }

  if (
    draggingWire.originalConnection &&
    draggingWire.rewireSourceInput &&
    draggingWire.rewireSourceInput.nodeId === dropTarget.nodeId &&
    draggingWire.rewireSourceInput.portId === dropTarget.portId &&
    draggingWire.originalConnection.outputNodeId === draggingWire.startNodeId &&
    draggingWire.originalConnection.outputId === draggingWire.startPortId
  ) {
    return { type: 'none', reason: 'sameEndpoint' };
  }

  const params = {
    outputNodeId: draggingWire.startNodeId,
    outputId: draggingWire.startPortId,
    inputNodeId: dropTarget.nodeId,
    inputId: dropTarget.portId,
  };

  return draggingWire.originalConnection
    ? {
        type: 'rewireConnection',
        originalConnection: draggingWire.originalConnection,
        params,
      }
    : {
        type: 'makeConnection',
        params,
      };
}

export function shouldContinueDraggingAfterWireAction(
  action: ResolvedWireDragAction,
  keepDragging: boolean,
): boolean {
  if (!keepDragging) {
    return false;
  }

  return !(action.type === 'none' && action.reason === 'sameEndpoint');
}

export function getCanvasPreviewConnections(
  connections: NodeConnection[],
  draggingWire:
    | {
        originalConnection?: NodeConnection;
      }
    | undefined,
): NodeConnection[] {
  if (!draggingWire?.originalConnection) {
    return connections;
  }

  return removeMatchingConnection(connections, draggingWire.originalConnection);
}
