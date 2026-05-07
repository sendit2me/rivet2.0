import { match } from 'ts-pattern';
import type {
  IncomingMessage,
  OutgoingMessage,
  OutgoingMessageMap,
  DatasetRequestPayload,
  DatasetRequestMap,
  ProcessEventMessage,
  ProcessEventMessageMap,
  GraphOutputs,
  RemoteRunRequestId,
} from '@valerypopoff/rivet2-core';
import { logRuntimeDebug } from '@valerypopoff/rivet2-core';
import type { AppDatasetProvider } from '../providers/ProvidersContext.js';
import { handleError } from '../utils/errorHandling.js';

export const DEFAULT_REMOTE_DEBUGGER_URL = 'ws://localhost:21888';
export const INTERNAL_EXECUTOR_URL = 'ws://127.0.0.1:21889/internal';

export type ExecutorSessionStatus = 'idle' | 'connecting' | 'ready' | 'reconnecting';

export type ExecutorSessionTarget =
  | { type: 'internal-desktop'; url: string }
  | { type: 'internal-hosted'; url: string }
  | { type: 'external-debugger'; url: string };

export type ExecutorSessionCapabilities = {
  canBridgeDatasets: boolean;
  canRecordSocket: boolean;
  canSendAbort: boolean;
  canSendPause: boolean;
  canSendResume: boolean;
  canSendRun: boolean;
  canUploadProject: boolean;
};

export type ExecutorSessionState = {
  capabilities: ExecutorSessionCapabilities;
  isInternalExecutor: boolean;
  reconnecting: boolean;
  remoteUploadAllowed: boolean;
  socket: WebSocket | null;
  started: boolean;
  status: ExecutorSessionStatus;
  target: ExecutorSessionTarget | null;
  url: string;
};

type MaybePromise<T> = T | Promise<T>;

type DebuggerMessageHandler = <K extends keyof ProcessEventMessageMap>(
  message: K,
  data: ProcessEventMessageMap[K],
  requestId?: RemoteRunRequestId,
) => MaybePromise<void>;

export type ExecutorSessionDisconnectReason = 'manual-disconnect' | 'unexpected-disconnect' | 'replaced';

export type ExecutorSessionConnectedEvent = {
  isInternalExecutor: boolean;
  reason: 'connected';
  status: ExecutorSessionStatus;
  target: ExecutorSessionTarget;
  type: 'connected';
  url: string;
};

export type ExecutorSessionDisconnectedEvent = {
  isInternalExecutor: boolean;
  reason: ExecutorSessionDisconnectReason;
  status: ExecutorSessionStatus;
  target: ExecutorSessionTarget | null;
  type: 'disconnected';
  url: string;
};

export type ExecutorSessionLifecycleEvent = ExecutorSessionConnectedEvent | ExecutorSessionDisconnectedEvent;

type LifecycleCallback = (event: ExecutorSessionLifecycleEvent) => MaybePromise<void>;
type StateChangeCallback = () => MaybePromise<void>;

type PendingExecution = {
  promise: Promise<GraphOutputs>;
  reject: (reason?: unknown) => void;
  requestId: RemoteRunRequestId;
  resolve: (value: GraphOutputs) => void;
};

export type PendingGraphExecution = {
  promise: Promise<GraphOutputs>;
  requestId: RemoteRunRequestId;
};

export type ExecutorSessionRuntime = {
  buildSessionState(legacyDebuggerConfig?: unknown, legacyConnectionState?: unknown): ExecutorSessionState;
  connect(url?: string): Promise<void>;
  connectExternalDebugger(url?: string): Promise<void>;
  connectInternal(url?: string): Promise<void>;
  connectInternalDesktopExecutor(): Promise<void>;
  connectInternalHostedExecutor(url: string): Promise<void>;
  createPendingGraphExecution(requestId?: RemoteRunRequestId): PendingGraphExecution;
  createRemoteExecutionRequest(): RemoteRunRequestId;
  disconnect(): void;
  getRuntimeState(): Pick<
    ExecutorSessionState,
    'capabilities' | 'isInternalExecutor' | 'remoteUploadAllowed' | 'socket' | 'status' | 'target' | 'url'
  >;
  isReady(): boolean;
  rejectPendingGraphExecution(requestId: RemoteRunRequestId | undefined, reason: unknown): void;
  recordSocketEvents(recordSocket: (socket: WebSocket) => Promise<void>): Promise<void> | undefined;
  resolvePendingGraphExecution(requestId: RemoteRunRequestId | undefined, outputs: GraphOutputs): void;
  sendMessage<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]): boolean;
  sendRaw(data: string): boolean;
  setDatasetProvider(datasetProvider: AppDatasetProvider | null): void;
  subscribeLifecycle(type: 'connect' | 'disconnect', callback: LifecycleCallback): () => void;
  subscribeMessages(handler: DebuggerMessageHandler): () => void;
};

