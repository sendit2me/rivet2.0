import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  GraphId,
  GraphRunId,
  NodeId,
  PortId,
  ProcessEventMessageMap,
  ProcessId,
  ProjectId,
  RootRunId,
} from '@valerypopoff/rivet2-core';
import {
  createRemoteDebuggerDiagnostics,
  summarizeRemoteDebuggerEvent,
  summarizeRemoteDebuggerRoutingState,
} from './remoteDebuggerDiagnostics.js';
import { createUnscopedRemoteExecutionRoutingState } from './remoteExecutorRunRequest.js';

test('summarizeRemoteDebuggerEvent captures routing-relevant metadata without retaining payload values', () => {
  const event: ProcessEventMessageMap['nodeFinish'] = {
    execution: {
      graphId: 'graph-1' as GraphId,
      graphRunId: 'graph-run-1' as GraphRunId,
      parentGraphRunId: 'parent-run-1' as GraphRunId,
      rootRunId: 'root-1' as RootRunId,
    },
    node: {
      id: 'node-1' as NodeId,
      type: 'expression',
    } as ProcessEventMessageMap['nodeFinish']['node'],
    outputs: {
      ['output' as PortId]: {
        type: 'string',
        value: 'large values are intentionally not logged',
      },
    },
    processId: 'process-1' as ProcessId,
  };

  assert.deepEqual(summarizeRemoteDebuggerEvent('nodeFinish', event), {
    graphId: 'graph-1',
    graphRunId: 'graph-run-1',
    inputPorts: undefined,
    nodeId: 'node-1',
    nodeType: 'expression',
    outputPorts: ['output'],
    parentGraphRunId: 'parent-run-1',
    processId: 'process-1',
    projectId: undefined,
    rootRunId: 'root-1',
    splitIndex: undefined,
  });
});

test('summarizeRemoteDebuggerRoutingState snapshots mutable routing containers', () => {
  const state = createUnscopedRemoteExecutionRoutingState();
  state.acceptedRootRunIds.add('accepted-root' as RootRunId);
  state.ignoredRootRunIds.add('ignored-root' as RootRunId);
  state.completedRootRunDecisions.push({ accepted: true, rootRunId: 'completed-root' as RootRunId });
  state.recentlyCompletedRootRunDecisions.set('recent-root' as RootRunId, false);
  state.lastRunAccepted = true;

  const summary = summarizeRemoteDebuggerRoutingState(state);

  state.acceptedRootRunIds.clear();
  state.completedRootRunDecisions[0]!.accepted = false;

  assert.deepEqual(summary, {
    acceptedRootRunIds: ['accepted-root'],
    completedRootRunDecisions: [{ accepted: true, rootRunId: 'completed-root' }],
    ignoredRootRunIds: ['ignored-root'],
    lastRunAccepted: true,
    recentlyCompletedRootRunDecisions: [{ accepted: false, rootRunId: 'recent-root' }],
  });
});

