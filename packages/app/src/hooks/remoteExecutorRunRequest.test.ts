import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ChartNode,
  GraphId,
  GraphOutputs,
  GraphRunId,
  NodeId,
  OutgoingMessageMap,
  ProcessEventMessageMap,
  ProcessId,
  ProjectId,
  RemoteRunRequestId,
  RootRunId,
} from '@valerypopoff/rivet2-core';
import {
  clearActiveRemoteRunRequest,
  clearActiveRemoteRunRequestIfMatches,
  createUnscopedRemoteExecutionRoutingState,
  resetUnscopedRemoteExecutionRoutingState,
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

function makeStartEvent(projectId: string, rootRunId = 'root-1'): ProcessEventMessageMap['start'] {
  return {
    contextValues: {},
    execution: {
      graphId: 'graph-1' as GraphId,
      graphRunId: 'graph-run-1' as GraphRunId,
      rootRunId: rootRunId as RootRunId,
    },
    inputs: {},
    project: {
      metadata: {
        description: '',
        id: projectId as ProjectId,
        title: 'Project',
      },
      graphs: {},
      plugins: [],
    },
    startGraph: {
      metadata: {
        id: 'graph-1' as GraphId,
        name: 'Graph',
      },
      nodes: [],
      connections: [],
    },
  };
}

function makeNodeFinishEvent(rootRunId = 'root-1'): ProcessEventMessageMap['nodeFinish'] {
  return {
    execution: {
      graphId: 'graph-1' as GraphId,
      graphRunId: 'graph-run-1' as GraphRunId,
      rootRunId: rootRunId as RootRunId,
    },
    node: {
      id: 'node-1' as NodeId,
      type: 'text',
    } as ChartNode,
    outputs: {},
    processId: 'process-1' as ProcessId,
  };
}

function makeGraphFinishEvent(rootRunId = 'root-1'): ProcessEventMessageMap['graphFinish'] {
  return {
    execution: {
      graphId: 'graph-1' as GraphId,
      graphRunId: 'graph-run-1' as GraphRunId,
      rootRunId: rootRunId as RootRunId,
    },
    graph: {
      metadata: {
        id: 'graph-1' as GraphId,
        name: 'Graph',
      },
      nodes: [],
      connections: [],
    },
    outputs: {},
  };
}

test('shouldDispatchRemoteExecutionEvent accepts legacy unscoped events and the active request only', () => {
  const unscopedRoutingState = createUnscopedRemoteExecutionRoutingState();

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: 'request-1' as RemoteRunRequestId,
      currentProjectId: 'project-1' as ProjectId,
      data: 'trace',
      message: 'trace',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: 'request-1' as RemoteRunRequestId,
      currentProjectId: 'project-1' as ProjectId,
      data: 'trace',
      message: 'trace',
      requestId: 'request-1' as RemoteRunRequestId,
      unscopedRoutingState,
    }),
    true,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: 'request-1' as RemoteRunRequestId,
      currentProjectId: 'project-1' as ProjectId,
      data: 'trace',
      message: 'trace',
      requestId: 'request-2' as RemoteRunRequestId,
      unscopedRoutingState,
    }),
    false,
  );
});

test('shouldDispatchRemoteExecutionEvent ignores unscoped runs for another project', () => {
  const unscopedRoutingState = createUnscopedRemoteExecutionRoutingState();

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-2'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    false,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeNodeFinishEvent(),
      message: 'nodeFinish',
      requestId: undefined,
      unscopedRoutingState,
    }),
    false,
  );
});

test('shouldDispatchRemoteExecutionEvent accepts unscoped runs for the current project', () => {
  const unscopedRoutingState = createUnscopedRemoteExecutionRoutingState();

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-1'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeNodeFinishEvent(),
      message: 'nodeFinish',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );
});

test('unscoped remote execution routing state can be reset when the active project changes', () => {
  const unscopedRoutingState = createUnscopedRemoteExecutionRoutingState();

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-2'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    false,
  );

  resetUnscopedRemoteExecutionRoutingState(unscopedRoutingState);

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-2' as ProjectId,
      data: makeStartEvent('project-2'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );
});

test('shouldDispatchRemoteExecutionEvent forgets unscoped root runs after root graph completion', () => {
  const unscopedRoutingState = createUnscopedRemoteExecutionRoutingState();

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-1'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );

  assert.equal(unscopedRoutingState.acceptedRootRunIds.size, 1);

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeGraphFinishEvent(),
      message: 'graphFinish',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );

  assert.equal(unscopedRoutingState.acceptedRootRunIds.size, 0);
});

test('shouldDispatchRemoteExecutionEvent keeps accepted terminal events after an ignored run starts', () => {
  const unscopedRoutingState = createUnscopedRemoteExecutionRoutingState();

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-1', 'root-accepted'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-2', 'root-ignored'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    false,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeGraphFinishEvent('root-accepted'),
      message: 'graphFinish',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: { results: {} },
      message: 'done',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );
});

test('shouldDispatchRemoteExecutionEvent keeps ignored terminal events ignored after an accepted run starts', () => {
  const unscopedRoutingState = createUnscopedRemoteExecutionRoutingState();

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-2', 'root-ignored'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    false,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeStartEvent('project-1', 'root-accepted'),
      message: 'start',
      requestId: undefined,
      unscopedRoutingState,
    }),
    true,
  );
  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: makeGraphFinishEvent('root-ignored'),
      message: 'graphFinish',
      requestId: undefined,
      unscopedRoutingState,
    }),
    false,
  );

  assert.equal(
    shouldDispatchRemoteExecutionEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      data: { results: {} },
      message: 'done',
      requestId: undefined,
      unscopedRoutingState,
    }),
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
