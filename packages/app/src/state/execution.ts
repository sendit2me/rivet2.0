import { atom } from 'jotai';
import { type ExecutionRecorder } from '@valerypopoff/rivet2-core';

/** Transient render tick for the runtime-owned executor/debugger session. */
export const executorSessionRevisionState = atom(0);

export const loadedRecordingState = atom<{
  path: string;
  recorder: ExecutionRecorder;
} | null>(null);

export const recordingPlaybackStartingState = atom(false);

export const lastRecordingState = atom<string | undefined>(undefined);
