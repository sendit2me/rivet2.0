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
} from '@ironclad/rivet-core';
import { logRuntimeDebug } from '@ironclad/rivet-core';
import type { AppDatasetProvider } from '../providers/ProvidersContext.js';
import type { RemoteDebuggerConfig, RemoteDebuggerConnectionState } from '../state/execution.js';
import { handleError } from '../utils/errorHandling.js';

export const DEFAULT_REMOTE_DEBUGGER_URL = 'ws://localhost:21888';
export const INTERNAL_EXECUTOR_URL = 'ws://127.0.0.1:21889/internal';

export type ExecutorSessionStatus = 'idle' | 'connecting' | 'ready' | 'reconnecting';

export type ExecutorSessionState = RemoteDebuggerConfig &
  RemoteDebuggerConnectionState & {
    socket: WebSocket | null;
    status: ExecutorSessionStatus;
  };

type DebuggerMessageHandler = <K extends keyof ProcessEventMessageMap>(
  message: K,
  data: ProcessEventMessageMap[K],
  requestId?: RemoteRunRequestId,
) => void;
type LifecycleCallback = () => void;
type ConnectionStateSetter = (
  updater: RemoteDebuggerConnectionState | ((prev: RemoteDebuggerConnectionState) => RemoteDebuggerConnectionState),
) => void;
type ConfigStateSetter = (
  updater: RemoteDebuggerConfig | ((prev: RemoteDebuggerConfig) => RemoteDebuggerConfig),
) => void;

type PendingExecution = {
  requestId: RemoteRunRequestId;
  promise: Promise<GraphOutputs>;
  resolve: (value: GraphOutputs) => void;
  reject: (reason?: unknown) => void;
};

export type PendingGraphExecution = {
  requestId: RemoteRunRequestId;
  promise: Promise<GraphOutputs>;
};

export type ExecutorSessionRuntime = {
  setDatasetProvider(datasetProvider: AppDatasetProvider | null): void;
  subscribeLifecycle(type: 'connect' | 'disconnect', callback: LifecycleCallback): () => void;
  subscribeMessages(handler: DebuggerMessageHandler): () => void;
  getRuntimeState(): Pick<ExecutorSessionState, 'socket' | 'status'>;
  buildSessionState(
    debuggerConfig: RemoteDebuggerConfig,
    connectionState: RemoteDebuggerConnectionState,
  ): ExecutorSessionState;
  connect(url: string): Promise<void>;
  connectInternal(url?: string): Promise<void>;
  disconnect(): void;
  sendMessage<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]): void;
  sendRaw(data: string): void;
  isReady(): boolean;
  createRemoteExecutionRequest(): RemoteRunRequestId;
  createPendingGraphExecution(requestId?: RemoteRunRequestId): PendingGraphExecution;
  resolvePendingGraphExecution(requestId: RemoteRunRequestId | undefined, outputs: GraphOutputs): void;
  rejectPendingGraphExecution(requestId: RemoteRunRequestId | undefined, reason: unknown): void;
};

