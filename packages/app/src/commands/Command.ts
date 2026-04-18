import {
  type Project,
  type ChartNode,
  type NodeConnection,
  type GraphId,
  type NodeId,
  type ProjectId,
} from '@ironclad/rivet-core';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { connectionsState, graphMetadataState, nodesState } from '../state/graph';
import { useStableCallback } from '../hooks/useStableCallback';
import { projectState, referencedProjectsState } from '../state/savedGraphs';
import { editingNodeState } from '../state/graphBuilder';
import {
  clearRecoverableNodeConnectionsForGraph,
  recoverableNodeConnectionsStatePerGraph,
} from '../state/recoverableNodeConnections';

export interface Command<T, U> {
  type: string;

  apply(data: T, appliedData: U | undefined, currentState: GraphCommandState): U;

  undo(data: T, appliedData: U, currentState: GraphCommandState): void;
}

export type CommandData<T, U> = {
  command: Command<T, U>;
  data: T;
  appliedData: U;
  timestamp: number;
};

/** The current state of the graph. Any "current" state a command needs should be added here. */
export type GraphCommandState = {
  nodes: ChartNode[];
  connections: NodeConnection[];
  recoverableNodeConnections: Record<NodeId, NodeConnection[]>;
  project: Project;
  commandHistoryStack: CommandData<any, any>[];
  graphId: GraphId | undefined;
  editingNodeId: NodeId | null;
  referencedProjects: Record<ProjectId, Project>;
};

export const commandHistoryStackStatePerGraph = atom<Record<GraphId, CommandData<any, any>[]>>({});
export const redoStackStatePerGraph = atom<Record<GraphId, CommandData<any, any>[]>>({});

export function clearHistoryEntriesForGraph<T>(entries: Record<GraphId, T[]>, graphId: GraphId | undefined): Record<GraphId, T[]> {
  if (!graphId) {
    return entries;
  }

  if (!(graphId in entries)) {
    return entries;
  }

  const nextEntries = { ...entries };
  delete nextEntries[graphId];
  return nextEntries;
}

function useGraphCommandState(): GraphCommandState {
  const graphId = useAtomValue(graphMetadataState)?.id;
  const nodes = useAtomValue(nodesState);
  const connections = useAtomValue(connectionsState);
  const project = useAtomValue(projectState);
  const commandHistoryStacks = useAtomValue(commandHistoryStackStatePerGraph);
  const commandHistoryStack = graphId ? commandHistoryStacks[graphId] ?? [] : [];
  const recoverableNodeConnectionsPerGraph = useAtomValue(recoverableNodeConnectionsStatePerGraph);
  const recoverableNodeConnections = graphId ? recoverableNodeConnectionsPerGraph[graphId] ?? {} : {};
  const editingNodeId = useAtomValue(editingNodeState);
  const referencedProjects = useAtomValue(referencedProjectsState);

  return {
    nodes,
    connections,
    recoverableNodeConnections,
    project,
    commandHistoryStack,
    graphId,
    editingNodeId,
    referencedProjects,
  };
}

export function useCommand<T, U>(command: Command<T, U>) {
  const graphId = useAtomValue(graphMetadataState)?.id;
  const setCommandHistoryStacks = useSetAtom(commandHistoryStackStatePerGraph);
  const setRedoStacks = useSetAtom(redoStackStatePerGraph);

  const currentState = useGraphCommandState();

  return useStableCallback((data: T) => {
    const appliedData = command.apply(data, undefined, currentState);

    setCommandHistoryStacks((stacks) => {
      if (!graphId) {
        return stacks;
      }

      const stack = stacks[graphId] ?? [];

      return {
        ...stacks,
        [graphId]: [
          ...stack,
          {
            command,
            data,
            appliedData,
            timestamp: Date.now(),
          },
        ],
      };
    });

    setRedoStacks((redoStacks) => {
      if (!graphId) {
        return redoStacks;
      }

      return {
        ...redoStacks,
        [graphId]: [],
      };
    });

    return appliedData;
  });
}

export function useClearGraphHistory() {
  const setCommandHistoryStacks = useSetAtom(commandHistoryStackStatePerGraph);
  const setRedoStacks = useSetAtom(redoStackStatePerGraph);
  const setRecoverableNodeConnections = useSetAtom(recoverableNodeConnectionsStatePerGraph);

  return useStableCallback((graphId: GraphId | undefined) => {
    if (!graphId) {
      return;
    }

    setCommandHistoryStacks((stacks) => clearHistoryEntriesForGraph(stacks, graphId));
    setRedoStacks((redoStacks) => clearHistoryEntriesForGraph(redoStacks, graphId));
    setRecoverableNodeConnections((entries) => clearRecoverableNodeConnectionsForGraph(entries, graphId));
  });
}

export function useClearCurrentGraphHistory() {
  const graphId = useAtomValue(graphMetadataState)?.id;
  const clearGraphHistory = useClearGraphHistory();

  return useStableCallback(() => {
    clearGraphHistory(graphId);
  });
}

export function useUndo() {
  const graphId = useAtomValue(graphMetadataState)?.id;
  const setCommandHistoryStacks = useSetAtom(commandHistoryStackStatePerGraph);
  const setRedoStacks = useSetAtom(redoStackStatePerGraph);

  const currentState = useGraphCommandState();

  return () => {
    setCommandHistoryStacks((stacks) => {
      if (!graphId) {
        return stacks;
      }

      const stack = stacks[graphId] ?? [];

      const lastCommand = stack.at(-1);

      if (!lastCommand) {
        return stacks;
      }

      lastCommand.command.undo(lastCommand.data, lastCommand.appliedData, currentState);

      setRedoStacks((redoStacks) => {
        const redoStack = redoStacks[graphId] ?? [];

        return {
          ...redoStacks,
          [graphId]: [...redoStack, lastCommand],
        };
      });

      return {
        ...stacks,
        [graphId]: stack.slice(0, -1),
      };
    });
  };
}

export function useRedo() {
  const graphId = useAtomValue(graphMetadataState)?.id;
  const setCommandHistoryStacks = useSetAtom(commandHistoryStackStatePerGraph);
  const setRedoStacks = useSetAtom(redoStackStatePerGraph);

  const currentState = useGraphCommandState();

  return () => {
    setRedoStacks((stacks) => {
      if (!graphId) {
        return stacks;
      }

      const stack = stacks[graphId] ?? [];

      const lastCommand = stack.at(-1);
      if (!lastCommand) {
        return stacks;
      }

      lastCommand.command.apply(lastCommand.data, lastCommand.appliedData, currentState);

      setCommandHistoryStacks((commandHistoryStacks) => {
        const commandHistoryStack = commandHistoryStacks[graphId] ?? [];

        return {
          ...commandHistoryStacks,
          [graphId]: [...commandHistoryStack, lastCommand],
        };
      });

      return {
        ...stacks,
        [graphId]: stack.slice(0, -1),
      };
    });
  };
}
