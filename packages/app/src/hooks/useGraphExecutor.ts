import { useAtomValue } from 'jotai';
import { loadedRecordingState } from '../state/execution';
import { selectedExecutorState } from '../state/settings';
import { shouldUseRemoteExecutor } from '../state/selectors/executionSelectors.js';
import { useLocalExecutor } from './useLocalExecutor';
import { useRemoteExecutor } from './useRemoteExecutor';
import { useExecutorSessionState } from './useExecutorSession';

export function useGraphExecutor() {
  const selectedExecutor = useAtomValue(selectedExecutorState);
  const loadedRecording = useAtomValue(loadedRecordingState);
  const localExecutor = useLocalExecutor();
  const remoteExecutor = useRemoteExecutor();
  const session = useExecutorSessionState();
  const hasLoadedRecording = !!loadedRecording;

  const liveExecutor = shouldUseRemoteExecutor({
    selectedExecutor,
    session,
  })
    ? remoteExecutor
    : localExecutor;

  const graphRunExecutor = shouldUseRemoteExecutor({
    hasLoadedRecording,
    selectedExecutor,
    session,
  })
    ? remoteExecutor
    : localExecutor;

  const graphControlExecutor = hasLoadedRecording ? localExecutor : liveExecutor;

  return {
    tryRunGraph: graphRunExecutor.tryRunGraph,
    tryAbortGraph: graphControlExecutor.tryAbortGraph,
    tryPauseGraph: graphControlExecutor.tryPauseGraph,
    tryResumeGraph: graphControlExecutor.tryResumeGraph,
    tryRunTests: liveExecutor.tryRunTests,
  };
}
