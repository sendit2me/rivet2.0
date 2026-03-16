import { useLatest } from 'ahooks';
import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { match } from 'ts-pattern';
import type {
  IncomingMessage,
  OutgoingMessageMap,
  DatasetRequestPayload,
  DatasetRequestMap,
  OutgoingMessage,
  ProcessEventMessage,
  ProcessEventMessageMap,
} from '@ironclad/rivet-core';
import type { Setter } from 'jotai';
import type { RemoteDebuggerConfig, RemoteDebuggerConnectionState } from '../state/execution.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { useDatasetProvider } from '../providers/ProvidersContext';

type DebuggerMessageHandler = <K extends keyof ProcessEventMessageMap>(message: K, data: ProcessEventMessageMap[K]) => void;
type LifecycleCallback = () => void;

let currentDebuggerMessageHandler: DebuggerMessageHandler | null = null;

function isProcessEventMessageName(message: IncomingMessage['message']): message is keyof ProcessEventMessageMap {
  return !message.startsWith('datasets:') && message !== 'graph-upload-allowed';
}

function isProcessEventMessage(message: IncomingMessage): message is ProcessEventMessage {
  return isProcessEventMessageName(message.message);
}

export function setCurrentDebuggerMessageHandler(handler: DebuggerMessageHandler) {
  currentDebuggerMessageHandler = handler;
}

let currentSocket: WebSocket | null = null;
let currentDatasetProvider: ReturnType<typeof useDatasetProvider> | null = null;
let reconnectingTimeout: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 0;
let manuallyDisconnecting = false;
let currentUrl = '';
const onConnectCallbacks = new Set<LifecycleCallback>();
const onDisconnectCallbacks = new Set<LifecycleCallback>();
let setDebuggerConfigState: Setter<[RemoteDebuggerConfig | ((prev: RemoteDebuggerConfig) => RemoteDebuggerConfig)], void> | null = null;
let setConnectionStateValue:
  | Setter<
      [RemoteDebuggerConnectionState | ((prev: RemoteDebuggerConnectionState) => RemoteDebuggerConnectionState)],
      void
    >
  | null = null;

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

function setDebuggerConfig(updater: RemoteDebuggerConfig | ((prev: RemoteDebuggerConfig) => RemoteDebuggerConfig)) {
  setDebuggerConfigState?.(updater);
}

function setConnectionState(
  updater:
    | RemoteDebuggerConnectionState
    | ((prev: RemoteDebuggerConnectionState) => RemoteDebuggerConnectionState),
) {
  setConnectionStateValue?.(updater);
}

async function connectShared(url: string) {
  if (!url) {
    url = 'ws://localhost:21888';
  }

  currentUrl = url;
  manuallyDisconnecting = false;
  retryDelay = 0;

  if (reconnectingTimeout) {
    clearTimeout(reconnectingTimeout);
    reconnectingTimeout = undefined;
  }

  if (currentSocket) {
    const sameUrl = currentSocket.url === url;
    if (sameUrl && (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)) {
      setDebuggerConfig((prev) => ({
        ...prev,
        url,
        isInternalExecutor: url === 'ws://localhost:21889/internal',
      }));
      setConnectionState((prev) => ({ ...prev, reconnecting: false }));
      return;
    }

    if (currentSocket.readyState !== WebSocket.CLOSED) {
      currentSocket.close();
    }
  }

  const socket = new WebSocket(url);
  currentSocket = socket;

  setDebuggerConfig((prev) => ({
    ...prev,
    url,
    isInternalExecutor: url === 'ws://localhost:21889/internal',
  }));
  setConnectionState({ started: true, reconnecting: false });

  socket.onopen = () => {
    retryDelay = 0;
    setConnectionState((prev) => ({ ...prev, reconnecting: false }));
    notifyConnect();
  };

  socket.onclose = () => {
    if (currentSocket === socket) {
      currentSocket = null;
    }

    if (manuallyDisconnecting) {
      setConnectionState({ started: false, reconnecting: false });
      setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: false }));
      notifyDisconnect();
      return;
    }

    setConnectionState({ started: false, reconnecting: true });

    const nextRetryDelay = Math.min(2000, (retryDelay + 100) * 1.5);
    retryDelay = nextRetryDelay;

    reconnectingTimeout = setTimeout(() => {
      void connectShared(currentUrl);
    }, nextRetryDelay);
  };

  socket.onmessage = (event) => {
    const incoming = JSON.parse(event.data) as IncomingMessage;

    if (incoming.message === 'graph-upload-allowed') {
      console.log('Graph uploading is allowed.');
      setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: true }));
    } else if (incoming.message.startsWith('datasets:')) {
      if (currentDatasetProvider) {
        void handleDatasetsMessage(
          currentDatasetProvider,
          incoming.message as keyof DatasetRequestMap,
          incoming.data as DatasetRequestPayload<unknown>,
          socket,
        );
      }
    } else if (isProcessEventMessage(incoming)) {
      currentDebuggerMessageHandler?.(incoming.message, incoming.data);
    }
  };
}

function disconnectShared() {
  setConnectionState({ started: false, reconnecting: false });
  manuallyDisconnecting = true;
  retryDelay = 0;

  if (reconnectingTimeout) {
    clearTimeout(reconnectingTimeout);
    reconnectingTimeout = undefined;
  }

  if (currentSocket) {
    currentSocket.close();
    currentSocket = null;
    notifyDisconnect();
  }
}

export function getDebuggerSocket(): WebSocket | null {
  return currentSocket;
}

export function useRemoteDebugger(options: { onConnect?: () => void; onDisconnect?: () => void } = {}) {
  const datasetProvider = useDatasetProvider();
  const [debuggerConfig, setDebuggerConfig] = useAtom(remoteDebuggerConfigState);
  const [connectionState, setConnectionState] = useAtom(remoteDebuggerConnectionState);
  const onConnectLatest = useLatest(options.onConnect ?? (() => {}));
  const onDisconnectLatest = useLatest(options.onDisconnect ?? (() => {}));

  currentDatasetProvider = datasetProvider;
  setDebuggerConfigState = setDebuggerConfig;
  setConnectionStateValue = setConnectionState;

  useEffect(() => {
    const onConnect = () => onConnectLatest.current?.();
    const onDisconnect = () => onDisconnectLatest.current?.();

    onConnectCallbacks.add(onConnect);
    onDisconnectCallbacks.add(onDisconnect);

    return () => {
      onConnectCallbacks.delete(onConnect);
      onDisconnectCallbacks.delete(onDisconnect);
    };
  }, [onConnectLatest, onDisconnectLatest]);

  return {
    remoteDebuggerState: {
      ...debuggerConfig,
      ...connectionState,
      socket: currentSocket,
    },
    connect: (url: string) => {
      void connectShared(url);
    },
    disconnect: () => {
      disconnectShared();
    },
    send<T extends keyof OutgoingMessageMap>(type: T, data: OutgoingMessageMap[T]) {
      if (currentSocket?.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({ type, data }));
      }
    },
    sendRaw(data: string) {
      if (currentSocket?.readyState === WebSocket.OPEN) {
        currentSocket.send(data);
      }
    },
  };
}

function sendDatasetResponse(socket: WebSocket, requestId: string, payload: unknown) {
  const msg: OutgoingMessage = { type: 'datasets:response', data: { requestId, payload } };
  socket.send(JSON.stringify(msg));
}

async function handleDatasetsMessage(
  datasetProvider: ReturnType<typeof useDatasetProvider>,
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
