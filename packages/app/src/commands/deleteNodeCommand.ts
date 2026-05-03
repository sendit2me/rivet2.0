import { useAtomValue, useSetAtom } from 'jotai';
import { connectionsState, graphMetadataState, nodesState, removeGraphNodeStateFamilies } from '../state/graph';
import { useCommand } from './Command';
import { editingNodeState, selectedNodesState, removeGraphBuilderNodeStateFamilies } from '../state/graphBuilder';
import { type NodeConnection, type ChartNode, type NodeId } from '@valerypopoff/rivet2-core';
import { removeExecutionNodeStateFamilies } from '../state/dataFlow';
import { deleteNodesFromGraph } from '../domain/graphEditing/nodeActions.js';
import { recoverableNodeConnectionsStatePerGraph, removeRecoverableNodeConnectionsForGraphNodes } from '../state/recoverableNodeConnections';
import { findConnectedGraphInputUsages } from '../domain/graphEditing/graphInputUsage';
import { projectState } from '../state/savedGraphs';
import { useStableCallback } from '../hooks/useStableCallback';
import { deleteGraphInputConfirmState } from '../state/ui';

type DeleteNodesCommandArgs = {
  nodeIds: NodeId[];
  skipGraphInputUsageConfirm?: boolean;
};

export const useDeleteNodesCommand = () => {
  const selectedNodeIds = useAtomValue(selectedNodesState);
  const nodes = useAtomValue(nodesState);
  const connections = useAtomValue(connectionsState);
  const graphId = useAtomValue(graphMetadataState)?.id;
  const project = useAtomValue(projectState);

  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);
  const setSelectedNodeIds = useSetAtom(selectedNodesState);
  const setEditingNodeId = useSetAtom(editingNodeState);
  const setRecoverableNodeConnections = useSetAtom(recoverableNodeConnectionsStatePerGraph);
  const setDeleteGraphInputConfirm = useSetAtom(deleteGraphInputConfirmState);

  const deleteNodesCommand = useCommand<
    DeleteNodesCommandArgs,
    { removedNodes: ChartNode[]; removedConnections: NodeConnection[] }
  >({
    type: 'deleteNode',
    apply(args, _appliedData, currentState) {
      const nodeIds = [...new Set(args.nodeIds)];
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

  return useStableCallback((args: DeleteNodesCommandArgs) => {
    const nodeIds = args.skipGraphInputUsageConfirm
      ? [...new Set(args.nodeIds)]
      : selectedNodeIds.length > 0
        ? [...new Set([...selectedNodeIds, ...args.nodeIds])]
        : [...args.nodeIds];

    if (args.skipGraphInputUsageConfirm) {
      deleteNodesCommand({ nodeIds });
      return;
    }

    const graphInputUsages = findConnectedGraphInputUsages({
      currentGraph: { nodes, connections },
      currentGraphId: graphId,
      nodeIdsToDelete: nodeIds,
      project,
    });

    if (graphInputUsages.length > 0) {
      setDeleteGraphInputConfirm({
        nodeIds,
        usages: graphInputUsages,
      });
      return;
    }

    deleteNodesCommand({ nodeIds });
  });
};
