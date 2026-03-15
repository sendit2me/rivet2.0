import { useLatest } from 'ahooks';
import { useAtom } from 'jotai';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { useRef } from 'react';
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
import { useDatasetProvider } from '../providers/ProvidersContext';

type DebuggerMessageHandler = <K extends keyof ProcessEventMessageMap>(message: K, data: ProcessEventMessageMap[K]) => void;

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

// Module-level WebSocket reference (non-serializable, not stored in Jotai)
let currentSocket: WebSocket | null = null;

export function getDebuggerSocket(): WebSocket | null {
  return currentSocket;
}

// Hacky but whatev, shared between all useRemoteDebugger hooks
let manuallyDisconnecting = false;

export function useRemoteDebugger(options: { onConnect?: () => void; onDisconnect?: () => void } = {}) {
  const datasetProvider = useDatasetProvider();
  const [debuggerConfig, setDebuggerConfig] = useAtom(remoteDebuggerConfigState);
  const [connectionState, setConnectionState] = useAtom(remoteDebuggerConnectionState);
  const onConnectLatest = useLatest(options.onConnect ?? (() => {}));
  const onDisconnectLatest = useLatest(options.onDisconnect ?? (() => {}));

  const connectRef = useRef<((url: string) => void) | undefined>();
  const reconnectingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>();
  const retryDelayRef = useRef(0);

  connectRef.current = (url: string) => {
    if (!url) {
      url = `ws://localhost:21888`;
    }

    if (reconnectingTimeout.current) {
      clearTimeout(reconnectingTimeout.current);
      reconnectingTimeout.current = undefined;
    }

    // Close existing socket before creating a new one
    if (currentSocket && currentSocket.readyState !== WebSocket.CLOSED) {
      currentSocket.close();
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
      retryDelayRef.current = 0;
      setConnectionState((prev) => ({ ...prev, reconnecting: false }));
      onConnectLatest.current?.();
    };

    socket.onclose = () => {
      if (currentSocket === socket) {
        currentSocket = null;
      }

      if (manuallyDisconnecting) {
        setConnectionState({ started: false, reconnecting: false });
        setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: false }));
        onDisconnectLatest.current?.();
      } else {
        setConnectionState({ started: false, reconnecting: true });

        const nextRetryDelay = Math.min(2000, (retryDelayRef.current + 100) * 1.5);
        retryDelayRef.current = nextRetryDelay;

        reconnectingTimeout.current = setTimeout(() => {
          connectRef.current?.(url);
        }, nextRetryDelay);
      }
    };

    socket.onmessage = (event) => {
      const incoming = JSON.parse(event.data) as IncomingMessage;

      if (incoming.message === 'graph-upload-allowed') {
        console.log('Graph uploading is allowed.');
        setDebuggerConfig((prev) => ({ ...prev, remoteUploadAllowed: true }));
      } else if (incoming.message.startsWith('datasets:')) {
        handleDatasetsMessage(
          datasetProvider,
          incoming.message as keyof DatasetRequestMap,
          incoming.data as DatasetRequestPayload<unknown>,
          socket,
        );
      } else if (isProcessEventMessage(incoming)) {
        currentDebuggerMessageHandler?.(incoming.message, incoming.data);
      }
    };
  };

  return {
    remoteDebuggerState: {
      ...debuggerConfig,
      ...connectionState,
      socket: currentSocket,
    },
    connect: (url: string) => {
      manuallyDisconnecting = false;
      retryDelayRef.current = 0;
      connectRef.current?.(url);
    },
    disconnect: () => {
      setConnectionState({ started: false, reconnecting: false });
      manuallyDisconnecting = true;
      retryDelayRef.current = 0;

      if (reconnectingTimeout.current) {
        clearTimeout(reconnectingTimeout.current);
        reconnectingTimeout.current = undefined;
      }

      if (currentSocket) {
        currentSocket.close();
        currentSocket = null;
        onDisconnectLatest.current?.();
      }
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
      const data = await datasetProvider.getDatasetData(payload.id);
      sendDatasetResponse(socket, requestId, data);
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
