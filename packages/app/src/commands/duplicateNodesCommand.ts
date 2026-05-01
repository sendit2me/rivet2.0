import { type ChartNode, type NodeConnection, type NodeId } from '@ironclad/rivet-core';
import { useSetAtom } from 'jotai';
import { connectionsState, nodesState } from '../state/graph';
import { selectedNodesState } from '../state/graphBuilder';
import { useCommand } from './Command';
import { duplicateNodesWithConnections } from '../domain/graphEditing/nodeActions.js';
import { removeMatchingConnection } from '../domain/graphEditing/connectionActions.js';

export function useDuplicateNodesCommand() {
  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);
  const setSelectedNodeIds = useSetAtom(selectedNodesState);

  return useCommand<
    {
      nodeIds: NodeId[];
      delta: { x: number; y: number };
    },
    {
      duplicatedNodes: ChartNode[];
      duplicatedConnections: NodeConnection[];
      duplicatedNodeIds: NodeId[];
    }
  >({
    type: 'duplicateNodes',
    apply({ nodeIds, delta }, appliedData, currentState) {
      if (appliedData) {
        setNodes((prev) => [...prev, ...appliedData.duplicatedNodes]);
        setConnections((prev) => [...prev, ...appliedData.duplicatedConnections]);
        setSelectedNodeIds(appliedData.duplicatedNodeIds);

        return appliedData;
      }

      const { newNodes, duplicatedConnections } = duplicateNodesWithConnections({
        nodes: currentState.nodes,
        nodeIds,
        connections: currentState.connections,
        delta,
      });

      setNodes((prev) => [...prev, ...newNodes]);
      setConnections((prev) => [...prev, ...duplicatedConnections]);
      setSelectedNodeIds(newNodes.map((node) => node.id));

      return {
        duplicatedNodes: newNodes,
        duplicatedConnections,
        duplicatedNodeIds: newNodes.map((node) => node.id),
      };
    },
    undo(_data, appliedData, currentState) {
      setNodes(currentState.nodes.filter((node) => !appliedData.duplicatedNodeIds.includes(node.id)));

      const nextConnections = appliedData.duplicatedConnections.reduce(
        (connections, connection) => removeMatchingConnection(connections, connection),
        currentState.connections,
      );

      setConnections(nextConnections);
      setSelectedNodeIds((current) => current.filter((nodeId) => !appliedData.duplicatedNodeIds.includes(nodeId)));
    },
  });
}
