import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { GraphId, GraphRunId, NodeId, ProcessId, RootRunId } from '@ironclad/rivet-core';
import type { ProcessDataForNode } from '../dataFlow.js';
import {
  filterProcessDataForSelection,
  getActionBarExecutionState,
  getGraphRunsForView,
  getNodeExecutionClassFlags,
  getSelectedGraphRunId,
  getSelectedProcessData,
  getSelectedProcessRun,
  shouldUseRemoteExecutor,
} from './executionSelectors.js';

describe('executionSelectors', () => {
  test('selected process helpers resolve latest and indexed pages', () => {
    const processData = [
      { processId: 'p-1', data: { status: { type: 'ok' } } },
      { processId: 'p-2', data: { status: { type: 'running' } } },
    ] as ProcessDataForNode[];

    assert.equal(getSelectedProcessData(processData, 'latest')?.processId, 'p-2');
    assert.equal(getSelectedProcessData(processData, 0)?.processId, 'p-1');
    assert.equal(getSelectedProcessRun(processData, 'latest')?.status?.type, 'running');
  });

  test('graph-run-aware selection filters node history by selected graph run', () => {
    const processData = [
      { processId: 'p-root-a', graphRunId: 'graph-run-a' as GraphRunId, data: { status: { type: 'ok' } } },
      { processId: 'p-root-b', graphRunId: 'graph-run-b' as GraphRunId, data: { status: { type: 'running' } } },
      { processId: 'p-other', graphRunId: 'graph-run-c' as GraphRunId, data: { status: { type: 'error', error: 'boom' } } },
    ] as ProcessDataForNode[];

    const graphRuns = [
      { graphRunId: 'graph-run-a' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'g-1' as GraphId },
      { graphRunId: 'graph-run-b' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'g-1' as GraphId },
    ];

    const filtered = filterProcessDataForSelection({
      graphRuns,
      processData,
      selectedGraphRun: 'graph-run-a' as GraphRunId,
    });

    assert.deepEqual(filtered?.map((process) => process.processId), ['p-root-a']);
    assert.equal(
      getSelectedProcessData(processData, 'latest', {
        graphRuns,
        selectedGraphRun: 'graph-run-b' as GraphRunId,
      })?.processId,
      'p-root-b',
    );
  });

  test('graph run selection falls back to latest run when selection is unset or latest', () => {
    const graphRuns = [
      { graphRunId: 'graph-run-a' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'g-1' as GraphId },
      { graphRunId: 'graph-run-b' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'g-1' as GraphId },
    ];

    assert.equal(getSelectedGraphRunId(graphRuns, undefined), 'graph-run-b');
    assert.equal(getSelectedGraphRunId(graphRuns, 'latest'), 'graph-run-b');
    assert.equal(getSelectedGraphRunId(graphRuns, 'graph-run-a' as GraphRunId), 'graph-run-a');
  });

  test('graph-run-aware selection falls back to the latest run when the selected graph run is stale', () => {
    const processData = [
      { processId: 'p-root-a', graphRunId: 'graph-run-a' as GraphRunId, data: { status: { type: 'ok' } } },
      { processId: 'p-root-b', graphRunId: 'graph-run-b' as GraphRunId, data: { status: { type: 'running' } } },
    ] as ProcessDataForNode[];

    const graphRuns = [
      { graphRunId: 'graph-run-a' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'g-1' as GraphId },
      { graphRunId: 'graph-run-b' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'g-1' as GraphId },
    ];

    assert.deepEqual(
      filterProcessDataForSelection({
        graphRuns,
        processData,
        selectedGraphRun: 'missing-graph-run' as GraphRunId,
      })?.map((process) => process.processId),
      ['p-root-b'],
    );
  });

  test('node execution status helpers derive canonical class flags', () => {
    assert.deepEqual(getNodeExecutionClassFlags({ status: { type: 'error', error: 'boom' } }), {
      success: false,
      error: true,
      interrupted: false,
      running: false,
      'not-ran': false,
    });
    assert.deepEqual(getNodeExecutionClassFlags({ status: { type: 'notRan', reason: 'skip' } }), {
      success: false,
      error: false,
      interrupted: false,
      running: false,
      'not-ran': true,
    });
  });

  test('action bar execution state centralizes run/debugger visibility decisions', () => {
    const session = {
      status: 'reconnecting',
      started: false,
      reconnecting: true,
      socket: null,
      url: 'ws://localhost:21888',
      remoteUploadAllowed: false,
      isInternalExecutor: false,
    } as const;

    assert.deepEqual(
      getActionBarExecutionState({
        graphPaused: false,
        graphRunning: false,
        selectedExecutor: 'nodejs',
        session,
      }),
      {
        canRun: false,
        graphPaused: false,
        graphRunning: false,
        isActuallyRemoteDebugging: true,
        showRemoteDebuggerBanner: true,
      },
    );
  });

  test('getGraphRunsForView finds subgraph runs when navigating via root context', () => {
    const graphRunHistoryByView = {
      'root:main-graph': [
        { graphRunId: 'root-run' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'main-graph' as GraphId, startedAt: 1 },
      ],
      'subgraph:main-graph:node-1:sub-graph': [
        { graphRunId: 'sub-run-a' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'sub-graph' as GraphId, executor: { parentGraphId: 'main-graph' as GraphId, nodeId: 'node-1' as NodeId, processId: 'p-1' as ProcessId }, startedAt: 2 },
        { graphRunId: 'sub-run-b' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'sub-graph' as GraphId, executor: { parentGraphId: 'main-graph' as GraphId, nodeId: 'node-1' as NodeId, processId: 'p-1' as ProcessId }, startedAt: 3 },
      ],
    };

    // Navigating to the subgraph via sidebar creates a root context
    const rootViewOfSubgraph = { key: 'root:sub-graph', graphId: 'sub-graph' as GraphId };
    const runs = getGraphRunsForView({ currentGraphView: rootViewOfSubgraph, graphRunHistoryByView });

    assert.equal(runs.length, 2);
    assert.equal(runs[0]!.graphRunId, 'sub-run-a');
    assert.equal(runs[1]!.graphRunId, 'sub-run-b');
  });

  test('getGraphRunsForView returns direct matches for root graphs with matching data', () => {
    const graphRunHistoryByView = {
      'root:main-graph': [
        { graphRunId: 'root-run' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'main-graph' as GraphId, startedAt: 1 },
      ],
    };

    const rootView = { key: 'root:main-graph', graphId: 'main-graph' as GraphId };
    const runs = getGraphRunsForView({ currentGraphView: rootView, graphRunHistoryByView });

    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.graphRunId, 'root-run');
  });

  test('filterProcessDataForSelection filters by graphRunId only', () => {
    const processData = [
      { processId: 'p-sub-a', graphRunId: 'sub-run-a' as GraphRunId, graphId: 'sub-graph' as GraphId, data: { status: { type: 'ok' } } },
      { processId: 'p-sub-b', graphRunId: 'sub-run-b' as GraphRunId, graphId: 'sub-graph' as GraphId, data: { status: { type: 'ok' } } },
    ] as ProcessDataForNode[];

    const graphRuns = [
      { graphRunId: 'sub-run-a' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'sub-graph' as GraphId },
      { graphRunId: 'sub-run-b' as GraphRunId, rootRunId: 'root-1' as RootRunId, graphId: 'sub-graph' as GraphId },
    ];

    const filtered = filterProcessDataForSelection({
      graphRuns,
      processData,
      selectedGraphRun: 'sub-run-a' as GraphRunId,
    });

    assert.deepEqual(filtered?.map((p) => p.processId), ['p-sub-a']);
  });

  test('remote executor routing only uses remote transport when usable or required', () => {
    assert.equal(
      shouldUseRemoteExecutor({
        selectedExecutor: 'browser',
        session: { status: 'connecting' },
      }),
      false,
    );

    assert.equal(
      shouldUseRemoteExecutor({
        selectedExecutor: 'browser',
        session: { status: 'ready' },
      }),
      true,
    );

    assert.equal(
      shouldUseRemoteExecutor({
        selectedExecutor: 'nodejs',
        session: { status: 'reconnecting' },
      }),
      true,
    );
  });
});
