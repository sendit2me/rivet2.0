import { useAtomValue } from 'jotai';
import { lastRecordingState } from '../state/execution';
import { useIOProvider } from '../providers/ProvidersContext';
import { wrapAsync } from '../utils/errorHandling.js';

export function useSaveRecording() {
  const ioProvider = useIOProvider();
  const recording = useAtomValue(lastRecordingState);

  return wrapAsync(
    async () => {
      if (!recording) {
        return;
      }

      await ioProvider.saveString(recording, `recording-${Date.now()}.rivet-recording`);
    },
    'Failed to save recording',
    {
      metadata: {
        recordingLength: recording?.length ?? 0,
      },
    },
  );
}