test('createRemoteDebuggerDiagnostics dumps a bounded trace when terminal reconciliation fires', () => {
  const loggedTables: unknown[][] = [];
  const loggedWarningMessages: string[] = [];
  const loggedWarnings: unknown[] = [];
  const diagnostics = createRemoteDebuggerDiagnostics({
    console: {
      groupCollapsed: () => undefined,
      groupEnd: () => undefined,
      log: () => undefined,
      table: (rows) => loggedTables.push(rows as unknown[]),
      warn: (message, metadata) => {
        loggedWarningMessages.push(String(message));
        loggedWarnings.push(metadata);
      },
    },
    maxTraceEntries: 2,
    now: () => new Date('2026-05-23T00:00:00.000Z'),
  });
  const routing = summarizeRemoteDebuggerRoutingState(createUnscopedRemoteExecutionRoutingState());

  for (const index of [1, 2, 3]) {
    diagnostics.recordEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      decision: {
        reason: 'active-root-accepted',
        rootRunId: `root-${index}` as RootRunId,
        shouldDispatch: true,
      },
      event: {
        graphRunId: `graph-run-${index}` as GraphRunId,
        nodeId: 'node-1' as NodeId,
        nodeType: 'expression',
        outputPorts: index === 3 ? ['output'] : undefined,
        processId: 'process-1' as ProcessId,
        rootRunId: `root-${index}` as RootRunId,
      },
      message: index === 3 ? 'nodeFinish' : 'nodeStart',
      requestId: undefined,
      routingAfter: routing,
      routingBefore: routing,
      session: {
        status: 'connected',
        targetType: 'external-debugger',
      },
    });
  }

  diagnostics.logMissingTerminalEvent({
    nodeId: 'node-1' as NodeId,
    processId: 'process-1' as ProcessId,
    rootRunId: 'root-3' as RootRunId,
  });

  assert.match(loggedWarningMessages[0]!, /hints: A terminal node event was observed and dispatched/);
  assert.match(loggedWarningMessages[0]!, /exact lifecycle \(1\):/);
  assert.match(loggedWarningMessages[0]!, /exact process trace \(1\):/);
  assert.match(loggedWarningMessages[0]!, /root-run trace tail \(1\):/);
  assert.match(loggedWarningMessages[0]!, /#3 nodeFinish dispatch=true/);

  const warning = loggedWarnings[0] as {
    diagnosisHints: string[];
    event: { nodeId: string; processId: string; rootRunId: string };
    lifecycleSummaries: unknown[];
    matchingProcessTrace: unknown[];
    processLifecycleSummaryLimit: number;
    recentTraceEntryCount: number;
    rootRunTrace: unknown[];
    triggerStack: string;
  };
  assert.deepEqual(warning.diagnosisHints, [
    'A terminal node event was observed and dispatched; inspect state merge/display handling next.',
  ]);
  assert.deepEqual(warning.event, {
    nodeId: 'node-1',
    processId: 'process-1',
    rootRunId: 'root-3',
  });
  assert.equal(warning.lifecycleSummaries.length, 1);
  assert.equal(warning.matchingProcessTrace.length, 1);
  assert.equal(warning.processLifecycleSummaryLimit, 5000);
  assert.equal(warning.recentTraceEntryCount, 2);
  assert.equal(warning.rootRunTrace.length, 1);
  assert.match(warning.triggerStack, /Missing node terminal event/);
  assert.equal(loggedTables.length, 5);
  assert.deepEqual(loggedTables[0], [
    {
      dispatchedTerminal: 'nodeFinish',
      firstSeenAt: '2026-05-23T00:00:00.000Z',
      graphRunId: 'graph-run-3',
      inputPorts: '',
      lastDecisionReason: 'active-root-accepted',
      lastSeenAt: '2026-05-23T00:00:00.000Z',
      lastSequence: 3,
      messages: 'nodeFinish',
      nodeId: 'node-1',
      nodeType: 'expression',
      outputPorts: 'output',
      parentGraphRunId: '',
      processId: 'process-1',
      receivedTerminal: 'nodeFinish',
      rootRunId: 'root-3',
    },
  ]);
  assert.deepEqual(
    loggedTables[4]!.map((row) => (row as { rootRunId: string }).rootRunId),
    ['root-2', 'root-3'],
  );
});

