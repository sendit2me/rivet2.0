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
} from '@ironclad/rivet-core';
import type { AppDatasetProvider } from '../providers/ProvidersContext.js';
import type { RemoteDebuggerConfig, RemoteDebuggerConnectionState } from '../state/execution.js';

export const DEFAULT_REMOTE_DEBUGGER_URL = 'ws://localhost:21888';
export const INTERNAL_EXECUTOR_URL = 'ws://localhost:21889/internal';

export type ExecutorSessionStatus = 'idle' | 'connecting' | 'ready' | 'reconnecting';

export type ExecutorSessionState = RemoteDebuggerConfig &
  RemoteDebuggerConnectionState & {
    socket: WebSocket | null;
    status: ExecutorSessionStatus;
  };

type DebuggerMessageHandler = <K extends keyof ProcessEventMessageMap>(message: K, data: ProcessEventMessageMap[K]) => void;
type LifecycleCallback = () => void;
type ConnectionStateSetter = (
  updater: RemoteDebuggerConnectionState | ((prev: RemoteDebuggerConnectionState) => RemoteDebuggerConnectionState),
) => void;
type ConfigStateSetter = (updater: RemoteDebuggerConfig | ((prev: RemoteDebuggerConfig) => RemoteDebuggerConfig)) => void;

let currentSocket: WebSocket | null = null;
let currentDatasetProvider: AppDatasetProvider | null = null;
let reconnectingTimeout: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 0;
let manuallyDisconnecting = false;
let currentUrl = '';
let currentStatus: ExecutorSessionStatus = 'idle';
let currentSocketGeneration = 0;
let setDebuggerConfigState: ConfigStateSetter | null = null;
let setConnectionStateValue: ConnectionStateSetter | null = null;

const onConnectCallbacks = new Set<LifecycleCallback>();
const onDisconnectCallbacks = new Set<LifecycleCallback>();
const debuggerMessageHandlers = new Set<DebuggerMessageHandler>();

type PendingExecution = {
  promise: Promise<GraphOutputs>;
  resolve: (value: GraphOutputs) => void;
  reject: (reason?: unknown) => void;
};

let pendingExecution: PendingExecution | null = null;

function isProcessEventMessageName(message: IncomingMessage['message']): message is keyof ProcessEventMessageMap {
  return !message.startsWith('datasets:') && message !== 'graph-upload-allowed';
}

function isProcessEventMessage(message: IncomingMessage): message is ProcessEventMessage {
  return isProcessEventMessageName(message.message);
}

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

function legacyConnectionStateFor(status: ExecutorSessionStatus): RemoteDebuggerConnectionState {
  return {
    started: status === 'connecting' || status === 'ready',
    reconnecting: status === 'reconnecting',
  };
}

function setConnectionStatus(status: ExecutorSessionStatus) {
  currentStatus = status;
  setConnectionStateValue?.(legacyConnectionStateFor(status));
}

function setDebuggerConfig(updater: RemoteDebuggerConfig | ((prev: RemoteDebuggerConfig) => RemoteDebuggerConfig)) {
  setDebuggerConfigState?.(updater);
}

function clearReconnectTimeout() {
  if (reconnectingTimeout) {
    clearTimeout(reconnectingTimeout);
    reconnectingTimeout = undefined;
  }
}

function rejectPendingExecution(reason: unknown) {
  if (!pendingExecution) {
    return;
  }

  pendingExecution.reject(reason);
  pendingExecution = null;
}

export function bindExecutorSession(options: {
  datasetProvider: AppDatasetProvider;
  setDebuggerConfig: ConfigStateSetter;
  setConnectionState: ConnectionStateSetter;
}) {
  currentDatasetProvider = options.datasetProvider;
  setDebuggerConfigState = options.setDebuggerConfig;
  setConnectionStateValue = options.setConnectionState;
}

export function subscribeExecutorSessionLifecycle(
  type: 'connect' | 'disconnect',
  callback: LifecycleCallback,
): () => void {
  const callbacks = type === 'connect' ? onConnectCallbacks : onDisconnectCallbacks;
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}

export function subscribeExecutorSessionMessages(handler: DebuggerMessageHandler): () => void {
  debuggerMessageHandlers.add(handler);
  return () => {
    debuggerMessageHandlers.delete(handler);
  };
}

export function getExecutorSessionRuntimeState() {
  return {
    socket: currentSocket,
    status: currentStatus,
  };
}

