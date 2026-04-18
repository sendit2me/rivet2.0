import { useSetAtom } from 'jotai';
import { type GraphCommandState, commandHistoryStackStatePerGraph, type CommandData, useCommand } from './Command';
import { type NodeConnection, type ChartNode, type NodeId } from '@ironclad/rivet-core';
import { nodesState, connectionsState } from '../state/graph';
import { produce } from 'immer';

const MERGE_WINDOW_MS = 5000;

type EditNodeWithConnectionsParams = {
  nodeId: NodeId;
  newNode: ChartNode;
  nextConnections: NodeConnection[];
  previousNodeOverride?: ChartNode;
};

type EditNodeWithConnectionsAppliedData = {
  previousNode: ChartNode;
  previousConnections: NodeConnection[];
};

export function shouldMergeEditNodeWithConnectionsCommand(
  lastCommand: CommandData<any, any> | undefined,
  nodeId: NodeId,
  now = Date.now(),
): boolean {
  return !!(
    lastCommand &&
    now - lastCommand.timestamp <= MERGE_WINDOW_MS &&
    lastCommand.command.type === 'editNodeWithConnections' &&
    lastCommand.data.nodeId === nodeId
  );
}

function replaceNodeInGraph(
  nodes: ChartNode[],
  nodeId: NodeId,
  nextNode: ChartNode,
): ChartNode[] {
  return produce(nodes, (draft) => {
    const index = draft.findIndex((node) => node.id === nodeId);

    if (index < 0) {
      throw new Error(`Node with id ${nodeId} not found`);
    }

    draft[index] = structuredClone(nextNode);
  });
}

function removeLastCommandHistoryEntryForGraph(
  stacks: Record<string, CommandData<any, any>[]>,
  graphId: string | undefined,
): Record<string, CommandData<any, any>[]> {
  if (!graphId) {
    return stacks;
  }

  const stack = stacks[graphId] ?? [];

  return {
    ...stacks,
    [graphId]: stack.slice(0, -1),
  };
}

export function useEditNodeWithConnectionsCommand() {
  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);
  const setCommandHistories = useSetAtom(commandHistoryStackStatePerGraph);

  const applyNodeAndConnections = (
    nodeId: NodeId,
    newNode: ChartNode,
    nextConnections: readonly NodeConnection[],
    currentState: GraphCommandState,
  ) => {
    setNodes(replaceNodeInGraph(currentState.nodes, nodeId, newNode));
    setConnections(structuredClone([...nextConnections]));
  };

  return useCommand<EditNodeWithConnectionsParams, EditNodeWithConnectionsAppliedData>({
    type: 'editNodeWithConnections',
    apply(params, appliedData, currentState) {
      const nodeToEdit = currentState.nodes.find((node) => node.id === params.nodeId);

      if (!nodeToEdit) {
        throw new Error(`Node with id ${params.nodeId} not found`);
      }

      const lastCommand = currentState.commandHistoryStack.at(-1);
      const shouldMerge = !appliedData && shouldMergeEditNodeWithConnectionsCommand(lastCommand, params.nodeId);

      if (shouldMerge) {
        setCommandHistories((stacks) => removeLastCommandHistoryEntryForGraph(stacks, currentState.graphId));

        applyNodeAndConnections(params.nodeId, params.newNode, params.nextConnections, currentState);

        const commandToMergeWith = lastCommand!;

        return {
          previousNode: structuredClone(commandToMergeWith.appliedData.previousNode),
          previousConnections: structuredClone(commandToMergeWith.appliedData.previousConnections),
        };
      }

      applyNodeAndConnections(params.nodeId, params.newNode, params.nextConnections, currentState);

      return {
        previousNode: structuredClone(params.previousNodeOverride ?? nodeToEdit),
        previousConnections: structuredClone(currentState.connections),
      };
    },
    undo({ nodeId }, appliedData, currentState) {
      setNodes(replaceNodeInGraph(currentState.nodes, nodeId, appliedData.previousNode));
      setConnections(structuredClone(appliedData.previousConnections));
    },
  });
}
