import { useLatest } from 'ahooks';
import { produce } from 'immer';
import { useAtomValue, useSetAtom } from 'jotai';
import { type GraphExecutionMetadata, type NodeId, type ProcessEvents, type ProcessId } from '@ironclad/rivet-core';
import { useDataRefs } from '../providers/ProvidersContext';
import { lastRecordingState } from '../state/execution';
import {
  currentGraphViewState,
  selectedGraphRunByViewState,
  type NodeRunData,
  lastRunDataByNodeState,
  selectedProcessPageNodesState
} from '../state/dataFlow';
import { previousDataPerNodeToKeepState } from '../state/settings';
import { trivetTestsRunningState } from '../state/trivet';
import { type ProcessQuestions, userInputModalQuestionsState } from '../state/userInput';
import { cloneNodeDataForHistory } from '../utils/executionDataTransforms';

export type ExecutionDataFlowApi = {
  onTrivetStart: () => void;
  onUserInput: (data: ProcessEvents['userInput']) => void;
  setDataForNode: (
    nodeId: NodeId,
    processId: ProcessId,
    execution: GraphExecutionMetadata | undefined,
    data: Partial<NodeRunData>,
  ) => void;
  setSelectedNodePageLatest: (nodeId: NodeId, execution: GraphExecutionMetadata | undefined) => void;
  trivetRunningLatest: ReturnType<typeof useLatest<boolean>>;
};

export function useExecutionDataFlow(): ExecutionDataFlowApi {
  const dataRefs = useDataRefs();
  const setLastRunData = useSetAtom(lastRunDataByNodeState);
  const setSelectedPage = useSetAtom(selectedProcessPageNodesState);
  const setUserInputQuestions = useSetAtom(userInputModalQuestionsState);
  const setLastRecordingState = useSetAtom(lastRecordingState);
  const trivetRunning = useAtomValue(trivetTestsRunningState);
  const trivetRunningLatest = useLatest(trivetRunning);
  const previousDataPerNodeToKeep = useAtomValue(previousDataPerNodeToKeepState);
  const currentGraphView = useAtomValue(currentGraphViewState);
  const selectedGraphRunByView = useAtomValue(selectedGraphRunByViewState);
  const currentGraphViewLatest = useLatest(currentGraphView);
  const selectedGraphRunByViewLatest = useLatest(selectedGraphRunByView);

  const setDataForNode = (
    nodeId: NodeId,
    processId: ProcessId,
    execution: GraphExecutionMetadata | undefined,
    data: Partial<NodeRunData>,
  ) => {
    setLastRunData((prev) =>
      produce(prev, (draft) => {
        if (!draft[nodeId]) {
          draft[nodeId] = [];
        }

        const existingProcess = draft[nodeId]!.find((process) => process.processId === processId);
        if (existingProcess) {
          existingProcess.graphId = execution?.graphId ?? existingProcess.graphId;
          existingProcess.graphRunId = execution?.graphRunId ?? existingProcess.graphRunId;
          existingProcess.rootRunId = execution?.rootRunId ?? existingProcess.rootRunId;
          existingProcess.data = {
            ...existingProcess.data,
            ...cloneNodeDataForHistory(data, dataRefs),
          };
          return;
        }

        if (previousDataPerNodeToKeep > -1) {
          const dataNotKept =
            previousDataPerNodeToKeep === 0 ? draft[nodeId]! : draft[nodeId]!.slice(0, -previousDataPerNodeToKeep);

          for (const previousProcess of dataNotKept) {
            if (previousProcess.data.inputData) {
              previousProcess.data.inputData = {};
            }
            if (previousProcess.data.outputData) {
              previousProcess.data.outputData = {};
            }
            if (previousProcess.data.splitOutputData) {
              previousProcess.data.splitOutputData = {};
            }
          }
        }

        draft[nodeId]!.push({
          processId,
          graphId: execution?.graphId,
          graphRunId: execution?.graphRunId,
          rootRunId: execution?.rootRunId,
          data: cloneNodeDataForHistory(data, dataRefs)!,
        });
      }),
    );
  };

  const setSelectedNodePageLatest = (nodeId: NodeId, execution: GraphExecutionMetadata | undefined) => {
    const view = currentGraphViewLatest.current;
    const selectionByView = selectedGraphRunByViewLatest.current;
    const shouldFollowLatest =
      view != null &&
      execution?.graphId === view.graphId &&
      (selectionByView[view.key] ?? 'latest') === 'latest';

    if (!shouldFollowLatest) {
      return;
    }

    setSelectedPage((prev) => ({ ...prev, [nodeId]: 'latest' }));
  };

  const onUserInput = ({ node, processId, inputStrings, execution }: ProcessEvents['userInput']) => {
    const questions: ProcessQuestions = {
      nodeId: node.id,
      processId,
      questions: inputStrings,
    };

    setUserInputQuestions((currentQuestions) => {
      const previousQuestions = currentQuestions[node.id] ?? [];
      return {
        ...currentQuestions,
        [node.id]: [...previousQuestions, questions],
      };
    });

    setSelectedNodePageLatest(node.id, execution);
  };

  const onTrivetStart = () => {
    setLastRecordingState(undefined);
    setUserInputQuestions({});
    setLastRunData({});
  };

  return {
    onTrivetStart,
    onUserInput,
    setDataForNode,
    setSelectedNodePageLatest,
    trivetRunningLatest,
  };
}
