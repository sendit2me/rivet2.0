import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import {
  type PortId,
  type GraphId,
  type Inputs,
  type NodeId,
  type Outputs,
  type ProcessId,
  type DataType,
  type DataValue,
  type ScalarDataType,
  type GraphExecutionMetadata,
  type GraphRunId,
  type RootRunId,
} from '@ironclad/rivet-core';
import { graphNavigationStackState } from './graphBuilder.js';
import type { GraphViewKey } from '../domain/graphEditing/navigationActions.js';

export type GraphRunSelection = GraphRunId | 'latest';

export type GraphRunRecord = {
  graphRunId: GraphRunId;
  rootRunId: RootRunId;
  graphId: GraphId;
  parentGraphRunId?: GraphRunId;
  executor?: GraphExecutionMetadata['executor'];
  startedAt?: number;
  finishedAt?: number;
  status?: 'running' | 'ok' | 'error' | 'aborted';
};

export type ProcessDataForNode = {
  processId: ProcessId;
  rootRunId?: RootRunId;
  graphRunId?: GraphRunId;
  graphId?: GraphId;
  graphViewKey?: GraphViewKey;
  data: NodeRunDataWithRefs;
};

export type RunDataByNodeId = Record<NodeId, ProcessDataForNode[]>;

export type NodeRunDataBase = {
  startedAt?: number;
  finishedAt?: number;

  status?:
    | { type: 'ok' }
    | { type: 'error'; error: string }
    | { type: 'running' }
    | { type: 'interrupted' }
    | { type: 'notRan'; reason: string };
};

export type NodeRunData = NodeRunDataBase & {
  inputData?: Inputs;

  outputData?: Outputs;

  splitOutputData?: {
    [index: number]: Outputs;
  };
};

export type NodeRunDataWithRefs = NodeRunDataBase & {
  inputData?: InputsOrOutputsWithRefs;

  outputData?: InputsOrOutputsWithRefs;

  splitOutputData?: {
    [index: number]: InputsOrOutputsWithRefs;
  };
};

export type InputsOrOutputsWithRefs = Record<PortId, DataValueWithRefs>;

export type DataValueWithRefs = {
  [P in DataType]: {
    type: P;
    value: P extends 'binary' | 'audio' | 'image' | 'document' | 'chat-message'
      ? { ref: string }
      : Extract<DataValue, { type: P }>['value'];
  };
}[DataType];

export type PageValue = number | 'latest';

export type PageUpdater = (prev: PageValue) => PageValue;

export type ScalarDataValueWithRefs = Extract<DataValueWithRefs, { type: ScalarDataType }>;

export const currentGraphViewState = atom((get) => {
  const navigation = get(graphNavigationStackState);
  if (navigation.index == null) {
    return undefined;
  }

  return navigation.stack[navigation.index];
});

export const lastRunDataByNodeState = atom<RunDataByNodeId>({});

export const lastRunDataState = atomFamily((nodeId: NodeId) => atom((get) => get(lastRunDataByNodeState)[nodeId]));

export const graphRunHistoryByViewState = atom<Record<GraphViewKey, GraphRunRecord[]>>({});

export const selectedGraphRunByViewState = atom<Record<GraphViewKey, GraphRunSelection>>({});

export const runningGraphsState = atom<GraphId[]>([]);

export const rootGraphState = atom<GraphId | undefined>(undefined);

export const graphRunningState = atom(false);

export const graphStartTimeState = atom<number | undefined>(undefined);

export const graphPausedState = atom(false);

export const selectedProcessPageNodesState = atom<Record<NodeId, PageValue>>({});

export const selectedProcessPageState = atomFamily((nodeId: NodeId) =>
  atom(
    (get) => get(selectedProcessPageNodesState)[nodeId] ?? 0,
    (get, set, newValue: PageValue | PageUpdater) => {
      set(selectedProcessPageNodesState, (oldValue) => {
        const currentValue = oldValue[nodeId] ?? 0;
        const nextValue = typeof newValue === 'function' ? (newValue as PageUpdater)(currentValue) : newValue;

        return {
          ...oldValue,
          [nodeId]: nextValue,
        };
      });
    },
  ),
);

export function removeExecutionNodeStateFamilies(nodeId: NodeId): void {
  lastRunDataState.remove(nodeId);
  selectedProcessPageState.remove(nodeId);
}
