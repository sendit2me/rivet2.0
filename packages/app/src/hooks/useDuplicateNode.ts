import { type NodeId } from '@ironclad/rivet-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { connectionsState, nodesByIdState, nodesState } from '../state/graph';
import { duplicateNodeWithConnections } from '../domain/graphEditing/nodeActions.js';

export function useDuplicateNode() {
  const nodesById = useAtomValue(nodesByIdState);
  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);

  return (nodeId: NodeId) => {
    const node = nodesById[nodeId];

    if (!node) {
      return;
    }

    const { newNode } = duplicateNodeWithConnections({
      node,
      connections: [],
    });
    setNodes((prev) => [...prev, newNode]);

    setConnections((prev) => {
      const { duplicatedIncomingConnections } = duplicateNodeWithConnections({
        node,
        connections: prev,
      });
      return [...prev, ...duplicatedIncomingConnections];
    });
  };
}