export function buildExecutorSessionState(
  debuggerConfig: RemoteDebuggerConfig,
  connectionState: RemoteDebuggerConnectionState,
): ExecutorSessionState {
  return {
    ...debuggerConfig,
    ...connectionState,
    ...legacyConnectionStateFor(currentStatus),
    socket: currentSocket,
    status: currentStatus,
  };
}

export async function connectExecutorSession(url: string) {
  const normalizedUrl = url || DEFAULT_REMOTE_DEBUGGER_URL;

  currentUrl = normalizedUrl;
  manuallyDisconnecting = false;
  retryDelay = 0;
  clearReconnectTimeout();

  if (currentSocket) {
    const sameUrl = currentSocket.url === normalizedUrl;
    if (
      sameUrl &&
      (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
    ) {
      setDebuggerConfig((prev) => ({
        ...prev,
        url: normalizedUrl,
        isInternalExecutor: normalizedUrl === INTERNAL_EXECUTOR_URL,
      }));
      setConnectionStatus(currentSocket.readyState === WebSocket.OPEN ? 'ready' : 'connecting');
      return;
    }

    if (currentSocket.readyState !== WebSocket.CLOSED) {
      currentSocketGeneration += 1;
      currentSocket.close();
    }
  }

  const socket = new WebSocket(normalizedUrl);
  const socketGeneration = ++currentSocketGeneration;
  currentSocket = socket;

  setDebuggerConfig((prev) => ({
    ...prev,
    remoteUploadAllowed: false,
    url: normalizedUrl,
    isInternalExecutor: normalizedUrl === INTERNAL_EXECUTOR_URL,
  }));
  setConnectionStatus('connecting');

  socket.onopen = () => {
    if (socketGeneration !== currentSocketGeneration || currentSocket !== socket) {
      return;
    }

    retryDelay = 0;
    setConnectionStatus('ready');
    notifyConnect();
  };

  socket.onclose = () => {
    if (socketGeneration !== currentSocketGeneration) {
      return;
    }

    currentSocket = null;
    setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: false }));

    if (manuallyDisconnecting) {
      manuallyDisconnecting = false;
      setConnectionStatus('idle');
      rejectPendingExecution(new Error('executor session disconnected'));
      notifyDisconnect();
      return;
    }

    setConnectionStatus('reconnecting');
    rejectPendingExecution(new Error('executor session disconnected'));
    notifyDisconnect();

    const nextRetryDelay = Math.min(2000, (retryDelay + 100) * 1.5);
    retryDelay = nextRetryDelay;

    reconnectingTimeout = setTimeout(() => {
      void connectExecutorSession(currentUrl);
    }, nextRetryDelay);
  };

  socket.onmessage = (event) => {
    if (socketGeneration !== currentSocketGeneration || currentSocket !== socket) {
      return;
    }

    const incoming = JSON.parse(event.data) as IncomingMessage;

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
        handler(incoming.message, incoming.data);
      }
    }
  };
}

export function connectInternalExecutorSession() {
  return connectExecutorSession(INTERNAL_EXECUTOR_URL);
}

export function disconnectExecutorSession() {
  const hadActiveSession = currentSocket != null || currentStatus !== 'idle';
  setConnectionStatus('idle');
  manuallyDisconnecting = true;
  retryDelay = 0;
  clearReconnectTimeout();
  rejectPendingExecution(new Error('executor session disconnected'));
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

export function sendExecutorSessionMessage<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]) {
  if (currentSocket?.readyState === WebSocket.OPEN) {
    currentSocket.send(JSON.stringify({ type, data }));
  }
}

export function sendExecutorSessionRaw(data: string) {
  if (currentSocket?.readyState === WebSocket.OPEN) {
    currentSocket.send(data);
  }
}

export function isExecutorSessionReady() {
  return currentSocket?.readyState === WebSocket.OPEN;
}

export function createPendingGraphExecution(): Promise<GraphOutputs> {
  rejectPendingExecution(new Error('graph execution replaced by a newer request'));

  let resolve!: (value: GraphOutputs) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<GraphOutputs>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  pendingExecution = { promise, resolve, reject };
  return promise;
}

export function resolvePendingGraphExecution(outputs: GraphOutputs) {
  pendingExecution?.resolve(outputs);
  pendingExecution = null;
}

export function rejectPendingGraphExecution(reason: unknown) {
  rejectPendingExecution(reason);
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
      console.error(`Unknown datasets message type: ${type}`);
    });
}
