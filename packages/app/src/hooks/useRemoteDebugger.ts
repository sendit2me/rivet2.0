import { useLatest } from 'ahooks';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import type { OutgoingMessageMap } from '@ironclad/rivet-core';
import { useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { type ExecutorSessionState } from './executorSession';

export function useRemoteDebugger(options: { onConnect?: () => void; onDisconnect?: () => void } = {}) {
  const runtime = useExecutorSessionRuntime();
  const debuggerConfig = useAtomValue(remoteDebuggerConfigState);
  const connectionState = useAtomValue(remoteDebuggerConnectionState);
  const onConnectLatest = useLatest(options.onConnect ?? (() => {}));
  const onDisconnectLatest = useLatest(options.onDisconnect ?? (() => {}));

  useEffect(() => {
    const unsubscribeConnect = runtime.subscribeLifecycle('connect', () => onConnectLatest.current?.());
    const unsubscribeDisconnect = runtime.subscribeLifecycle('disconnect', () => onDisconnectLatest.current?.());

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, [onConnectLatest, onDisconnectLatest, runtime]);

  const sessionState: ExecutorSessionState = runtime.buildSessionState(debuggerConfig, connectionState);

  return {
    sessionState,
    connect: (url: string) => {
      void runtime.connect(url);
    },
    disconnect: () => {
      runtime.disconnect();
    },
    send<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]) {
      runtime.sendMessage(type, data);
    },
    sendRaw(data: string) {
      runtime.sendRaw(data);
    },
  };
}
