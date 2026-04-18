import { useSetAtom } from 'jotai';
import {
  type GraphCommandState,
  commandHistoryStackStatePerGraph,
  type CommandData,
  useCommand,
} from './Command';
import {
  type NodeId,
  type NodeConnection,
  type ChartNode,
  type NodeRegistration,
} from '@ironclad/rivet-core';
import { nodesState, connectionsState } from '../state/graph';
import { produce } from 'immer';
import { useProjectNodeRegistry } from '../hooks/useProjectNodeRegistry';
import {
  getRecoverableNodeConnectionsForNode,
  recoverableNodeConnectionsStatePerGraph,
  setRecoverableNodeConnectionsForGraphNode,
} from '../state/recoverableNodeConnections';
import { reconcileNodeEditConnections } from '../domain/graphEditing/editNodeConnectionRecovery';

const MERGE_WINDOW_MS = 5000;

type EditNodeParams = {
  nodeId: NodeId;
  newNode: Partial<ChartNode>;
  previousNodeOverride?: Partial<ChartNode>;
};

type EditNodeAppliedData = {
  previousNode: Partial<ChartNode>;
  previousConnections: NodeConnection[];
  nextConnections: NodeConnection[];
  previousRecoverableConnections: NodeConnection[];
  nextRecoverableConnections: NodeConnection[];
};

function cloneConnections(connections: readonly NodeConnection[]): NodeConnection[] {
  return structuredClone([...connections]);
}

export function shouldMergeEditNodeCommand(
  lastCommand: CommandData<any, any> | undefined,
  nodeId: NodeId,
  now = Date.now(),
): boolean {
  return !!(
    lastCommand &&
    now - lastCommand.timestamp <= MERGE_WINDOW_MS &&
    lastCommand.command.type === 'editNode' &&
    lastCommand.data.nodeId === nodeId
  );
}

function replaceNodeInGraph(
  nodes: readonly ChartNode[],
  nodeId: NodeId,
  newNode: Partial<ChartNode>,
): ChartNode[] {
  return produce([...nodes], (draft) => {
    const index = draft.findIndex((node) => node.id === nodeId);

    if (index < 0) {
      throw new Error(`Node with id ${nodeId} not found`);
    }

    draft[index] = {
      ...draft[index],
      ...structuredClone(newNode),
    } as ChartNode;
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

export function buildEditNodeAppliedData({
  params,
  currentState,
  previousNode,
  previousConnections,
  previousRecoverableConnections,
  currentRecoverableConnections,
  projectNodeRegistry,
}: {
  params: EditNodeParams;
  currentState: GraphCommandState;
  previousNode: Partial<ChartNode>;
  previousConnections: readonly NodeConnection[];
  previousRecoverableConnections: readonly NodeConnection[];
  currentRecoverableConnections: readonly NodeConnection[];
  projectNodeRegistry: NodeRegistration<any, any>;
}): EditNodeAppliedData {
  const { nextConnections, nextRecoverableConnections } = reconcileNodeEditConnections({
    nodeId: params.nodeId,
    newNode: params.newNode,
    nodes: currentState.nodes,
    liveConnections: currentState.connections,
    recoverableConnections: currentRecoverableConnections,
    project: currentState.project,
    referencedProjects: currentState.referencedProjects,
    projectNodeRegistry,
  });

  return {
    previousNode: structuredClone(previousNode),
    previousConnections: cloneConnections(previousConnections),
    nextConnections: cloneConnections(nextConnections),
    previousRecoverableConnections: cloneConnections(previousRecoverableConnections),
    nextRecoverableConnections: cloneConnections(nextRecoverableConnections),
  };
}

export function useEditNodeCommand() {
  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);
  const setCommandHistories = useSetAtom(commandHistoryStackStatePerGraph);
  const setRecoverableNodeConnections = useSetAtom(recoverableNodeConnectionsStatePerGraph);
  const projectNodeRegistry = useProjectNodeRegistry();

  const applyNodeAndGraphState = (
    params: EditNodeParams,
    nextConnections: readonly NodeConnection[],
    nextRecoverableConnections: readonly NodeConnection[],
    currentState: GraphCommandState,
  ) => {
    setNodes(replaceNodeInGraph(currentState.nodes, params.nodeId, params.newNode));
    setConnections(cloneConnections(nextConnections));
    setRecoverableNodeConnections((entries) =>
      setRecoverableNodeConnectionsForGraphNode(
        entries,
        currentState.graphId,
        params.nodeId,
        nextRecoverableConnections,
      ),
    );
  };

  return useCommand<EditNodeParams, EditNodeAppliedData>({
    type: 'editNode',
    apply(params, appliedData, currentState) {
      const nodeToEdit = currentState.nodes.find((node) => node.id === params.nodeId);

      if (!nodeToEdit) {
        throw new Error(`Node with id ${params.nodeId} not found`);
      }

      if (appliedData) {
        applyNodeAndGraphState(params, appliedData.nextConnections, appliedData.nextRecoverableConnections, currentState);
        return appliedData;
      }

      const currentRecoverableConnections = getRecoverableNodeConnectionsForNode(
        currentState.recoverableNodeConnections,
        params.nodeId,
      );
      const lastCommand = currentState.commandHistoryStack.at(-1);
      const shouldMerge = shouldMergeEditNodeCommand(lastCommand, params.nodeId);

      if (shouldMerge) {
        setCommandHistories((stacks) => removeLastCommandHistoryEntryForGraph(stacks, currentState.graphId));

        const commandToMergeWith = lastCommand!;
        const nextAppliedData = buildEditNodeAppliedData({
          params,
          currentState,
          previousNode: commandToMergeWith.appliedData.previousNode,
          previousConnections: commandToMergeWith.appliedData.previousConnections,
          previousRecoverableConnections: commandToMergeWith.appliedData.previousRecoverableConnections,
          currentRecoverableConnections,
          projectNodeRegistry,
        });

        applyNodeAndGraphState(params, nextAppliedData.nextConnections, nextAppliedData.nextRecoverableConnections, currentState);

        return nextAppliedData;
      }

      const nextAppliedData = buildEditNodeAppliedData({
        params,
        currentState,
        previousNode: params.previousNodeOverride ?? nodeToEdit,
        previousConnections: currentState.connections,
        previousRecoverableConnections: currentRecoverableConnections,
        currentRecoverableConnections,
        projectNodeRegistry,
      });

      applyNodeAndGraphState(params, nextAppliedData.nextConnections, nextAppliedData.nextRecoverableConnections, currentState);

      return nextAppliedData;
    },
    undo({ nodeId }, appliedData, currentState) {
      setNodes(
        produce(currentState.nodes, (draft) => {
          const index = draft.findIndex((node) => node.id === nodeId);

          if (index < 0) {
            throw new Error(`Node with id ${nodeId} not found`);
          }

          draft[index] = {
            ...draft[index],
            ...structuredClone(appliedData.previousNode),
          } as ChartNode;
        }),
      );
      setConnections(cloneConnections(appliedData.previousConnections));
      setRecoverableNodeConnections((entries) =>
        setRecoverableNodeConnectionsForGraphNode(
          entries,
          currentState.graphId,
          nodeId,
          appliedData.previousRecoverableConnections,
        ),
      );
    },
  });
}
