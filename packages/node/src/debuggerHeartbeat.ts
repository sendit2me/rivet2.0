import WebSocket from 'ws';
import { terminateDebuggerSocket } from './debuggerTransport.js';

export const DEBUGGER_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEBUGGER_HEARTBEAT_TIMEOUT_MS = 10_000;

export type DebuggerSocketHeartbeat = {
  markActivity: () => void;
};

export function startDebuggerSocketHeartbeat(
  socket: WebSocket,
  options: {
    intervalMs: number;
    timeoutMs: number;
  },
): DebuggerSocketHeartbeat {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    return {
      markActivity: () => {},
    };
  }

  let awaitingPong = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const clearHeartbeatTimeout = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  const markAlive = () => {
    awaitingPong = false;
    clearHeartbeatTimeout();
  };

  const terminateUnresponsiveSocket = () => {
    if (!awaitingPong) {
      return;
    }

    timeout = undefined;
    terminateDebuggerSocket(socket);
  };

  const sendPing = () => {
    if (socket.readyState !== WebSocket.OPEN || awaitingPong) {
      return;
    }

    awaitingPong = true;
    try {
      socket.ping();
    } catch {
      awaitingPong = false;
      terminateDebuggerSocket(socket);
      return;
    }

    timeout = setTimeout(terminateUnresponsiveSocket, options.timeoutMs);
    unrefTimer(timeout);
  };

  const interval = setInterval(sendPing, options.intervalMs);
  unrefTimer(interval);

  const cleanup = () => {
    clearInterval(interval);
    clearHeartbeatTimeout();
    socket.off('pong', markAlive);
    socket.off('message', markAlive);
    socket.off('close', cleanup);
    socket.off('error', cleanup);
  };

  socket.on('pong', markAlive);
  socket.on('message', markAlive);
  socket.once('close', cleanup);
  socket.once('error', cleanup);

  return {
    markActivity: markAlive,
  };
}

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>) {
  (timer as { unref?: () => void }).unref?.();
}
