import { useLatest } from 'ahooks';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import type { OutgoingMessageMap } from '@ironclad/rivet-core';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import {
  buildExecutorSessionState,
  connectExecutorSession,
  disconnectExecutorSession,
  getExecutorSessionRuntimeState,
  sendExecutorSessionMessage,
  sendExecutorSessionRaw,
  subscribeExecutorSessionLifecycle,
  type ExecutorSessionState,
} from './executorSession';

export function getDebuggerSocket(): WebSocket | null {
  return getExecutorSessionRuntimeState().socket;
}

export function useRemoteDebugger(options: { onConnect?: () => void; onDisconnect?: () => void } = {}) {
  const debuggerConfig = useAtomValue(remoteDebuggerConfigState);
  const connectionState = useAtomValue(remoteDebuggerConnectionState);
  const onConnectLatest = useLatest(options.onConnect ?? (() => {}));
  const onDisconnectLatest = useLatest(options.onDisconnect ?? (() => {}));

  useEffect(() => {
    const unsubscribeConnect = subscribeExecutorSessionLifecycle('connect', () => onConnectLatest.current?.());
    const unsubscribeDisconnect = subscribeExecutorSessionLifecycle('disconnect', () => onDisconnectLatest.current?.());

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, [onConnectLatest, onDisconnectLatest]);

  const sessionState: ExecutorSessionState = buildExecutorSessionState(debuggerConfig, connectionState);

  return {
    sessionState,
    connect: (url: string) => {
      void connectExecutorSession(url);
    },
    disconnect: () => {
      disconnectExecutorSession();
    },
    send<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]) {
      sendExecutorSessionMessage(type, data);
    },
    sendRaw(data: string) {
      sendExecutorSessionRaw(data);
    },
  };
}