export function createExecutorSessionRuntime(options: {
  setDebuggerConfig: ConfigStateSetter;
  setConnectionState: ConnectionStateSetter;
  datasetProvider?: AppDatasetProvider | null;
}): ExecutorSessionRuntime {
  let currentSocket: WebSocket | null = null;
  let currentDatasetProvider: AppDatasetProvider | null = options.datasetProvider ?? null;
  let reconnectingTimeout: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 0;
  let manuallyDisconnecting = false;
  let currentUrl = '';
  let currentIsInternalExecutor = false;
  let currentStatus: ExecutorSessionStatus = 'idle';
  let currentSocketGeneration = 0;
  let pendingRequestCounter = 0;

  const pendingExecutions = new Map<RemoteRunRequestId, PendingExecution>();

  const onConnectCallbacks = new Set<LifecycleCallback>();
  const onDisconnectCallbacks = new Set<LifecycleCallback>();
  const debuggerMessageHandlers = new Set<DebuggerMessageHandler>();

  function notifyConnect() {
    for (const callback of onConnectCallbacks) {
      callback();
    }
  }

  function notifyDisconnect() {
    for (const callback of onDisconnectCallbacks) {
      callback();
    }
  }

  function setConnectionStatus(status: ExecutorSessionStatus) {
    if (status !== currentStatus) {
      logRuntimeDebug('Executor session status changed.', {
        from: currentStatus,
        to: status,
        target: currentUrl ? targetLabel(currentIsInternalExecutor) : 'none',
        socketReadyState: currentSocket?.readyState ?? null,
      });
    }

    currentStatus = status;
    options.setConnectionState(legacyConnectionStateFor(status));
  }

  function setDebuggerConfig(updater: RemoteDebuggerConfig | ((prev: RemoteDebuggerConfig) => RemoteDebuggerConfig)) {
    options.setDebuggerConfig(updater);
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

  async function connect(url: string, options: { isInternalExecutor?: boolean } = {}) {
    const normalizedUrl = url || DEFAULT_REMOTE_DEBUGGER_URL;
    const nextIsInternalExecutor = options.isInternalExecutor ?? normalizedUrl === INTERNAL_EXECUTOR_URL;
    const previousIsInternalExecutor = currentIsInternalExecutor;

    currentUrl = normalizedUrl;
    currentIsInternalExecutor = nextIsInternalExecutor;
    manuallyDisconnecting = false;
    retryDelay = 0;
    clearReconnectTimeout();

    if (currentSocket) {
      const sameUrl = currentSocket.url === normalizedUrl;
      const sameTarget = previousIsInternalExecutor === nextIsInternalExecutor;
      if (
        sameUrl &&
        sameTarget &&
        (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
      ) {
        logRuntimeDebug('Executor session reused existing websocket.', {
          target: targetLabel(nextIsInternalExecutor),
          socketReadyState: currentSocket.readyState,
        });
        setDebuggerConfig((prev) => ({
          ...prev,
          url: normalizedUrl,
          isInternalExecutor: nextIsInternalExecutor,
        }));
        setConnectionStatus(currentSocket.readyState === WebSocket.OPEN ? 'ready' : 'connecting');
        return;
      }

      if (currentSocket.readyState !== WebSocket.CLOSED) {
        currentSocketGeneration += 1;
        logRuntimeDebug('Executor session closing previous websocket before reconnect.', {
          target: targetLabel(nextIsInternalExecutor),
          previousSocketReadyState: currentSocket.readyState,
        });
        currentSocket.close();
      }
    }

    logRuntimeDebug('Executor session opening websocket.', {
      target: targetLabel(nextIsInternalExecutor),
    });

    const socket = new WebSocket(normalizedUrl);
    const socketGeneration = ++currentSocketGeneration;
    const socketIsInternalExecutor = nextIsInternalExecutor;
    currentSocket = socket;

    setDebuggerConfig((prev) => ({
      ...prev,
      remoteUploadAllowed: false,
      url: normalizedUrl,
      isInternalExecutor: nextIsInternalExecutor,
    }));
    setConnectionStatus('connecting');

    socket.onopen = () => {
      if (socketGeneration !== currentSocketGeneration || currentSocket !== socket) {
        return;
      }

      retryDelay = 0;
      logRuntimeDebug('Executor websocket opened.', {
        target: targetLabel(socketIsInternalExecutor),
      });
      setConnectionStatus('ready');
      notifyConnect();
    };

    socket.onclose = () => {
      if (socketGeneration !== currentSocketGeneration) {
        return;
      }

      currentSocket = null;
      setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: false }));
      logRuntimeDebug('Executor websocket closed.', {
        target: targetLabel(socketIsInternalExecutor),
        manuallyDisconnecting,
      });

      if (manuallyDisconnecting) {
        manuallyDisconnecting = false;
        setConnectionStatus('idle');
        rejectAllPendingExecutions(new Error('executor session disconnected'));
        notifyDisconnect();
        return;
      }

      setConnectionStatus('reconnecting');
      rejectAllPendingExecutions(new Error('executor session disconnected'));
      notifyDisconnect();

      const nextRetryDelay = Math.min(2000, (retryDelay + 100) * 1.5);
      retryDelay = nextRetryDelay;
      logRuntimeDebug('Executor websocket reconnect scheduled.', {
        target: targetLabel(currentIsInternalExecutor),
        retryDelayMs: nextRetryDelay,
      });

      reconnectingTimeout = setTimeout(() => {
        void connect(currentUrl);
      }, nextRetryDelay);
    };

    socket.onerror = (event) => {
      if (socketGeneration !== currentSocketGeneration || currentSocket !== socket) {
        return;
      }

      handleError(event, 'Executor websocket transport error', {
        metadata: {
          socketUrl: socket.url,
          status: currentStatus,
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
            socketUrl: socket.url,
            rawMessage: event.data,
          },
          toastError: false,
        });
        return;
      }

      if (incoming.message === 'graph-upload-allowed') {
        setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: true }));
        return;
      }

      if (incoming.message.startsWith('datasets:')) {
        if (currentDatasetProvider) {
          void handleDatasetsMessage(
            currentDatasetProvider,
            incoming.message as keyof DatasetRequestMap,
            incoming.data as DatasetRequestPayload<unknown>,
            socket,
          );
        }
        return;
      }

      if (isProcessEventMessage(incoming)) {
        for (const handler of debuggerMessageHandlers) {
          handler(incoming.message, incoming.data, incoming.requestId);
        }
      }
    };
  }

  function disconnect() {
    const hadActiveSession = currentSocket != null || currentStatus !== 'idle';
    logRuntimeDebug('Executor session disconnect requested.', {
      hadActiveSession,
      target: currentUrl ? targetLabel(currentIsInternalExecutor) : 'none',
    });
    setConnectionStatus('idle');
    manuallyDisconnecting = true;
    retryDelay = 0;
    clearReconnectTimeout();
    rejectAllPendingExecutions(new Error('executor session disconnected'));
    setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: false }));

    if (currentSocket) {
      currentSocket.close();
    } else {
      manuallyDisconnecting = false;
      if (hadActiveSession) {
        notifyDisconnect();
      }
    }
  }

  const runtime: ExecutorSessionRuntime = {
    setDatasetProvider(datasetProvider) {
      currentDatasetProvider = datasetProvider;
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
    getRuntimeState() {
      return {
        socket: currentSocket,
        status: currentStatus,
      };
    },
    buildSessionState(debuggerConfig, connectionState) {
      return {
        ...debuggerConfig,
        ...connectionState,
        ...legacyConnectionStateFor(currentStatus),
        socket: currentSocket,
        status: currentStatus,
      };
    },
    connect,
    connectInternal(url = INTERNAL_EXECUTOR_URL) {
      return connect(url, { isInternalExecutor: true });
    },
    disconnect,
    sendMessage(type, data) {
      if (currentSocket?.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({ type, data }));
      }
    },
    sendRaw(data) {
      if (currentSocket?.readyState === WebSocket.OPEN) {
        currentSocket.send(data);
      }
    },
    isReady() {
      return currentSocket?.readyState === WebSocket.OPEN;
    },
    createRemoteExecutionRequest,
    createPendingGraphExecution(requestId = createRemoteExecutionRequest()) {
      rejectPendingExecution(new Error('graph execution replaced by a newer request'), requestId);

      let resolve!: (value: GraphOutputs) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<GraphOutputs>((res, rej) => {
        resolve = res;
        reject = rej;
      });

      pendingExecutions.set(requestId, { requestId, promise, resolve, reject });
      return { requestId, promise };
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
    rejectPendingGraphExecution(requestId, reason) {
      if (!requestId) {
        if (pendingExecutions.size !== 1) {
          return;
        }

        requestId = pendingExecutions.keys().next().value as RemoteRunRequestId;
      }

      rejectPendingExecution(reason, requestId);
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

function legacyConnectionStateFor(status: ExecutorSessionStatus): RemoteDebuggerConnectionState {
  return {
    started: status === 'connecting' || status === 'ready',
    reconnecting: status === 'reconnecting',
  };
}

function targetLabel(isInternalExecutor: boolean) {
  return isInternalExecutor ? 'internal-sidecar' : 'external-debugger';
}

function sendDatasetResponse(socket: WebSocket, requestId: string, payload: unknown) {
  const msg: OutgoingMessage = { type: 'datasets:response', data: { requestId, payload } };
  socket.send(JSON.stringify(msg));
}

async function handleDatasetsMessage(
  datasetProvider: AppDatasetProvider,
  type: keyof DatasetRequestMap,
  data: DatasetRequestPayload<unknown>,
  socket: WebSocket,
) {
  const { requestId, payload } = data as DatasetRequestPayload<any>;
  await match(type)
    .with('datasets:get-metadata', async () => {
      const metadata = await datasetProvider.getDatasetMetadata(payload.id);
      sendDatasetResponse(socket, requestId, metadata);
    })
    .with('datasets:get-for-project', async () => {
      const metadata = await datasetProvider.getDatasetsForProject(payload.projectId);
      sendDatasetResponse(socket, requestId, metadata);
    })
    .with('datasets:get-data', async () => {
      const datasetData = await datasetProvider.getDatasetData(payload.id);
      sendDatasetResponse(socket, requestId, datasetData);
    })
    .with('datasets:put-data', async () => {
      await datasetProvider.putDatasetData(payload.id, payload.data);
      sendDatasetResponse(socket, requestId, undefined);
    })
    .with('datasets:put-row', async () => {
      await datasetProvider.putDatasetRow(payload.id, payload.row);
      sendDatasetResponse(socket, requestId, undefined);
    })
    .with('datasets:put-metadata', async () => {
      await datasetProvider.putDatasetMetadata(payload.metadata);
      sendDatasetResponse(socket, requestId, undefined);
    })
    .with('datasets:clear-data', async () => {
      await datasetProvider.clearDatasetData(payload.id);
      sendDatasetResponse(socket, requestId, undefined);
    })
    .with('datasets:delete', async () => {
      await datasetProvider.deleteDataset(payload.id);
      sendDatasetResponse(socket, requestId, undefined);
    })
    .with('datasets:knn', async () => {
      const nearest = await datasetProvider.knnDatasetRows(payload.datasetId, payload.k, payload.vector);
      sendDatasetResponse(socket, requestId, nearest);
    })
    .otherwise(() => {
      handleError(new Error(`Unknown datasets message type: ${String(type)}`), 'Failed to handle datasets message', {
        metadata: {
          requestId,
          type,
        },
        toastError: false,
      });
    });
}
