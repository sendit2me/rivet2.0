import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  summarizeDataValueForLog,
  summarizeErrorForLog,
  summarizePortMapForLog,
  summarizeUnknownForLog,
} from '../../src/utils/runtimeLogging.js';

void describe('runtimeLogging', () => {
  void it('summarizes strings without logging their contents', () => {
    assert.deepEqual(
      summarizeDataValueForLog({
        type: 'string',
        value: 'secret prompt',
      }),
      {
        type: 'string',
        value: {
          kind: 'string',
          length: 13,
        },
      },
    );
  });

  void it('summarizes arrays and objects by shape', () => {
    assert.deepEqual(summarizeUnknownForLog([1, 2, 3]), {
      kind: 'array',
      length: 3,
    });

    assert.deepEqual(summarizeUnknownForLog({ token: 'secret', nested: true }), {
      kind: 'object',
      keyCount: 2,
    });
  });

  void it('summarizes binary buffers by byte length without walking byte keys', () => {
    assert.deepEqual(summarizeUnknownForLog(new Uint8Array([1, 2, 3])), {
      kind: 'array-buffer-view',
      byteLength: 3,
    });

    assert.deepEqual(summarizeUnknownForLog(new ArrayBuffer(4)), {
      kind: 'array-buffer',
      byteLength: 4,
    });
  });

  void it('does not throw when object key enumeration fails', () => {
    const value = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('cannot enumerate');
        },
      },
    );

    assert.deepEqual(summarizeUnknownForLog(value), {
      kind: 'object',
      keyCount: 'unknown',
    });
  });

  void it('does not require Blob to exist in the runtime', () => {
    const originalBlob = globalThis.Blob;

    Object.defineProperty(globalThis, 'Blob', {
      configurable: true,
      value: undefined,
    });

    try {
      assert.deepEqual(summarizeUnknownForLog({ file: 'not-a-real-blob' }), {
        kind: 'object',
        keyCount: 1,
      });
    } finally {
      Object.defineProperty(globalThis, 'Blob', {
        configurable: true,
        value: originalBlob,
      });
    }
  });

  void it('summarizes port maps without values', () => {
    assert.deepEqual(
      summarizePortMapForLog({
        apiKey: {
          type: 'string',
          value: 'sk-secret',
        },
      }),
      {
        apiKey: {
          type: 'string',
          value: {
            kind: 'string',
            length: 9,
          },
        },
      },
    );
  });

  void it('truncates long error messages and omits stacks', () => {
    const summary = summarizeErrorForLog(new Error('x'.repeat(600)));

    assert.deepEqual(summary, {
      name: 'Error',
      message: `${'x'.repeat(500)}...`,
    });
  });
});
