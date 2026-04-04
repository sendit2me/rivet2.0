import { type NodeConnection, type NodeId, type PortId } from '@ironclad/rivet-core';
import { useCommand } from './Command';
import { useSetAtom } from 'jotai';
import { connectionsState } from '../state/graph';
import {
  createRewireConnectionChange,
  undoRewireConnectionChange,
} from '../domain/graphEditing/connectionActions.js';

export function useRewireConnectionCommand() {
  const setConnections = useSetAtom(connectionsState);

  return useCommand<
    {
      originalConnection: NodeConnection;
      outputNodeId: NodeId;
      outputId: PortId;
      inputNodeId: NodeId;
      inputId: PortId;
    },
    {
      originalConnection: NodeConnection;
      newConnection: NodeConnection;
      replacedTargetConnection: NodeConnection | undefined;
    }
  >({
    type: 'rewireConnection',
    apply(params, _appliedData, currentState) {
      const change = createRewireConnectionChange(currentState.connections, params.originalConnection, {
        outputNodeId: params.outputNodeId,
        outputId: params.outputId,
        inputNodeId: params.inputNodeId,
        inputId: params.inputId,
      });

      setConnections(change.connections);

      return {
        originalConnection: change.originalConnection,
        newConnection: change.newConnection,
        replacedTargetConnection: change.replacedTargetConnection,
      };
    },
    undo(_data, appliedData, currentState) {
      setConnections(
        undoRewireConnectionChange({
          connections: currentState.connections,
          newConnection: appliedData.newConnection,
          originalConnection: appliedData.originalConnection,
          replacedTargetConnection: appliedData.replacedTargetConnection,
        }),
      );
    },
  });
}
