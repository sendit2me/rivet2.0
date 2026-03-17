import { produce } from 'immer';
import { useSetAtom } from 'jotai';
import { type ProcessEvents } from '@ironclad/rivet-core';
import { lastRecordingState } from '../state/execution';
import {
  graphPausedState,
  graphRunningState,
  graphStartTimeState,
  lastRunDataByNodeState,
  rootGraphState,
  runningGraphsState,
} from '../state/dataFlow';
import { userInputModalQuestionsState } from '../state/userInput';
import { keys } from '../../../core/src/utils/typeSafety';
import { handleError } from '../utils/errorHandling.js';
import type { ExecutionDataFlowApi } from './useExecutionDataFlow';

export type GraphExecutionEventsApi = {
  onAbort: (data: ProcessEvents['abort']) => void;
  onDone: (data: ProcessEvents['done']) => void;
  onError: (data: ProcessEvents['error']) => void;
  onGraphAbort: (data: ProcessEvents['graphAbort']) => void;
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
  const setLastRecordingState = useSetAtom(lastRecordingState);
  const setUserInputQuestions = useSetAtom(userInputModalQuestionsState);
  const setGraphRunning = useSetAtom(graphRunningState);
  const setGraphPaused = useSetAtom(graphPausedState);
  const setRunningGraphsState = useSetAtom(runningGraphsState);
  const setRootGraph = useSetAtom(rootGraphState);
  const setLastRunData = useSetAtom(lastRunDataByNodeState);
  const setGraphStartTime = useSetAtom(graphStartTimeState);

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
      setLastRunData({});
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

  const onGraphAbort = (_data: ProcessEvents['graphAbort']) => {
    // nothing right now
  };

  const onError = (data: ProcessEvents['error']) => {
    stopAll();
    handleError(data.error, 'Graph execution error', {
      toastError: false,
    });
  };

  const onGraphStart = (data: ProcessEvents['graphStart']) => {
    setRunningGraphsState((running) => [...running, data.graph.metadata!.id!]);
  };

  const onGraphFinish = (data: ProcessEvents['graphFinish']) => {
    if (data.graph.metadata?.id) {
      setRunningGraphsState((running) => {
        const nextRunningGraphs = [...running];
        const graphIndex = nextRunningGraphs.indexOf(data.graph.metadata!.id!);
        if (graphIndex !== -1) {
          nextRunningGraphs.splice(graphIndex, 1);
        }
        return nextRunningGraphs;
      });
    }
  };

  const onPause = () => {
    setGraphPaused(true);
  };

  const onResume = () => {
    setGraphPaused(false);
  };

  return {
    onAbort,
    onDone,
    onError,
    onGraphAbort,
    onGraphFinish,
    onGraphStart,
    onPause,
    onResume,
    onStart,
    onStop,
  };
}
