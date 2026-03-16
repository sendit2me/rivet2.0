import { type NodeConnection, type NodeId, type PortId } from '@ironclad/rivet-core';
import { useCommand } from './Command';
import { useSetAtom } from 'jotai';
import { connectionsState } from '../state/graph';
import { createConnectionChange, undoConnectionChange } from '../domain/graphEditing/connectionActions.js';

export function useMakeConnectionCommand() {
  const setConnections = useSetAtom(connectionsState);

  return useCommand<
    {
      outputNodeId: NodeId;
      outputId: PortId;
      inputNodeId: NodeId;
      inputId: PortId;
    },
    {
      newConnection: NodeConnection;
      previousConnectionToInput: NodeConnection | undefined;
    }
  >({
    type: 'makeConnection',
    apply(params, _appliedData, currentState) {
      const change = createConnectionChange(currentState.connections, params);

      setConnections(change.connections);

      return {
        newConnection: change.newConnection,
        previousConnectionToInput: change.previousConnectionToInput,
      };
    },
    undo(_data, _appliedData, currentState) {
      setConnections(
        undoConnectionChange({
          connections: currentState.connections,
          newConnection: _appliedData.newConnection,
          previousConnectionToInput: _appliedData.previousConnectionToInput,
        }),
      );
    },
  });
}
