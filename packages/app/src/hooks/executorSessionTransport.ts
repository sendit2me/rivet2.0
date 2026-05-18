import type {
  DatasetRequestMap,
  DatasetRequestPayload,
  IncomingMessage,
  OutgoingMessage,
  OutgoingMessageMap,
  ProcessEventMessage,
} from '@valerypopoff/rivet2-core';
import { logRuntimeDebug } from '@valerypopoff/rivet2-core';
import { handleError } from '../utils/errorHandling.js';
import type { ExecutorSessionTarget } from './executorSessionTarget.js';

export type ExecutorSessionIncomingTransportMessage =
  | {
      kind: 'upload-allowed';
    }
  | {
      data: DatasetRequestPayload<unknown>;
      kind: 'dataset-request';
      message: keyof DatasetRequestMap;
    }
  | {
      incoming: ProcessEventMessage;
      kind: 'process-event';
    };

export function serializeExecutorSessionMessage<T extends keyof OutgoingMessageMap>(
  type: T,
  data: OutgoingMessageMap[T],
): string {
  return JSON.stringify({ data, type } as OutgoingMessage);
}

export function parseExecutorSessionIncomingMessage(options: {
  rawMessage: string;
  socketUrl: string;
  target: ExecutorSessionTarget;
}): ExecutorSessionIncomingTransportMessage | undefined {
  const { rawMessage, socketUrl, target } = options;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage);
  } catch (error) {
    handleError(error, 'Failed to parse executor message', {
      metadata: {
        rawMessage,
        socketUrl,
        target: target.type,
      },
      toastError: false,
    });
    return undefined;
  }

  if (!isExecutorIncomingMessage(parsed)) {
    handleError(new Error('Malformed executor message envelope.'), 'Failed to parse executor message', {
      metadata: {
        rawMessage,
        socketUrl,
        target: target.type,
      },
      toastError: false,
    });
    return undefined;
  }

  if (parsed.message === 'graph-upload-allowed') {
    return {
      kind: 'upload-allowed',
    };
  }

  if (isDatasetRequestMessageName(parsed.message)) {
    return {
      data: parsed.data as DatasetRequestPayload<unknown>,
      kind: 'dataset-request',
      message: parsed.message as keyof DatasetRequestMap,
    };
  }

  return {
    incoming: parsed as ProcessEventMessage,
    kind: 'process-event',
  };
}

export function safeSendExecutorSocket(
  socket: WebSocket | null,
  data: string,
  context: string,
  metadata: Record<string, unknown>,
): boolean {
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

function isDatasetRequestMessageName(message: IncomingMessage['message']): message is keyof DatasetRequestMap {
  return message.startsWith('datasets:');
}

function isExecutorIncomingMessage(value: unknown): value is IncomingMessage {
  return typeof value === 'object' && value != null && 'message' in value && typeof value.message === 'string';
}
