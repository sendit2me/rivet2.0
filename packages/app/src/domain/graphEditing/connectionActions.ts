import { type NodeConnection, type NodeId, type PortId } from '@ironclad/rivet-core';

export type ConnectionActionParams = {
  outputNodeId: NodeId;
  outputId: PortId;
  inputNodeId: NodeId;
  inputId: PortId;
};

export function createConnectionChange(
  connections: NodeConnection[],
  params: ConnectionActionParams,
): {
  connections: NodeConnection[];
  newConnection: NodeConnection;
  previousConnectionToInput: NodeConnection | undefined;
} {
  let nextConnections = [...connections];

  const previousConnectionToInput = connections.find(
    (connection) => connection.inputNodeId === params.inputNodeId && connection.inputId === params.inputId,
  );

  if (previousConnectionToInput) {
    nextConnections = nextConnections.filter((connection) => connection !== previousConnectionToInput);
  }

  const newConnection: NodeConnection = {
    inputNodeId: params.inputNodeId,
    inputId: params.inputId,
    outputNodeId: params.outputNodeId,
    outputId: params.outputId,
  };

  return {
    connections: [...nextConnections, newConnection],
    newConnection,
    previousConnectionToInput,
  };
}

export function removeConnection(connections: NodeConnection[], connectionToBreak: NodeConnection): NodeConnection[] {
  return connections.filter((connection) => connection !== connectionToBreak);
}

export function undoConnectionChange(options: {
  connections: NodeConnection[];
  newConnection: NodeConnection;
  previousConnectionToInput?: NodeConnection;
}): NodeConnection[] {
  const withoutNewConnection = options.connections.filter(
    (connection) =>
      !(
        connection.inputId === options.newConnection.inputId &&
        connection.inputNodeId === options.newConnection.inputNodeId &&
        connection.outputId === options.newConnection.outputId &&
        connection.outputNodeId === options.newConnection.outputNodeId
      ),
  );

  return options.previousConnectionToInput
    ? [...withoutNewConnection, options.previousConnectionToInput]
    : withoutNewConnection;
}
