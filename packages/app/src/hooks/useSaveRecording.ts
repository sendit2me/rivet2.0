import { useAtomValue } from 'jotai';
import { lastRecordingState } from '../state/execution';
import { useCallback } from 'react';
import { useIOProvider } from '../providers/ProvidersContext';

export function useSaveRecording() {
  const ioProvider = useIOProvider();
  const recording = useAtomValue(lastRecordingState);

  return useCallback(async () => {
    if (!recording) {
      return;
    }

    try {
      await ioProvider.saveString(recording, `recording-${Date.now()}.rivet-recording`);
    } catch (err) {
      console.error(err);
    }
  }, [ioProvider, recording]);
}
