import { describe, it, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseProviderJsonChunk } from '../../src/utils/providerStreamParsing.js';

void describe('parseProviderJsonChunk', () => {
  void it('parses valid provider JSON chunks', () => {
    assert.deepEqual(parseProviderJsonChunk<{ value: number }>('TestProvider', '{"value":1}'), {
      value: 1,
    });
  });

  void it('does not log raw malformed chunks by default', () => {
    const originalLocalStorage = globalThis.localStorage;
    const consoleLog = mock.method(console, 'log', () => {});

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
      },
    });

    try {
      assert.throws(() => parseProviderJsonChunk('TestProvider', '{"secret":"value"'));
      assert.equal(consoleLog.mock.callCount(), 0);
    } finally {
      consoleLog.mock.restore();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  });

  void it('debug-logs chunk shape rather than raw malformed chunks', () => {
    const originalLocalStorage = globalThis.localStorage;
    const consoleLog = mock.method(console, 'log', () => {});

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => 'true',
      },
    });

    try {
      assert.throws(() => parseProviderJsonChunk('TestProvider', '{"secret":"value"'));
      assert.equal(consoleLog.mock.callCount(), 1);
      const metadata = consoleLog.mock.calls[0]!.arguments[1] as Record<string, unknown>;
      assert.equal(metadata.provider, 'TestProvider');
      assert.equal(metadata.chunkLength, 17);
      assert.equal(JSON.stringify(metadata).includes('secret'), false);
    } finally {
      consoleLog.mock.restore();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  });
});
