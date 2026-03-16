import { useLatest } from 'ahooks';
import { useAtom } from 'jotai';
import { useEffect } from 'react';
import type { OutgoingMessageMap, ProcessEventMessageMap } from '@ironclad/rivet-core';
import type { RemoteDebuggerConfig, RemoteDebuggerConnectionState } from '../state/execution.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { useDatasetProvider } from '../providers/ProvidersContext';
import {
  bindExecutorSession,
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
  const datasetProvider = useDatasetProvider();
  const [debuggerConfig, setDebuggerConfig] = useAtom(remoteDebuggerConfigState);
  const [connectionState, setConnectionState] = useAtom(remoteDebuggerConnectionState);
  const onConnectLatest = useLatest(options.onConnect ?? (() => {}));
  const onDisconnectLatest = useLatest(options.onDisconnect ?? (() => {}));

  useEffect(() => {
    bindExecutorSession({
      datasetProvider,
      setDebuggerConfig,
      setConnectionState,
    });
  }, [datasetProvider, setConnectionState, setDebuggerConfig]);

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
    remoteDebuggerState: sessionState,
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
