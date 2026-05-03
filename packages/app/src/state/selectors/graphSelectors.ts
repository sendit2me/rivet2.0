import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { type ChartNode, type NodeConnection, type NodeId } from '@valerypopoff/rivet2-core';
import { connectionsState, nodesState } from '../atoms/graph';

export const nodesByIdState = atom((get) =>
  get(nodesState).reduce(
    (accumulator, node) => {
      accumulator[node.id] = node;
      return accumulator;
    },
    {} as Record<NodeId, ChartNode>,
  ),
);

export const nodesForConnectionState = atom((get) => {
  const nodesById = get(nodesByIdState);
  return get(connectionsState).map((connection) => ({
    inputNode: nodesById[connection.inputNodeId],
    outputNode: nodesById[connection.outputNodeId],
  }));
});

export const connectionsForNodeState = atom((get) =>
  get(connectionsState).reduce(
    (accumulator, connection) => {
      accumulator[connection.inputNodeId] ??= [];
      accumulator[connection.inputNodeId]!.push(connection);
      accumulator[connection.outputNodeId] ??= [];
      accumulator[connection.outputNodeId]!.push(connection);
      return accumulator;
    },
    {} as Record<NodeId, NodeConnection[]>,
  ),
);

export const connectionsForSingleNodeState = atomFamily((nodeId: NodeId) =>
  atom((get) => get(connectionsForNodeState)[nodeId]),
);
