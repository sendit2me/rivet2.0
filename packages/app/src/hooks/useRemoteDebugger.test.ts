import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRestoreInternalNodeExecutorAfterDebuggerDisconnect } from './useRemoteDebugger.js';

describe('useRemoteDebugger', () => {
  test('restores the internal node executor after disconnecting an external debugger in Node mode', () => {
    assert.equal(
      shouldRestoreInternalNodeExecutorAfterDebuggerDisconnect({
        selectedExecutor: 'nodejs',
        sessionState: {
          status: 'ready',
          isInternalExecutor: false,
        },
        hasInternalExecutorUrl: false,
        isTauri: true,
      }),
      true,
    );
  });

  test('does not restore the internal node executor for Browser mode or internal sessions', () => {
    assert.equal(
      shouldRestoreInternalNodeExecutorAfterDebuggerDisconnect({
        selectedExecutor: 'browser',
        sessionState: {
          status: 'ready',
          isInternalExecutor: false,
        },
        hasInternalExecutorUrl: false,
        isTauri: true,
      }),
      false,
    );

    assert.equal(
      shouldRestoreInternalNodeExecutorAfterDebuggerDisconnect({
        selectedExecutor: 'nodejs',
        sessionState: {
          status: 'ready',
          isInternalExecutor: true,
        },
        hasInternalExecutorUrl: false,
        isTauri: true,
      }),
      false,
    );
  });

  test('restores hosted node executor sessions when an internal executor URL is configured', () => {
    assert.equal(
      shouldRestoreInternalNodeExecutorAfterDebuggerDisconnect({
        selectedExecutor: 'nodejs',
        sessionState: {
          status: 'ready',
          isInternalExecutor: false,
        },
        hasInternalExecutorUrl: true,
        isTauri: false,
      }),
      true,
    );
  });
});
