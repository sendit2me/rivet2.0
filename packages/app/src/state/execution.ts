import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { type ExecutionRecorder } from '@ironclad/rivet-core';
import { createHybridStorage } from './storage.js';

const { storage } = createHybridStorage('execution');

export const remoteUploadAllowedState = atom<boolean>(false);

/** Persistent config for the remote debugger (survives page reload). */
export type RemoteDebuggerConfig = {
  url: string;
  remoteUploadAllowed: boolean;
  isInternalExecutor: boolean;
};

export const remoteDebuggerConfigState = atomWithStorage<RemoteDebuggerConfig>(
  'remoteDebuggerConfig',
  {
    url: '',
    remoteUploadAllowed: false,
    isInternalExecutor: false,
  },
  storage,
);

/** Transient runtime state for the remote debugger (reset on reload). */
export type RemoteDebuggerConnectionState = {
  started: boolean;
  reconnecting: boolean;
};

export const remoteDebuggerConnectionState = atom<RemoteDebuggerConnectionState>({
  started: false,
  reconnecting: false,
});

/**
 * Combined view for backward compatibility.
 * @deprecated Prefer reading remoteDebuggerConfigState and remoteDebuggerConnectionState directly.
 */
export type RemoteDebuggerState = RemoteDebuggerConfig &
  RemoteDebuggerConnectionState & {
    socket: WebSocket | null;
  };

export const loadedRecordingState = atom<{
  path: string;
  recorder: ExecutionRecorder;
} | null>(null);

export const lastRecordingState = atom<string | undefined>(undefined);
