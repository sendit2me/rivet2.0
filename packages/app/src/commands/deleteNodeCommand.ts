import { useAtomValue, useSetAtom } from 'jotai';
import { connectionsState, nodesState, removeGraphNodeStateFamilies } from '../state/graph';
import { useCommand } from './Command';
import { editingNodeState, selectedNodesState, removeGraphBuilderNodeStateFamilies } from '../state/graphBuilder';
import { type NodeConnection, type ChartNode, type NodeId } from '@ironclad/rivet-core';
import { removeExecutionNodeStateFamilies } from '../state/dataFlow';
import { deleteNodesFromGraph } from '../domain/graphEditing/nodeActions.js';
import { recoverableNodeConnectionsStatePerGraph, removeRecoverableNodeConnectionsForGraphNodes } from '../state/recoverableNodeConnections';

export const useDeleteNodesCommand = () => {
  const selectedNodeIds = useAtomValue(selectedNodesState);

  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);
  const setSelectedNodeIds = useSetAtom(selectedNodesState);
  const setEditingNodeId = useSetAtom(editingNodeState);
  const setRecoverableNodeConnections = useSetAtom(recoverableNodeConnectionsStatePerGraph);

  return useCommand<{ nodeIds: NodeId[] }, { removedNodes: ChartNode[]; removedConnections: NodeConnection[] }>({
    type: 'deleteNode',
    apply(args, _appliedData, currentState) {
      const nodeIds =
        selectedNodeIds.length > 0 ? [...new Set([...selectedNodeIds, ...args.nodeIds])] : [...args.nodeIds];
      const { newNodes, newConnections, removedNodes, removedConnections } = deleteNodesFromGraph({
        nodeIds,
        nodes: currentState.nodes,
        connections: currentState.connections,
      });

      if (currentState.editingNodeId && nodeIds.includes(currentState.editingNodeId)) {
        setEditingNodeId(null);
      }

      setNodes?.(newNodes);
      setConnections?.(newConnections);
      setRecoverableNodeConnections((entries) =>
        removeRecoverableNodeConnectionsForGraphNodes(entries, currentState.graphId, nodeIds),
      );
      setSelectedNodeIds((current) => current.filter((id) => !nodeIds.includes(id)));
      for (const nodeId of nodeIds) {
        removeGraphNodeStateFamilies(nodeId);
        removeExecutionNodeStateFamilies(nodeId);
        removeGraphBuilderNodeStateFamilies(nodeId);
      }

      return {
        removedNodes,
        removedConnections,
      };
    },
    undo(_data, { removedNodes, removedConnections }, currentState) {
      const newNodes = [...currentState.nodes, ...removedNodes];
      const newConnections = [...currentState.connections, ...removedConnections];

      setNodes(newNodes);
      setConnections(newConnections);
    },
  });
};
