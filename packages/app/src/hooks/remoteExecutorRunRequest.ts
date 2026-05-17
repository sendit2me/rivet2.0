import type { GraphOutputs, OutgoingMessageMap, RemoteRunRequestId } from '@valerypopoff/rivet2-core';
import type { ExecutorSessionRuntime } from './executorSession.js';

export type ActiveRemoteRunRequestRef = {
  current: RemoteRunRequestId | null;
};

export type RemoteRunPayloadWithoutRequestId = Omit<OutgoingMessageMap['run'], 'requestId'>;

export type RemoteRunRequestSender = (payload: OutgoingMessageMap['run']) => boolean;

export type ActiveRemoteRunRequestResult =
  | {
      requestId: RemoteRunRequestId;
      type: 'sent';
    }
  | {
      requestId: RemoteRunRequestId;
      type: 'send-failed';
    };

export function shouldDispatchRemoteExecutionEvent(
  requestId: RemoteRunRequestId | undefined,
  activeRequestId: RemoteRunRequestId | null,
): boolean {
  return requestId == null || requestId === activeRequestId;
}

export function clearActiveRemoteRunRequest(activeRequestIdRef: ActiveRemoteRunRequestRef): void {
  activeRequestIdRef.current = null;
}

export function clearActiveRemoteRunRequestIfMatches(
  activeRequestIdRef: ActiveRemoteRunRequestRef,
  requestId: RemoteRunRequestId | undefined,
): void {
  if (requestId === activeRequestIdRef.current) {
    activeRequestIdRef.current = null;
  }
}

export function startActiveRemoteGraphRunRequest(options: {
  activeRequestIdRef: ActiveRemoteRunRequestRef;
  createRequestId: () => RemoteRunRequestId;
  payload: RemoteRunPayloadWithoutRequestId;
  sendRun: RemoteRunRequestSender;
}): ActiveRemoteRunRequestResult {
  const { activeRequestIdRef, createRequestId, payload, sendRun } = options;
  const requestId = createRequestId();
  activeRequestIdRef.current = requestId;

  const runSent = sendRun({
    ...payload,
    requestId,
  });

  if (!runSent) {
    activeRequestIdRef.current = null;
    return {
      requestId,
      type: 'send-failed',
    };
  }

  return {
    requestId,
    type: 'sent',
  };
}

export function sendPendingRemoteGraphRunRequest(options: {
  disconnectErrorMessage: string;
  executorSession: Pick<ExecutorSessionRuntime, 'createPendingGraphExecution' | 'rejectPendingGraphExecution'>;
  payload: RemoteRunPayloadWithoutRequestId;
  sendRun: RemoteRunRequestSender;
}): Promise<GraphOutputs> {
  const { disconnectErrorMessage, executorSession, payload, sendRun } = options;
  const { requestId, promise } = executorSession.createPendingGraphExecution();

  const runSent = sendRun({
    ...payload,
    requestId,
  });

  if (!runSent) {
    const error = new Error(disconnectErrorMessage);
    executorSession.rejectPendingGraphExecution(requestId, error);
    return promise;
  }

  return promise;
}
