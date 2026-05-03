import { type ChartNode, type NodeConnection, type NodeId } from '@rivet2/rivet-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { connectionsState, nodesState } from '../state/graph';
import { selectedNodesState } from '../state/graphBuilder';
import { useCommand } from './Command';
import { createPastedNodes } from '../domain/graphEditing/nodeActions.js';
import { removeMatchingConnection } from '../domain/graphEditing/connectionActions.js';

export function usePasteNodesCommand() {
  const selectedNodeIds = useAtomValue(selectedNodesState);
  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);
  const setSelectedNodeIds = useSetAtom(selectedNodesState);

  return useCommand<
    {
      nodes: ChartNode[];
      connections: NodeConnection[];
      position: { x: number; y: number };
    },
    {
      newNodes: ChartNode[];
      newConnections: NodeConnection[];
      previousSelectedNodeIds: NodeId[];
    }
  >({
    type: 'pasteNodes',
    apply(data, appliedData, currentState) {
      if (appliedData) {
        setNodes((prev) => [...prev, ...appliedData.newNodes]);
        setConnections((prev) => [...prev, ...appliedData.newConnections]);
        setSelectedNodeIds(appliedData.newNodes.map((node) => node.id));

        return appliedData;
      }

      const { newNodes, newConnections } = createPastedNodes({
        nodes: data.nodes,
        connections: data.connections,
        position: data.position,
      });

      setNodes((prev) => [...prev, ...newNodes]);
      setConnections((prev) => [...prev, ...newConnections]);
      setSelectedNodeIds(newNodes.map((node) => node.id));

      return {
        newNodes,
        newConnections,
        previousSelectedNodeIds: selectedNodeIds,
      };
    },
    undo(_data, appliedData, currentState) {
      const newNodeIds = new Set(appliedData.newNodes.map((node) => node.id));

      setNodes(currentState.nodes.filter((node) => !newNodeIds.has(node.id)));

      const nextConnections = appliedData.newConnections.reduce(
        (connections, connection) => removeMatchingConnection(connections, connection),
        currentState.connections,
      );

      setConnections(nextConnections);
      setSelectedNodeIds(appliedData.previousSelectedNodeIds);
    },
  });
}