test('createRemoteDebuggerDiagnostics keeps process lifecycle summaries after trace eviction', () => {
  const loggedWarnings: unknown[] = [];
  const loggedTables: unknown[][] = [];
  const diagnostics = createRemoteDebuggerDiagnostics({
    console: {
      groupCollapsed: () => undefined,
      groupEnd: () => undefined,
      log: () => undefined,
      table: (rows) => loggedTables.push(rows as unknown[]),
      warn: (_message, metadata) => loggedWarnings.push(metadata),
    },
    maxTraceEntries: 1,
    now: () => new Date('2026-05-23T00:00:00.000Z'),
  });
  const routing = summarizeRemoteDebuggerRoutingState(createUnscopedRemoteExecutionRoutingState());

  diagnostics.recordEvent({
    activeRequestId: null,
    currentProjectId: 'project-1' as ProjectId,
    decision: {
      reason: 'active-root-accepted',
      rootRunId: 'root-1' as RootRunId,
      shouldDispatch: true,
    },
    event: {
      graphRunId: 'graph-run-1' as GraphRunId,
      nodeId: 'node-1' as NodeId,
      nodeType: 'expression',
      processId: 'process-1' as ProcessId,
      rootRunId: 'root-1' as RootRunId,
    },
    message: 'nodeStart',
    requestId: undefined,
    routingAfter: routing,
    routingBefore: routing,
    session: {
      status: 'connected',
      targetType: 'external-debugger',
    },
  });
  diagnostics.recordEvent({
    activeRequestId: null,
    currentProjectId: 'project-1' as ProjectId,
    decision: {
      reason: 'active-root-accepted',
      rootRunId: 'root-1' as RootRunId,
      shouldDispatch: true,
    },
    event: {
      rootRunId: 'root-1' as RootRunId,
    },
    message: 'done',
    requestId: undefined,
    routingAfter: routing,
    routingBefore: routing,
    session: {
      status: 'connected',
      targetType: 'external-debugger',
    },
  });

  diagnostics.logMissingTerminalEvent({
    graphRunId: 'graph-run-1' as GraphRunId,
    nodeId: 'node-1' as NodeId,
    processId: 'process-1' as ProcessId,
    rootRunId: 'root-1' as RootRunId,
  });

  const warning = loggedWarnings[0] as {
    diagnosisHints: string[];
    lifecycleSummaries: unknown[];
    matchingProcessTrace: unknown[];
    processLifecycleSummaryLimit: number;
  };
  assert.deepEqual(warning.diagnosisHints, [
    'No nodeFinish/nodeError/nodeExcluded was observed for this process in the app websocket stream.',
    'The recent bounded trace no longer contains this exact process; use the lifecycle summary first.',
  ]);
  assert.equal(warning.matchingProcessTrace.length, 0);
  assert.equal(warning.lifecycleSummaries.length, 1);
  assert.equal(warning.processLifecycleSummaryLimit, 5000);
  assert.deepEqual(loggedTables[0], [
    {
      dispatchedTerminal: '',
      firstSeenAt: '2026-05-23T00:00:00.000Z',
      graphRunId: 'graph-run-1',
      inputPorts: '',
      lastDecisionReason: 'active-root-accepted',
      lastSeenAt: '2026-05-23T00:00:00.000Z',
      lastSequence: 1,
      messages: 'nodeStart',
      nodeId: 'node-1',
      nodeType: 'expression',
      outputPorts: '',
      parentGraphRunId: '',
      processId: 'process-1',
      receivedTerminal: '',
      rootRunId: 'root-1',
    },
  ]);
});

test('createRemoteDebuggerDiagnostics caps lifecycle summaries and still reports retained matches', () => {
  const loggedWarnings: unknown[] = [];
  const loggedTables: unknown[][] = [];
  const diagnostics = createRemoteDebuggerDiagnostics({
    console: {
      groupCollapsed: () => undefined,
      groupEnd: () => undefined,
      log: () => undefined,
      table: (rows) => loggedTables.push(rows as unknown[]),
      warn: (_message, metadata) => loggedWarnings.push(metadata),
    },
    maxProcessLifecycleEntries: 1,
    now: () => new Date('2026-05-23T00:00:00.000Z'),
  });
  const routing = summarizeRemoteDebuggerRoutingState(createUnscopedRemoteExecutionRoutingState());

  for (const processId of ['old-process', 'kept-process']) {
    diagnostics.recordEvent({
      activeRequestId: null,
      currentProjectId: 'project-1' as ProjectId,
      decision: {
        reason: 'active-root-accepted',
        rootRunId: 'root-1' as RootRunId,
        shouldDispatch: true,
      },
      event: {
        graphRunId: 'graph-run-1' as GraphRunId,
        nodeId: 'node-1' as NodeId,
        processId: processId as ProcessId,
        rootRunId: 'root-1' as RootRunId,
      },
      message: 'nodeStart',
      requestId: undefined,
      routingAfter: routing,
      routingBefore: routing,
      session: {
        status: 'connected',
        targetType: 'external-debugger',
      },
    });
  }

  diagnostics.logMissingTerminalEvent({
    graphRunId: 'graph-run-1' as GraphRunId,
    nodeId: 'node-1' as NodeId,
    processId: 'kept-process' as ProcessId,
    rootRunId: 'root-1' as RootRunId,
  });

  assert.equal((loggedWarnings[0] as { lifecycleSummaries: unknown[] }).lifecycleSummaries.length, 1);
  assert.equal((loggedWarnings[0] as { processLifecycleSummaryLimit: number }).processLifecycleSummaryLimit, 1);
  assert.equal((loggedTables[0]![0] as { processId: string }).processId, 'kept-process');
});
