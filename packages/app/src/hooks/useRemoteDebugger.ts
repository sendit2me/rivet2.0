import { useLatest } from 'ahooks';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import type { OutgoingMessageMap } from '@ironclad/rivet-core';
import { useExecutorSessionHostConfig, useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { selectedExecutorState, type DefaultExecutor } from '../state/settings.js';
import { type ExecutorSessionState } from './executorSession';
import { isInTauri } from '../utils/platform/core.js';

export function shouldRestoreInternalNodeExecutorAfterDebuggerDisconnect(options: {
  selectedExecutor: DefaultExecutor;
  sessionState: Pick<ExecutorSessionState, 'status' | 'isInternalExecutor'>;
  hasInternalExecutorUrl: boolean;
  isTauri: boolean;
}) {
  return (
    options.selectedExecutor === 'nodejs' &&
    options.sessionState.status !== 'idle' &&
    !options.sessionState.isInternalExecutor &&
    (options.hasInternalExecutorUrl || options.isTauri)
  );
}

export function useRemoteDebugger(options: { onConnect?: () => void; onDisconnect?: () => void } = {}) {
  const runtime = useExecutorSessionRuntime();
  const hostConfig = useExecutorSessionHostConfig();
  const selectedExecutor = useAtomValue(selectedExecutorState);
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
      const shouldRestoreInternalNodeExecutor = shouldRestoreInternalNodeExecutorAfterDebuggerDisconnect({
        selectedExecutor,
        sessionState,
        hasInternalExecutorUrl: !!hostConfig?.internalExecutorUrl,
        isTauri: isInTauri(),
      });

      runtime.disconnect();

      if (shouldRestoreInternalNodeExecutor) {
        void runtime.connectInternal(hostConfig?.internalExecutorUrl);
      }
    },
    send<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]) {
      runtime.sendMessage(type, data);
    },
    sendRaw(data: string) {
      runtime.sendRaw(data);
    },
  };
}
