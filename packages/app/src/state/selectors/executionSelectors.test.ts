import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProcessDataForNode } from '../dataFlow.js';
import {
  getActionBarExecutionState,
  getNodeExecutionClassFlags,
  getNodeExecutionStatus,
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

  test('node execution status helpers derive canonical class flags', () => {
    assert.equal(getNodeExecutionStatus({ status: { type: 'error', error: 'boom' } }), 'error');
    assert.deepEqual(getNodeExecutionClassFlags({ status: { type: 'notRan', reason: 'skip' } }), {
      success: false,
      error: false,
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
