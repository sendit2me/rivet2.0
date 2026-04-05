import { produce } from 'immer';
import { useAtomValue, useSetAtom } from 'jotai';
import { type GraphId, type GraphRunId, type ProcessEvents } from '@ironclad/rivet-core';
import { useLatest } from 'ahooks';
import { lastRecordingState } from '../state/execution';
import {
  graphRunHistoryByViewState,
  graphPausedState,
  graphRunningState,
  graphStartTimeState,
  lastRunDataByNodeState,
  rootGraphState,
  runningGraphsState,
  selectedGraphRunByViewState,
  type GraphRunSelection,
  type GraphRunRecord,
} from '../state/dataFlow';
import { userInputModalQuestionsState } from '../state/userInput';
import { keys } from '../../../core/src/utils/typeSafety';
import { handleError } from '../utils/errorHandling.js';
import { buildGraphViewKeyFromExecution } from '../utils/executionIdentity';
import type { GraphViewKey } from '../domain/graphEditing/navigationActions.js';
import type { ExecutionDataFlowApi } from './useExecutionDataFlow';
import { useDataRefs } from '../providers/ProvidersContext.js';
import { clearExecutionDataRefs } from '../utils/executionDataTransforms.js';
import { removeRunningGraphEntry, updateSelectedGraphRunForGraphStart } from './graphExecutionEventHelpers.js';

export type GraphExecutionEventsApi = {
  onAbort: (data: ProcessEvents['abort']) => void;
  onDone: (data: ProcessEvents['done']) => void;
  onError: (data: ProcessEvents['error']) => void;
  onGraphAbort: (data: ProcessEvents['graphAbort']) => void;
  onGraphError: (data: ProcessEvents['graphError']) => void;
  onGraphFinish: (data: ProcessEvents['graphFinish']) => void;
  onGraphStart: (data: ProcessEvents['graphStart']) => void;
  onPause: () => void;
  onResume: () => void;
  onStart: (data: ProcessEvents['start']) => void;
  onStop: () => void;
};

export function useGraphExecutionEvents({
  trivetRunningLatest,
}: Pick<ExecutionDataFlowApi, 'trivetRunningLatest'>): GraphExecutionEventsApi {
  const dataRefs = useDataRefs();
  const setLastRecordingState = useSetAtom(lastRecordingState);
  const setUserInputQuestions = useSetAtom(userInputModalQuestionsState);
  const setGraphRunning = useSetAtom(graphRunningState);
  const setGraphPaused = useSetAtom(graphPausedState);
  const setRunningGraphsState = useSetAtom(runningGraphsState);
  const setRootGraph = useSetAtom(rootGraphState);
  const setLastRunData = useSetAtom(lastRunDataByNodeState);
  const lastRunData = useAtomValue(lastRunDataByNodeState);
  const setGraphStartTime = useSetAtom(graphStartTimeState);
  const setGraphRunHistoryByView = useSetAtom(graphRunHistoryByViewState);
  const setSelectedGraphRunByView = useSetAtom(selectedGraphRunByViewState);
  const lastRunDataLatest = useLatest(lastRunData);

  const stopAll = () => {
    setGraphRunning(false);
    setGraphPaused(false);
    setUserInputQuestions({});
    setRunningGraphsState([]);
  };

  const interruptAll = () => {
    setLastRunData((lastRun) =>
      produce(lastRun, (draft) => {
        keys(draft).forEach((nodeId) => {
          draft[nodeId]!.forEach((process) => {
            if (process.data.status?.type === 'running') {
              process.data.status = { type: 'interrupted' };
            }
          });
        });
      }),
    );
  };

  const onStart = ({ startGraph }: ProcessEvents['start']) => {
    setLastRecordingState(undefined);
    setUserInputQuestions({});
    setGraphRunning(true);
    setRootGraph(startGraph.metadata!.id);
    setGraphStartTime(Date.now());

    if (!trivetRunningLatest.current) {
      clearExecutionDataRefs(dataRefs, lastRunDataLatest.current);
      setLastRunData({});
      setGraphRunHistoryByView({});
      setSelectedGraphRunByView({});
    }
  };

  const onStop = () => {
    stopAll();
  };

  const onDone = (_data: ProcessEvents['done']) => {
    stopAll();
  };

  const onAbort = (_data: ProcessEvents['abort']) => {
    stopAll();
    interruptAll();
  };

  const onGraphAbort = (data: ProcessEvents['graphAbort']) => {
    const graphViewKey = buildGraphViewKeyFromExecution({ execution: data.execution });

    setRunningGraphsState((running) => removeRunningGraphEntry(running, data.graph.metadata!.id!));
    finishGraphRun(graphViewKey, data.execution.graphRunId, 'aborted');
  };

  const onGraphError = (data: ProcessEvents['graphError']) => {
    const graphViewKey = buildGraphViewKeyFromExecution({ execution: data.execution });

    setRunningGraphsState((running) => removeRunningGraphEntry(running, data.graph.metadata!.id!));
    finishGraphRun(graphViewKey, data.execution.graphRunId, 'error');
  };

  const onError = (data: ProcessEvents['error']) => {
    stopAll();
    handleError(data.error, 'Graph execution error', {
      toastError: false,
    });
  };

  const onGraphStart = (data: ProcessEvents['graphStart']) => {
    setRunningGraphsState((running) => [...running, data.graph.metadata!.id!]);

    const graphViewKey = buildGraphViewKeyFromExecution({ execution: data.execution });

    setGraphRunHistoryByView((prev) =>
      produce(prev, (draft) => {
        draft[graphViewKey] ??= [];
        const existing = draft[graphViewKey]!.find((graphRun) => graphRun.graphRunId === data.execution.graphRunId);
        if (!existing) {
          draft[graphViewKey]!.push({
            executor: data.execution.executor,
            graphId: data.execution.graphId,
            graphRunId: data.execution.graphRunId,
            parentGraphRunId: data.execution.parentGraphRunId,
            rootRunId: data.execution.rootRunId,
            startedAt: Date.now(),
            status: 'running',
          });
        }
      }),
    );
    setSelectedGraphRunByView((prev) => updateSelectedGraphRunForGraphStart(prev, graphViewKey));
  };

  const onGraphFinish = (data: ProcessEvents['graphFinish']) => {
    if (data.graph.metadata?.id) {
      setRunningGraphsState((running) => removeRunningGraphEntry(running, data.graph.metadata!.id!));
    }

    const graphViewKey = buildGraphViewKeyFromExecution({ execution: data.execution });
    finishGraphRun(graphViewKey, data.execution.graphRunId, 'ok');
  };

  const onPause = () => {
    setGraphPaused(true);
  };

  const onResume = () => {
    setGraphPaused(false);
  };

  const finishGraphRun = (graphViewKey: GraphViewKey, graphRunId: GraphRunId, status: GraphRunRecord['status']) => {
    setGraphRunHistoryByView((prev) =>
      produce(prev, (draft) => {
        const run = draft[graphViewKey]?.find((graphRun) => graphRun.graphRunId === graphRunId);
        if (run) {
          run.finishedAt = Date.now();
          run.status = status;
        }
      }),
    );
  };

  return {
    onAbort,
    onDone,
    onError,
    onGraphAbort,
    onGraphError,
    onGraphFinish,
    onGraphStart,
    onPause,
    onResume,
    onStart,
    onStop,
  };
}
