import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphId, GraphOutputs, OutgoingMessageMap, RemoteRunRequestId } from '@valerypopoff/rivet2-core';
import {
  clearActiveRemoteRunRequest,
  clearActiveRemoteRunRequestIfMatches,
  sendPendingRemoteGraphRunRequest,
  shouldDispatchRemoteExecutionEvent,
  startActiveRemoteGraphRunRequest,
  type ActiveRemoteRunRequestRef,
} from './remoteExecutorRunRequest.js';

function makeRunPayload(): Omit<OutgoingMessageMap['run'], 'requestId'> {
  return {
    contextValues: {},
    graphId: 'graph-1' as GraphId,
  };
}

test('shouldDispatchRemoteExecutionEvent accepts unscoped events and the active request only', () => {
  assert.equal(shouldDispatchRemoteExecutionEvent(undefined, 'request-1' as RemoteRunRequestId), true);
  assert.equal(
    shouldDispatchRemoteExecutionEvent('request-1' as RemoteRunRequestId, 'request-1' as RemoteRunRequestId),
    true,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent('request-2' as RemoteRunRequestId, 'request-1' as RemoteRunRequestId),
    false,
  );
});

test('active remote run request cleanup only clears matching completions', () => {
  const activeRequestIdRef: ActiveRemoteRunRequestRef = {
    current: 'request-1' as RemoteRunRequestId,
  };

  clearActiveRemoteRunRequestIfMatches(activeRequestIdRef, 'request-2' as RemoteRunRequestId);
  assert.equal(activeRequestIdRef.current, 'request-1');

  clearActiveRemoteRunRequestIfMatches(activeRequestIdRef, 'request-1' as RemoteRunRequestId);
  assert.equal(activeRequestIdRef.current, null);
});

test('active remote run request can be cleared on disconnect or replacement', () => {
  const activeRequestIdRef: ActiveRemoteRunRequestRef = {
    current: 'request-1' as RemoteRunRequestId,
  };

  clearActiveRemoteRunRequest(activeRequestIdRef);

  assert.equal(activeRequestIdRef.current, null);
});

test('startActiveRemoteGraphRunRequest registers the active request before sending', () => {
  const activeRequestIdRef: ActiveRemoteRunRequestRef = { current: null };
  const sentPayloads: OutgoingMessageMap['run'][] = [];

  const result = startActiveRemoteGraphRunRequest({
    activeRequestIdRef,
    createRequestId: () => 'request-1' as RemoteRunRequestId,
    payload: makeRunPayload(),
    sendRun: (payload) => {
      assert.equal(activeRequestIdRef.current, 'request-1');
      sentPayloads.push(payload);
      return true;
    },
  });

  assert.deepEqual(result, {
    requestId: 'request-1',
    type: 'sent',
  });
  assert.equal(activeRequestIdRef.current, 'request-1');
  assert.deepEqual(sentPayloads, [
    {
      contextValues: {},
      graphId: 'graph-1',
      requestId: 'request-1',
    },
  ]);
});

test('startActiveRemoteGraphRunRequest clears the active request after send failure', () => {
  const activeRequestIdRef: ActiveRemoteRunRequestRef = { current: null };

  const result = startActiveRemoteGraphRunRequest({
    activeRequestIdRef,
    createRequestId: () => 'request-1' as RemoteRunRequestId,
    payload: makeRunPayload(),
    sendRun: () => false,
  });

  assert.deepEqual(result, {
    requestId: 'request-1',
    type: 'send-failed',
  });
  assert.equal(activeRequestIdRef.current, null);
});

test('sendPendingRemoteGraphRunRequest returns pending results after a successful send', async () => {
  let resolvePending!: (value: GraphOutputs) => void;
  const pending = new Promise<GraphOutputs>((resolve) => {
    resolvePending = resolve;
  });
  const sentPayloads: OutgoingMessageMap['run'][] = [];

  const resultsPromise = sendPendingRemoteGraphRunRequest({
    disconnectErrorMessage: 'disconnected',
    executorSession: {
      createPendingGraphExecution: () => ({
        promise: pending,
        requestId: 'request-1' as RemoteRunRequestId,
      }),
      rejectPendingGraphExecution: () => {
        throw new Error('should not reject');
      },
    },
    payload: makeRunPayload(),
    sendRun: (payload) => {
      sentPayloads.push(payload);
      return true;
    },
  });

  resolvePending({ output: { type: 'string', value: 'ok' } } as GraphOutputs);

  assert.deepEqual(await resultsPromise, {
    output: { type: 'string', value: 'ok' },
  });
  assert.deepEqual(sentPayloads, [
    {
      contextValues: {},
      graphId: 'graph-1',
      requestId: 'request-1',
    },
  ]);
});

test('sendPendingRemoteGraphRunRequest rejects the pending run when send fails', async () => {
  let rejectPending!: (reason?: unknown) => void;
  const pending = new Promise<GraphOutputs>((_resolve, reject) => {
    rejectPending = reject;
  });

  await assert.rejects(
    sendPendingRemoteGraphRunRequest({
      disconnectErrorMessage: 'Remote executor disconnected before the test graph run could be sent.',
      executorSession: {
        createPendingGraphExecution: () => ({
          promise: pending,
          requestId: 'request-1' as RemoteRunRequestId,
        }),
        rejectPendingGraphExecution: (_requestId, reason) => {
          rejectPending(reason);
        },
      },
      payload: makeRunPayload(),
      sendRun: () => false,
    }),
    /test graph run could be sent/,
  );
});
