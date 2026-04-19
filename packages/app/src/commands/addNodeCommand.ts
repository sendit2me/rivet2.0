import { useAtomValue, useSetAtom } from 'jotai';
import { useCommand } from './Command';
import { nodesState } from '../state/graph';
import { type NodeId } from '@ironclad/rivet-core';
import { createAddedNode } from '../domain/graphEditing/nodeActions.js';
import { useProjectNodeRegistry } from '../hooks/useProjectNodeRegistry';
import { settingsState } from '../state/settings.js';

export function useAddNodeCommand() {
  const setNodes = useSetAtom(nodesState);
  const projectNodeRegistry = useProjectNodeRegistry();
  const settings = useAtomValue(settingsState);

  return useCommand<{ nodeType: string; position: { x: number; y: number } }, { id: NodeId }>({
    type: 'addNode',
    apply(params, appliedData, currentState) {
      const newNode = createAddedNode({
        nodeType: params.nodeType,
        position: params.position,
        registry: projectNodeRegistry,
        referencedProjects: currentState.referencedProjects,
        appliedId: appliedData?.id,
        applyDefaultColor: settings.defaultNodeColors,
      });

      setNodes([...currentState.nodes, newNode]);

      return { id: newNode.id };
    },
    undo(_data, { id }) {
      setNodes((allNodes) => allNodes.filter((node) => node.id !== id));
    },
  });
}
