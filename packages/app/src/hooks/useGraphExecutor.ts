import { useAtomValue } from 'jotai';
import { loadedRecordingState } from '../state/execution';
import { selectedExecutorState } from '../state/settings';
import { canRunGraphFromEditor, shouldUseRemoteExecutor } from '../state/selectors/executionSelectors.js';
import { useLocalExecutor } from './useLocalExecutor';
import { useRemoteExecutor } from './useRemoteExecutor';
import { useExecutorSessionState } from './useExecutorSession';
import { useStableCallback } from './useStableCallback';

export function useGraphExecutor() {
  const selectedExecutor = useAtomValue(selectedExecutorState);
  const loadedRecording = useAtomValue(loadedRecordingState);
  const localExecutor = useLocalExecutor();
  const remoteExecutor = useRemoteExecutor();
  const session = useExecutorSessionState();
  const hasLoadedRecording = !!loadedRecording;
  const ignoreEditorRun = useStableCallback(async () => {});
  const allowEditorGraphRun = canRunGraphFromEditor({
    hasLoadedRecording,
    selectedExecutor,
    session,
  });

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
    tryRunGraph: allowEditorGraphRun ? graphRunExecutor.tryRunGraph : ignoreEditorRun,
    tryAbortGraph: graphControlExecutor.tryAbortGraph,
    tryPauseGraph: graphControlExecutor.tryPauseGraph,
    tryResumeGraph: graphControlExecutor.tryResumeGraph,
    tryRunTests: liveExecutor.tryRunTests,
  };
}
