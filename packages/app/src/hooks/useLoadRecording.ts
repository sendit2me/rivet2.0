import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { toast } from 'react-toastify';
import { graphRunningState } from '../state/dataFlow.js';
import { loadedRecordingState, recordingPlaybackStartingState } from '../state/execution.js';
import { useIOProvider } from '../providers/ProvidersContext.js';

export function useLoadRecording() {
  const ioProvider = useIOProvider();
  const graphRunning = useAtomValue(graphRunningState);
  const recordingPlaybackStarting = useAtomValue(recordingPlaybackStartingState);
  const setLoadedRecording = useSetAtom(loadedRecordingState);
  const setRecordingPlaybackStarting = useSetAtom(recordingPlaybackStartingState);
  const graphRunningRef = useRef(graphRunning);
  const recordingPlaybackStartingRef = useRef(recordingPlaybackStarting);
  graphRunningRef.current = graphRunning;
  recordingPlaybackStartingRef.current = recordingPlaybackStarting;

  function canChangeRecording(action: 'loading' | 'unloading') {
    if (!graphRunningRef.current) {
      if (!recordingPlaybackStartingRef.current) {
        return true;
      }

      toast.warn(`Wait for the current recording playback to start before ${action} a recording.`);
      return false;
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
        setRecordingPlaybackStarting(false);
      });
    },
    unloadRecording: () => {
      if (!canChangeRecording('unloading')) {
        return;
      }

      setLoadedRecording(null);
      setRecordingPlaybackStarting(false);
    },
  };
}