export function createExecutorSessionRuntime(options: {
  datasetProvider?: AppDatasetProvider | null;
  onStateChange: StateChangeCallback;
}): ExecutorSessionRuntime {
  let currentDatasetProvider: AppDatasetProvider | null = options.datasetProvider ?? null;
  let currentRemoteUploadAllowed = false;
  let currentSocket: WebSocket | null = null;
  let currentSocketGeneration = 0;
  let currentStatus: ExecutorSessionStatus = 'idle';
  let currentTarget: ExecutorSessionTarget | null = null;
  let pendingRequestCounter = 0;
  let reconnectingTimeout: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 0;

  const pendingExecutions = new Map<RemoteRunRequestId, PendingExecution>();

  const onConnectCallbacks = new Set<LifecycleCallback>();
  const onDisconnectCallbacks = new Set<LifecycleCallback>();
  const debuggerMessageHandlers = new Set<DebuggerMessageHandler>();

  function notifyConnect(event: ExecutorSessionConnectedEvent) {
    notifyLifecycleCallbacks(onConnectCallbacks, event);
  }

  function notifyDisconnect(event: ExecutorSessionDisconnectedEvent) {
    notifyLifecycleCallbacks(onDisconnectCallbacks, event);
  }

  function notifyLifecycleCallbacks(callbacks: Set<LifecycleCallback>, event: ExecutorSessionLifecycleEvent) {
    for (const callback of [...callbacks]) {
      try {
        watchCallbackResult(callback(event), 'Executor session lifecycle subscriber failed', {
          reason: event.reason,
          target: event.target?.type ?? 'none',
          url: event.url,
        });
      } catch (error) {
        reportCallbackError(error, 'Executor session lifecycle subscriber failed', {
          reason: event.reason,
          target: event.target?.type ?? 'none',
          url: event.url,
        });
      }
    }
  }

  function notifyStateChanged() {
    try {
      watchCallbackResult(options.onStateChange(), 'Executor session state-change callback failed', {
        socketReadyState: currentSocket?.readyState ?? null,
        status: currentStatus,
        target: currentTarget?.type ?? 'none',
      });
    } catch (error) {
      reportCallbackError(error, 'Executor session state-change callback failed', {
        socketReadyState: currentSocket?.readyState ?? null,
        status: currentStatus,
        target: currentTarget?.type ?? 'none',
      });
    }
  }

  function setConnectionStatus(status: ExecutorSessionStatus) {
    if (status !== currentStatus) {
      logRuntimeDebug('Executor session status changed.', {
        from: currentStatus,
        socketReadyState: currentSocket?.readyState ?? null,
        target: currentTarget ? targetLabel(currentTarget) : 'none',
        to: status,
      });
    }

    currentStatus = status;
    notifyStateChanged();
  }

  function notifySessionStateChanged() {
    notifyStateChanged();
  }

  function clearReconnectTimeout() {
    if (reconnectingTimeout) {
      clearTimeout(reconnectingTimeout);
      reconnectingTimeout = undefined;
    }
  }

  function createRemoteExecutionRequest(): RemoteRunRequestId {
    pendingRequestCounter += 1;
    return `remote-run-${pendingRequestCounter}`;
  }

  function rejectPendingExecution(reason: unknown, requestId: RemoteRunRequestId) {
    const pendingExecution = pendingExecutions.get(requestId);
    if (!pendingExecution) {
      return;
    }

    pendingExecution.reject(reason);
    pendingExecutions.delete(requestId);
  }

  function rejectAllPendingExecutions(reason: unknown) {
    for (const pendingExecution of pendingExecutions.values()) {
      pendingExecution.reject(reason);
    }

    pendingExecutions.clear();
  }

  function getCapabilities(): ExecutorSessionCapabilities {
    const socketReady = currentStatus === 'ready' && currentSocket?.readyState === WebSocket.OPEN;

    return {
      canBridgeDatasets: socketReady && currentDatasetProvider != null,
      canRecordSocket: socketReady,
      canSendAbort: socketReady,
      canSendPause: socketReady,
      canSendResume: socketReady,
      canSendRun: socketReady,
      canUploadProject: socketReady && currentRemoteUploadAllowed,
    };
  }

  async function connectToTarget(nextTarget: ExecutorSessionTarget) {
    retryDelay = 0;
    clearReconnectTimeout();

    if (currentSocket || (currentTarget && currentStatus !== 'idle')) {
      if (
        currentTarget &&
        targetsEqual(currentTarget, nextTarget) &&
        currentSocket &&
        (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
      ) {
        logRuntimeDebug('Executor session reused existing websocket.', {
          socketReadyState: currentSocket.readyState,
          target: targetLabel(nextTarget),
        });
        setConnectionStatus(currentSocket.readyState === WebSocket.OPEN ? 'ready' : 'connecting');
        notifySessionStateChanged();
        return;
      }

      if (!currentTarget || !targetsEqual(currentTarget, nextTarget)) {
        replaceCurrentSession(nextTarget);
      } else if (currentSocket) {
        replaceCurrentSession(nextTarget);
      }
    }

    currentTarget = nextTarget;
    currentRemoteUploadAllowed = false;
    notifySessionStateChanged();

    logRuntimeDebug('Executor session opening websocket.', {
      target: targetLabel(nextTarget),
    });

    let socket: WebSocket;
    try {
      socket = new WebSocket(nextTarget.url);
    } catch (error) {
      currentTarget = null;
      currentRemoteUploadAllowed = false;
      setConnectionStatus('idle');
      throw error;
    }

    const socketGeneration = ++currentSocketGeneration;
    const socketTarget = nextTarget;
    currentSocket = socket;
    setConnectionStatus('connecting');

    socket.onopen = () => {
      if (socketGeneration !== currentSocketGeneration || currentSocket !== socket) {
        return;
      }

      retryDelay = 0;
      currentTarget = socketTarget;
      logRuntimeDebug('Executor websocket opened.', {
        target: targetLabel(socketTarget),
      });
      setConnectionStatus('ready');
      notifySessionStateChanged();
      notifyConnect({
        isInternalExecutor: isInternalTarget(socketTarget),
        reason: 'connected',
        status: currentStatus,
        target: socketTarget,
        type: 'connected',
        url: socket.url,
      });
    };

    socket.onclose = () => {
      if (socketGeneration !== currentSocketGeneration) {
        return;
      }

      const closedTarget = socketTarget;
      currentSocket = null;
      currentRemoteUploadAllowed = false;
      logRuntimeDebug('Executor websocket closed.', {
        target: targetLabel(closedTarget),
      });

      rejectAllPendingExecutions(new Error('executor session disconnected'));

      if (!isInternalTarget(closedTarget)) {
        logRuntimeDebug('External debugger websocket closed; automatic reconnect skipped.', {
          target: targetLabel(closedTarget),
        });
        setConnectionStatus('idle');
        currentTarget = null;
        notifySessionStateChanged();
        notifyDisconnect({
          isInternalExecutor: false,
          reason: 'unexpected-disconnect',
          status: currentStatus,
          target: closedTarget,
          type: 'disconnected',
          url: socket.url,
        });
        return;
      }

      setConnectionStatus('reconnecting');
      currentTarget = closedTarget;
      notifySessionStateChanged();

      const nextRetryDelay = Math.min(2000, (retryDelay + 100) * 1.5);
      retryDelay = nextRetryDelay;
      const reconnectTarget = closedTarget;

      logRuntimeDebug('Executor websocket reconnect scheduled.', {
        retryDelayMs: nextRetryDelay,
        target: targetLabel(reconnectTarget),
      });

      reconnectingTimeout = setTimeout(() => {
        void connectToTarget(reconnectTarget);
      }, nextRetryDelay);

      notifyDisconnect({
        isInternalExecutor: true,
        reason: 'unexpected-disconnect',
        status: currentStatus,
        target: closedTarget,
        type: 'disconnected',
        url: socket.url,
      });
    };

    socket.onerror = (event) => {
      if (socketGeneration !== currentSocketGeneration || currentSocket !== socket) {
        return;
      }

      handleError(event, 'Executor websocket transport error', {
        metadata: {
          socketUrl: socket.url,
          status: currentStatus,
          target: socketTarget.type,
        },
        toastError: false,
      });
    };

    socket.onmessage = (event) => {
      if (socketGeneration !== currentSocketGeneration || currentSocket !== socket) {
        return;
      }

      let incoming: IncomingMessage;
      try {
        incoming = JSON.parse(event.data) as IncomingMessage;
      } catch (error) {
        handleError(error, 'Failed to parse executor message', {
          metadata: {
            rawMessage: event.data,
            socketUrl: socket.url,
            target: socketTarget.type,
          },
          toastError: false,
        });
        return;
      }

      if (incoming.message === 'graph-upload-allowed') {
        currentRemoteUploadAllowed = true;
        notifySessionStateChanged();
        return;
      }

      if (incoming.message.startsWith('datasets:')) {
        if (currentDatasetProvider) {
          void handleDatasetsMessage(
            currentDatasetProvider,
            incoming.message as keyof DatasetRequestMap,
            incoming.data as DatasetRequestPayload<unknown>,
            socket,
            socketTarget,
          ).catch((error) => {
            const requestId = getDatasetRequestId(incoming.data);
            handleError(error, 'Failed to handle executor dataset request', {
              metadata: {
                requestId,
                socketUrl: socket.url,
                target: socketTarget.type,
                type: incoming.message,
              },
              toastError: false,
            });
          });
        }
        return;
      }

      if (isProcessEventMessage(incoming)) {
        for (const handler of [...debuggerMessageHandlers]) {
          try {
            watchCallbackResult(
              handler(incoming.message, incoming.data, incoming.requestId),
              'Executor process-message subscriber failed',
              {
                message: incoming.message,
                requestId: incoming.requestId,
                target: socketTarget.type,
              },
            );
          } catch (error) {
            reportCallbackError(error, 'Executor process-message subscriber failed', {
              message: incoming.message,
              requestId: incoming.requestId,
              target: socketTarget.type,
            });
          }
        }
      }
    };
  }

  function replaceCurrentSession(nextTarget: ExecutorSessionTarget) {
    const oldSocket = currentSocket;
    const oldTarget = currentTarget;
    const oldUrl = oldTarget?.url ?? oldSocket?.url ?? '';

    logRuntimeDebug('Executor session replacing active websocket.', {
      nextTarget: targetLabel(nextTarget),
      previousSocketReadyState: oldSocket?.readyState ?? null,
      previousTarget: oldTarget ? targetLabel(oldTarget) : 'none',
    });

    if (oldSocket) {
      currentSocketGeneration += 1;
      currentSocket = null;
    }

    clearReconnectTimeout();
    setConnectionStatus('idle');
    currentTarget = null;
    currentRemoteUploadAllowed = false;
    rejectAllPendingExecutions(new Error('executor session replaced'));
    notifySessionStateChanged();

    if (oldSocket && oldSocket.readyState !== WebSocket.CLOSED) {
      oldSocket.close();
    }

    notifyDisconnect({
      isInternalExecutor: isInternalTarget(oldTarget),
      reason: 'replaced',
      status: currentStatus,
      target: oldTarget,
      type: 'disconnected',
      url: oldUrl,
    });
  }

  function disconnect() {
    const hadActiveSession = currentSocket != null || currentStatus !== 'idle';
    const socketToClose = currentSocket;
    const disconnectedTarget = currentTarget;
    const disconnectedUrl = currentTarget?.url ?? currentSocket?.url ?? '';

    logRuntimeDebug('Executor session disconnect requested.', {
      hadActiveSession,
      target: currentTarget ? targetLabel(currentTarget) : 'none',
    });

    if (socketToClose) {
      currentSocketGeneration += 1;
      currentSocket = null;
    }

    setConnectionStatus('idle');
    retryDelay = 0;
    currentTarget = null;
    currentRemoteUploadAllowed = false;
    clearReconnectTimeout();
    rejectAllPendingExecutions(new Error('executor session disconnected'));
    notifySessionStateChanged();

    if (socketToClose && socketToClose.readyState !== WebSocket.CLOSED) {
      socketToClose.close();
    }

    if (hadActiveSession) {
      notifyDisconnect({
        isInternalExecutor: isInternalTarget(disconnectedTarget),
        reason: 'manual-disconnect',
        status: currentStatus,
        target: disconnectedTarget,
        type: 'disconnected',
        url: disconnectedUrl,
      });
    }
  }

  const runtime: ExecutorSessionRuntime = {
    buildSessionState(_legacyDebuggerConfig?: unknown, _legacyConnectionState?: unknown) {
      return {
        ...legacyConnectionStateFor(currentStatus),
        capabilities: getCapabilities(),
        isInternalExecutor: isInternalTarget(currentTarget),
        remoteUploadAllowed: currentRemoteUploadAllowed,
        socket: currentSocket,
        status: currentStatus,
        target: currentTarget,
        url: currentTarget?.url ?? '',
      };
    },
    connect(url = DEFAULT_REMOTE_DEBUGGER_URL) {
      return runtime.connectExternalDebugger(url);
    },
    connectExternalDebugger(url = DEFAULT_REMOTE_DEBUGGER_URL) {
      return connectToTarget({
        type: 'external-debugger',
        url: url || DEFAULT_REMOTE_DEBUGGER_URL,
      });
    },
    connectInternal(url = INTERNAL_EXECUTOR_URL) {
      return url === INTERNAL_EXECUTOR_URL
        ? runtime.connectInternalDesktopExecutor()
        : runtime.connectInternalHostedExecutor(url);
    },
    connectInternalDesktopExecutor() {
      return connectToTarget({
        type: 'internal-desktop',
        url: INTERNAL_EXECUTOR_URL,
      });
    },
    connectInternalHostedExecutor(url) {
      return connectToTarget({
        type: 'internal-hosted',
        url,
      });
    },
    createPendingGraphExecution(requestId = createRemoteExecutionRequest()) {
      rejectPendingExecution(new Error('graph execution replaced by a newer request'), requestId);

      let resolve!: (value: GraphOutputs) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<GraphOutputs>((res, rej) => {
        resolve = res;
        reject = rej;
      });

      pendingExecutions.set(requestId, { promise, reject, requestId, resolve });
      return { promise, requestId };
    },
    createRemoteExecutionRequest,
    disconnect,
    getRuntimeState() {
      return {
        capabilities: getCapabilities(),
        isInternalExecutor: isInternalTarget(currentTarget),
        remoteUploadAllowed: currentRemoteUploadAllowed,
        socket: currentSocket,
        status: currentStatus,
        target: currentTarget,
        url: currentTarget?.url ?? '',
      };
    },
    isReady() {
      return currentSocket?.readyState === WebSocket.OPEN;
    },
    rejectPendingGraphExecution(requestId, reason) {
      if (!requestId) {
        if (pendingExecutions.size !== 1) {
          return;
        }

        requestId = pendingExecutions.keys().next().value as RemoteRunRequestId;
      }

      rejectPendingExecution(reason, requestId);
    },
    recordSocketEvents(recordSocket) {
      if (!getCapabilities().canRecordSocket || !currentSocket) {
        logRuntimeDebug('Executor socket recording skipped because the session cannot be recorded.', {
          status: currentStatus,
          target: currentTarget?.type ?? 'none',
        });
        return undefined;
      }

      return recordSocket(currentSocket);
    },
    resolvePendingGraphExecution(requestId, outputs) {
      if (!requestId) {
        if (pendingExecutions.size !== 1) {
          return;
        }

        requestId = pendingExecutions.keys().next().value as RemoteRunRequestId;
      }

      const pendingExecution = pendingExecutions.get(requestId);
      pendingExecution?.resolve(outputs);
      pendingExecutions.delete(requestId);
    },
    sendMessage(type, data) {
      const message = { data, type } as OutgoingMessage;
      return safeSendSocket(
        currentSocket,
        JSON.stringify(message),
        'Failed to send executor message',
        {
          messageType: type,
          target: currentTarget?.type ?? 'none',
        },
      );
    },
    sendRaw(data) {
      return safeSendSocket(currentSocket, data, 'Failed to send raw executor message', {
        target: currentTarget?.type ?? 'none',
      });
    },
    setDatasetProvider(datasetProvider) {
      currentDatasetProvider = datasetProvider;
      notifySessionStateChanged();
    },
    subscribeLifecycle(type, callback) {
      const callbacks = type === 'connect' ? onConnectCallbacks : onDisconnectCallbacks;
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
    subscribeMessages(handler) {
      debuggerMessageHandlers.add(handler);
      return () => {
        debuggerMessageHandlers.delete(handler);
      };
    },
  };

  return runtime;
}

function isProcessEventMessageName(message: IncomingMessage['message']): message is keyof ProcessEventMessageMap {
  return !message.startsWith('datasets:') && message !== 'graph-upload-allowed';
}

function isProcessEventMessage(message: IncomingMessage): message is ProcessEventMessage {
  return isProcessEventMessageName(message.message);
}

function legacyConnectionStateFor(status: ExecutorSessionStatus): Pick<ExecutorSessionState, 'reconnecting' | 'started'> {
  return {
    reconnecting: status === 'reconnecting',
    started: status === 'connecting' || status === 'ready',
  };
}

function targetsEqual(left: ExecutorSessionTarget, right: ExecutorSessionTarget) {
  return left.type === right.type && left.url === right.url;
}

function isInternalTarget(target: ExecutorSessionTarget | null | undefined) {
  return target?.type === 'internal-desktop' || target?.type === 'internal-hosted';
}

function targetLabel(target: ExecutorSessionTarget) {
  switch (target.type) {
    case 'external-debugger':
      return 'external-debugger';
    case 'internal-desktop':
      return 'internal-desktop-executor';
    case 'internal-hosted':
      return 'internal-hosted-executor';
  }
}

function getDatasetRequestId(data: unknown) {
  return typeof data === 'object' && data != null && 'requestId' in data ? String(data.requestId) : undefined;
}

function safeSendSocket(
  socket: WebSocket | null,
  data: string,
  context: string,
  metadata: Record<string, unknown>,
) {
  if (socket?.readyState !== WebSocket.OPEN) {
    logRuntimeDebug('Executor websocket send skipped because socket is not open.', {
      ...metadata,
      socketReadyState: socket?.readyState ?? null,
    });
    return false;
  }

  try {
    socket.send(data);
    return true;
  } catch (error) {
    handleError(error, context, {
      metadata: {
        ...metadata,
        socketUrl: socket.url,
      },
      toastError: false,
    });
    return false;
  }
}

function watchCallbackResult(
  result: MaybePromise<void>,
  context: string,
  metadata: Record<string, unknown>,
) {
  void Promise.resolve(result).catch((error) => {
    reportCallbackError(error, context, metadata);
  });
}

function reportCallbackError(error: unknown, context: string, metadata: Record<string, unknown>) {
  handleError(error, context, {
    metadata,
    toastError: false,
  });
}

function sendDatasetResponse(socket: WebSocket, requestId: string, payload: unknown, target: ExecutorSessionTarget) {
  const msg: OutgoingMessage = { type: 'datasets:response', data: { payload, requestId } };
  safeSendSocket(socket, JSON.stringify(msg), 'Failed to send executor dataset response', {
    requestId,
    target: target.type,
  });
}

async function handleDatasetsMessage(
  datasetProvider: AppDatasetProvider,
  type: keyof DatasetRequestMap,
  data: DatasetRequestPayload<unknown>,
  socket: WebSocket,
  target: ExecutorSessionTarget,
) {
  const { payload, requestId } = data as DatasetRequestPayload<any>;
  await match(type)
    .with('datasets:get-metadata', async () => {
      const metadata = await datasetProvider.getDatasetMetadata(payload.id);
      sendDatasetResponse(socket, requestId, metadata, target);
    })
    .with('datasets:get-for-project', async () => {
      const metadata = await datasetProvider.getDatasetsForProject(payload.projectId);
      sendDatasetResponse(socket, requestId, metadata, target);
    })
    .with('datasets:get-data', async () => {
      const datasetData = await datasetProvider.getDatasetData(payload.id);
      sendDatasetResponse(socket, requestId, datasetData, target);
    })
    .with('datasets:put-data', async () => {
      await datasetProvider.putDatasetData(payload.id, payload.data);
      sendDatasetResponse(socket, requestId, undefined, target);
    })
    .with('datasets:put-row', async () => {
      await datasetProvider.putDatasetRow(payload.id, payload.row);
      sendDatasetResponse(socket, requestId, undefined, target);
    })
    .with('datasets:put-metadata', async () => {
      await datasetProvider.putDatasetMetadata(payload.metadata);
      sendDatasetResponse(socket, requestId, undefined, target);
    })
    .with('datasets:clear-data', async () => {
      await datasetProvider.clearDatasetData(payload.id);
      sendDatasetResponse(socket, requestId, undefined, target);
    })
    .with('datasets:delete', async () => {
      await datasetProvider.deleteDataset(payload.id);
      sendDatasetResponse(socket, requestId, undefined, target);
    })
    .with('datasets:knn', async () => {
      const nearest = await datasetProvider.knnDatasetRows(payload.datasetId, payload.k, payload.vector);
      sendDatasetResponse(socket, requestId, nearest, target);
    })
    .otherwise(() => {
      handleError(new Error(`Unknown datasets message type: ${String(type)}`), 'Failed to handle datasets message', {
        metadata: {
          requestId,
          target: target.type,
          type,
        },
        toastError: false,
      });
    });
}
