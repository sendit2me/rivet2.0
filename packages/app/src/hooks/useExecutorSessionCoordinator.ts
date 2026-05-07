import { useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { useExecutorSessionHostConfig, useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { selectedExecutorState } from '../state/settings.js';
import { isInTauri } from '../utils/platform/core.js';
import {
  attachAndStartExecutorSidecar,
  detachAndStopExecutorSidecar,
  executorSidecarRuntime,
} from './useExecutorSidecar';
import type { DefaultExecutor } from '../state/settings.js';
import type { ExecutorSessionLifecycleEvent, ExecutorSessionRuntime } from './executorSession.js';
import { handleError } from '../utils/errorHandling.js';

export type ExecutorSessionStartupAction =
  | { type: 'connect-desktop-internal' }
  | { type: 'connect-hosted-internal'; url: string }
  | { type: 'disconnect' }
  | { type: 'fallback-browser' };

export function getExecutorSessionStartupAction(options: {
  internalExecutorUrl?: string;
  isTauri: boolean;
  selectedExecutor: DefaultExecutor;
}): ExecutorSessionStartupAction {
  if (options.selectedExecutor !== 'nodejs') {
    return { type: 'disconnect' };
  }

  if (options.internalExecutorUrl) {
    return { type: 'connect-hosted-internal', url: options.internalExecutorUrl };
  }

  if (!options.isTauri) {
    return { type: 'fallback-browser' };
  }

  return { type: 'connect-desktop-internal' };
}

export function shouldRestoreInternalNodeExecutorAfterExternalDebuggerDisconnect(options: {
  event: ExecutorSessionLifecycleEvent;
  hasInternalExecutorUrl: boolean;
  isTauri: boolean;
  selectedExecutor: DefaultExecutor;
}) {
  return (
    options.selectedExecutor === 'nodejs' &&
    options.event.type === 'disconnected' &&
    (options.event.reason === 'manual-disconnect' || options.event.reason === 'unexpected-disconnect') &&
    options.event.target?.type === 'external-debugger' &&
    (options.hasInternalExecutorUrl || options.isTauri)
  );
}

type CoordinatorRuntime = Pick<
  ExecutorSessionRuntime,
  'connectInternalDesktopExecutor' | 'connectInternalHostedExecutor' | 'disconnect'
>;

type CoordinatorSidecar = {
  attachAndStart: () => Promise<void>;
  detachAndStop: () => Promise<void>;
  isStarted: () => boolean;
};

const defaultCoordinatorSidecar: CoordinatorSidecar = {
  attachAndStart: attachAndStartExecutorSidecar,
  detachAndStop: detachAndStopExecutorSidecar,
  isStarted: () => executorSidecarRuntime.started,
};

function handleCoordinatorError(error: unknown, context: string) {
  handleError(error, context, {
    toastError: false,
  });
}

function connectInternalNodeExecutor(runtime: CoordinatorRuntime, internalExecutorUrl?: string) {
  const promise = internalExecutorUrl
    ? runtime.connectInternalHostedExecutor(internalExecutorUrl)
    : runtime.connectInternalDesktopExecutor();

  void promise.catch((error) => {
    handleCoordinatorError(error, 'Executor session coordinator connect failed');
  });
}

export function handleExecutorSessionCoordinatorDisconnect(options: {
  event: ExecutorSessionLifecycleEvent;
  getInternalExecutorUrl: () => string | undefined;
  getSelectedExecutor: () => DefaultExecutor;
  isTauri: boolean;
  runtime: CoordinatorRuntime;
}) {
  const internalExecutorUrl = options.getInternalExecutorUrl();
  const selectedExecutor = options.getSelectedExecutor();

  if (
    !shouldRestoreInternalNodeExecutorAfterExternalDebuggerDisconnect({
      event: options.event,
      hasInternalExecutorUrl: !!internalExecutorUrl,
      isTauri: options.isTauri,
      selectedExecutor,
    })
  ) {
    return;
  }

  connectInternalNodeExecutor(options.runtime, internalExecutorUrl);
}

function stopSidecarAfterCleanup(sidecar: CoordinatorSidecar) {
  void sidecar.detachAndStop().catch((error) => {
    handleCoordinatorError(error, 'Executor session coordinator sidecar cleanup failed');
  });
}

export function runExecutorSessionStartupAction(options: {
  action: ExecutorSessionStartupAction;
  runtime: CoordinatorRuntime;
  setSelectedExecutor: (executor: DefaultExecutor) => void;
  sidecar?: CoordinatorSidecar;
}) {
  const { action, runtime, setSelectedExecutor, sidecar = defaultCoordinatorSidecar } = options;

  if (action.type === 'disconnect') {
    runtime.disconnect();

    return () => {
      runtime.disconnect();
    };
  }

  if (action.type === 'connect-hosted-internal') {
    connectInternalNodeExecutor(runtime, action.url);

    return () => {
      runtime.disconnect();
    };
  }

  if (action.type === 'fallback-browser') {
    setSelectedExecutor('browser');
    runtime.disconnect();
    return;
  }

  let cancelled = false;

  void (async () => {
    try {
      await sidecar.attachAndStart();

      if (!cancelled && sidecar.isStarted()) {
        await runtime.connectInternalDesktopExecutor();
      }
    } catch (error) {
      handleCoordinatorError(error, 'Executor session coordinator startup failed');
    }
  })();

  return () => {
    cancelled = true;
    runtime.disconnect();
    stopSidecarAfterCleanup(sidecar);
  };
}

export function useExecutorSessionCoordinator(selectedExecutor: DefaultExecutor) {
  const runtime = useExecutorSessionRuntime();
  const hostConfig = useExecutorSessionHostConfig();
  const setSelectedExecutor = useSetAtom(selectedExecutorState);
  const internalExecutorUrlRef = useRef(hostConfig?.internalExecutorUrl);
  const selectedExecutorRef = useRef(selectedExecutor);

  internalExecutorUrlRef.current = hostConfig?.internalExecutorUrl;
  selectedExecutorRef.current = selectedExecutor;

  useEffect(() => {
    return runtime.subscribeLifecycle('disconnect', (event) => {
      handleExecutorSessionCoordinatorDisconnect({
        event,
        getInternalExecutorUrl: () => internalExecutorUrlRef.current,
        getSelectedExecutor: () => selectedExecutorRef.current,
        isTauri: isInTauri(),
        runtime,
      });
    });
  }, [runtime]);

  useEffect(() => {
    const startupAction = getExecutorSessionStartupAction({
      internalExecutorUrl: hostConfig?.internalExecutorUrl,
      isTauri: isInTauri(),
      selectedExecutor,
    });

    return runExecutorSessionStartupAction({
      action: startupAction,
      runtime,
      setSelectedExecutor,
    });
  }, [hostConfig?.internalExecutorUrl, runtime, selectedExecutor, setSelectedExecutor]);
}
