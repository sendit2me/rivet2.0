import WebSocket from 'ws';
import { getError } from '@valerypopoff/rivet2-core';

export type DebuggerErrorEmitter = {
  emit(eventName: 'error', eventData: Error): Promise<void>;
};

export type DebuggerSocketActivity = {
  markActivity: () => void;
};

export function stringifyDebuggerMessage(
  message: unknown,
  emitter: DebuggerErrorEmitter,
): string | undefined {
  try {
    return JSON.stringify(message);
  } catch (err) {
    emitDebuggerError(emitter, err);
    return undefined;
  }
}

export function sendDebuggerMessage(
  socket: WebSocket,
  payload: string,
  emitter: DebuggerErrorEmitter,
  heartbeat?: DebuggerSocketActivity,
) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(payload, (err) => {
      if (err) {
        emitDebuggerError(emitter, err);
        terminateDebuggerSocket(socket);
        return;
      }

      heartbeat?.markActivity();
    });
    heartbeat?.markActivity();
    return true;
  } catch (err) {
    emitDebuggerError(emitter, err);
    terminateDebuggerSocket(socket);
    return false;
  }
}

export function emitDebuggerError(emitter: DebuggerErrorEmitter, error: unknown) {
  void emitter.emit('error', getError(error)).catch(() => {
    // noop, just prevent unhandled rejection
  });
}

export function terminateDebuggerSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  try {
    socket.terminate();
  } catch {
    // noop; send failures should not escape debugger transport cleanup
  }
}
