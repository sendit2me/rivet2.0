import { useLatest } from 'ahooks';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import type { OutgoingMessageMap } from '@valerypopoff/rivet2-core';
import { useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { executorSessionRevisionState } from '../state/execution.js';
import { handleError } from '../utils/errorHandling.js';
import { type ExecutorSessionLifecycleEvent, type ExecutorSessionState } from './executorSession';

export function useRemoteDebugger(
  options: {
    onConnect?: (event: ExecutorSessionLifecycleEvent) => void | Promise<void>;
    onDisconnect?: (event: ExecutorSessionLifecycleEvent) => void | Promise<void>;
  } = {},
) {
  const runtime = useExecutorSessionRuntime();
  useAtomValue(executorSessionRevisionState);
  const onConnectLatest = useLatest(options.onConnect ?? (() => {}));
  const onDisconnectLatest = useLatest(options.onDisconnect ?? (() => {}));

  useEffect(() => {
    const unsubscribeConnect = runtime.subscribeLifecycle('connect', (event) => onConnectLatest.current?.(event));
    const unsubscribeDisconnect = runtime.subscribeLifecycle('disconnect', (event) =>
      onDisconnectLatest.current?.(event),
    );

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, [onConnectLatest, onDisconnectLatest, runtime]);

  const sessionState: ExecutorSessionState = runtime.buildSessionState();

  return {
    sessionState,
    connect: (url?: string) => {
      void runtime.connectExternalDebugger(url).catch((error) => {
        handleError(error, 'Failed to connect Remote Debugger');
      });
    },
    disconnect: () => {
      runtime.disconnect();
    },
    send<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]) {
      return runtime.sendMessage(type, data);
    },
    sendRaw(data: string) {
      return runtime.sendRaw(data);
    },
  };
}
