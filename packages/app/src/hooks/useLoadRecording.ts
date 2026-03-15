import { useSetAtom } from 'jotai';
import { loadedRecordingState } from '../state/execution.js';
import { useIOProvider } from '../providers/ProvidersContext.js';

export function useLoadRecording() {
  const ioProvider = useIOProvider();
  const setLoadedRecording = useSetAtom(loadedRecordingState);

  return {
    loadRecording: () => {
      ioProvider.loadRecordingData(({ recorder, path }) => {
        setLoadedRecording({ recorder, path });
      });
    },
    unloadRecording: () => {
      setLoadedRecording(null);
    },
  };
}
