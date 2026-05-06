import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop } from './useExecutorSession.js';
import type { ExecutorSessionLifecycleEvent } from './executorSession.js';

const externalDropEvent: ExecutorSessionLifecycleEvent = {
  isInternalExecutor: false,
  reason: 'unexpected-disconnect',
  status: 'idle',
  url: 'ws://localhost:21888',
};

describe('useExecutorSession', () => {
  test('restores Node executor after an external debugger drops in hosted Node mode', () => {
    assert.equal(
      shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop({
        event: externalDropEvent,
        hasInternalExecutorUrl: true,
        isTauri: false,
        selectedExecutor: 'nodejs',
      }),
      true,
    );
  });

  test('restores Node executor after an external debugger drops in desktop Node mode', () => {
    assert.equal(
      shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop({
        event: externalDropEvent,
        hasInternalExecutorUrl: false,
        isTauri: true,
        selectedExecutor: 'nodejs',
      }),
      true,
    );
  });

  test('does not restore Node executor for Browser mode or internal executor drops', () => {
    assert.equal(
      shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop({
        event: externalDropEvent,
        hasInternalExecutorUrl: true,
        isTauri: false,
        selectedExecutor: 'browser',
      }),
      false,
    );

    assert.equal(
      shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop({
        event: {
          ...externalDropEvent,
          isInternalExecutor: true,
          url: 'ws://127.0.0.1:21889/internal',
        },
        hasInternalExecutorUrl: true,
        isTauri: false,
        selectedExecutor: 'nodejs',
      }),
      false,
    );
  });

  test('does not restore Node executor for explicit remote debugger disconnects', () => {
    assert.equal(
      shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop({
        event: {
          ...externalDropEvent,
          reason: 'manual-disconnect',
        },
        hasInternalExecutorUrl: true,
        isTauri: false,
        selectedExecutor: 'nodejs',
      }),
      false,
    );
  });
});
