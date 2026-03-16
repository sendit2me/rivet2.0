import { useSetAtom } from 'jotai';
import { useCommand } from './Command';
import { nodesState } from '../state/graph';
import { type NodeId } from '@ironclad/rivet-core';
import { createAddedNode } from '../domain/graphEditing/nodeActions.js';

export function useAddNodeCommand() {
  const setNodes = useSetAtom(nodesState);

  return useCommand<{ nodeType: string; position: { x: number; y: number } }, { id: NodeId }>({
    type: 'addNode',
    apply(params, appliedData, currentState) {
      const newNode = createAddedNode({
        nodeType: params.nodeType,
        position: params.position,
        referencedProjects: currentState.referencedProjects,
        appliedId: appliedData?.id,
      });

      setNodes([...currentState.nodes, newNode]);

      return { id: newNode.id };
    },
    undo(_data, { id }) {
      setNodes((allNodes) => allNodes.filter((node) => node.id !== id));
    },
  });
}
