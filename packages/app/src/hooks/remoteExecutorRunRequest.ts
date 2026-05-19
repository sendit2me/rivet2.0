import type {
  GraphOutputs,
  OutgoingMessageMap,
  ProcessEventMessageMap,
  RemoteRunRequestId,
  RootRunId,
  ProjectId,
} from '@valerypopoff/rivet2-core';
import type { ExecutorSessionRuntime } from './executorSession.js';

export type ActiveRemoteRunRequestRef = {
  current: RemoteRunRequestId | null;
};

export type RemoteRunPayloadWithoutRequestId = Omit<OutgoingMessageMap['run'], 'requestId'>;

export type RemoteRunRequestSender = (payload: OutgoingMessageMap['run']) => boolean;

export type UnscopedRemoteExecutionRoutingState = {
  acceptedRootRunIds: Set<RootRunId>;
  completedRootRunDecisions: boolean[];
  ignoredRootRunIds: Set<RootRunId>;
  lastRunAccepted: boolean | undefined;
};

export type ActiveRemoteRunRequestResult =
  | {
      requestId: RemoteRunRequestId;
      type: 'sent';
    }
  | {
      requestId: RemoteRunRequestId;
      type: 'send-failed';
    };

export function createUnscopedRemoteExecutionRoutingState(): UnscopedRemoteExecutionRoutingState {
  return {
    acceptedRootRunIds: new Set(),
    completedRootRunDecisions: [],
    ignoredRootRunIds: new Set(),
    lastRunAccepted: undefined,
  };
}

export function resetUnscopedRemoteExecutionRoutingState(state: UnscopedRemoteExecutionRoutingState): void {
  state.acceptedRootRunIds.clear();
  state.completedRootRunDecisions = [];
  state.ignoredRootRunIds.clear();
  state.lastRunAccepted = undefined;
}

export function shouldDispatchRemoteExecutionEvent<K extends keyof ProcessEventMessageMap>(options: {
  activeRequestId: RemoteRunRequestId | null;
  currentProjectId: ProjectId | undefined;
  data: ProcessEventMessageMap[K];
  message: K;
  requestId: RemoteRunRequestId | undefined;
  unscopedRoutingState: UnscopedRemoteExecutionRoutingState;
}): boolean {
  const { activeRequestId, currentProjectId, data, message, requestId, unscopedRoutingState } = options;

  if (requestId != null) {
    return requestId === activeRequestId;
  }

  if (message === 'start') {
    const accepted = shouldAcceptUnscopedStartEvent(data as ProcessEventMessageMap['start'], currentProjectId);
    rememberUnscopedRunDecision(unscopedRoutingState, data as ProcessEventMessageMap['start'], accepted);
    return accepted;
  }

  const rootRunId = getUnscopedEventRootRunId(data);
  if (rootRunId != null) {
    if (unscopedRoutingState.acceptedRootRunIds.has(rootRunId)) {
      rememberCompletedUnscopedRootRun(unscopedRoutingState, message, data, true);
      return true;
    }

    if (unscopedRoutingState.ignoredRootRunIds.has(rootRunId)) {
      rememberCompletedUnscopedRootRun(unscopedRoutingState, message, data, false);
      return false;
    }
  }

  const terminalDecision = consumeCompletedUnscopedTerminalDecision(unscopedRoutingState, message);
  if (terminalDecision != null) {
    return terminalDecision;
  }

  return unscopedRoutingState.lastRunAccepted ?? true;
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

function shouldAcceptUnscopedStartEvent(
  data: ProcessEventMessageMap['start'],
  currentProjectId: ProjectId | undefined,
): boolean {
  const eventProjectId = data.project?.metadata?.id;

  if (!eventProjectId || !currentProjectId) {
    return true;
  }

  return eventProjectId === currentProjectId;
}

function rememberUnscopedRunDecision(
  state: UnscopedRemoteExecutionRoutingState,
  data: ProcessEventMessageMap['start'],
  accepted: boolean,
): void {
  const rootRunId = data.execution?.rootRunId;
  if (rootRunId) {
    const targetSet = accepted ? state.acceptedRootRunIds : state.ignoredRootRunIds;
    const otherSet = accepted ? state.ignoredRootRunIds : state.acceptedRootRunIds;
    targetSet.add(rootRunId);
    otherSet.delete(rootRunId);
  }

  state.lastRunAccepted = accepted;
}

function getUnscopedEventRootRunId(data: unknown): RootRunId | undefined {
  if (!hasExecutionMetadata(data)) {
    return undefined;
  }

  return data.execution.rootRunId;
}

function rememberCompletedUnscopedRootRun<K extends keyof ProcessEventMessageMap>(
  state: UnscopedRemoteExecutionRoutingState,
  message: K,
  data: ProcessEventMessageMap[K],
  accepted: boolean,
): void {
  if (message !== 'graphFinish' && message !== 'graphAbort' && message !== 'graphError') {
    return;
  }

  if (!hasExecutionMetadata(data) || data.execution.parentGraphRunId != null) {
    return;
  }

  state.acceptedRootRunIds.delete(data.execution.rootRunId);
  state.ignoredRootRunIds.delete(data.execution.rootRunId);
  state.completedRootRunDecisions.push(accepted);

  if (state.completedRootRunDecisions.length > 32) {
    state.completedRootRunDecisions.splice(0, state.completedRootRunDecisions.length - 32);
  }
}

function consumeCompletedUnscopedTerminalDecision<K extends keyof ProcessEventMessageMap>(
  state: UnscopedRemoteExecutionRoutingState,
  message: K,
): boolean | undefined {
  if (message !== 'done' && message !== 'abort' && message !== 'error') {
    return undefined;
  }

  return state.completedRootRunDecisions.shift();
}

function hasExecutionMetadata(data: unknown): data is {
  execution: {
    parentGraphRunId?: unknown;
    rootRunId: RootRunId;
  };
} {
  if (typeof data !== 'object' || data == null) {
    return false;
  }

  const execution = (data as { execution?: unknown }).execution;
  if (typeof execution !== 'object' || execution == null) {
    return false;
  }

  return typeof (execution as { rootRunId?: unknown }).rootRunId === 'string';
}
