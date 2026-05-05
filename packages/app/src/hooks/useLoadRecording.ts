import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { toast } from 'react-toastify';
import { graphRunningState } from '../state/dataFlow.js';
import { loadedRecordingState } from '../state/execution.js';
import { useIOProvider } from '../providers/ProvidersContext.js';

export function useLoadRecording() {
  const ioProvider = useIOProvider();
  const graphRunning = useAtomValue(graphRunningState);
  const setLoadedRecording = useSetAtom(loadedRecordingState);
  const graphRunningRef = useRef(graphRunning);
  graphRunningRef.current = graphRunning;

  function canChangeRecording(action: 'loading' | 'unloading') {
    if (!graphRunningRef.current) {
      return true;
    }

    toast.warn(`Stop the current execution before ${action} a recording.`);
    return false;
  }

  return {
    loadRecording: () => {
      if (!canChangeRecording('loading')) {
        return;
      }

      ioProvider.loadRecordingData(({ recorder, path }) => {
        if (!canChangeRecording('loading')) {
          return;
        }

        setLoadedRecording({ recorder, path });
      });
    },
    unloadRecording: () => {
      if (!canChangeRecording('unloading')) {
        return;
      }

      setLoadedRecording(null);
    },
  };
}
