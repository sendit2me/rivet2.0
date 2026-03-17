import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toast, type Id as ToastId } from 'react-toastify';
import { handleError, syncWrapper, wrapAsync } from './errorHandling.js';
import { syncWrapper as legacySyncWrapper } from './syncWrapper.js';

type ToastWithMutableError = typeof toast & {
  error: typeof toast.error;
};

const mutableToast = toast as ToastWithMutableError;
const originalToastError = mutableToast.error;
const originalConsoleError = console.error;

function createToastErrorStub(onToast: (message: string) => void): typeof toast.error {
  return ((content) => {
    onToast(typeof content === 'string' ? content : String(content ?? ''));
    return 'test-toast-id' as ToastId;
  }) as typeof toast.error;
}

afterEach(() => {
  mutableToast.error = originalToastError;
  console.error = originalConsoleError;
});

describe('errorHandling', () => {
  test('logs structured metadata when provided', () => {
    const logged: unknown[] = [];
    const toasted: string[] = [];

    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    mutableToast.error = createToastErrorStub((message) => {
      toasted.push(message);
    });

    handleError(new Error('boom'), 'Structured error test', {
      metadata: {
        projectId: 'project-1',
        graphId: 'graph-1',
      },
    });

    assert.equal(toasted.length, 1);
    assert.equal(toasted[0], 'Structured error test: boom');
    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0], [
      '[Structured error test]',
      {
        error: new Error('boom'),
        metadata: {
          projectId: 'project-1',
          graphId: 'graph-1',
        },
      },
    ]);
  });

  test('dedupes repeated toast messages within the dedupe window', () => {
    const toasted: string[] = [];

    console.error = () => {};
    mutableToast.error = createToastErrorStub((message) => {
      toasted.push(message);
    });

    handleError(new Error('duplicate'), 'Deduped error test');
    handleError(new Error('duplicate'), 'Deduped error test');

    assert.deepEqual(toasted, ['Deduped error test: duplicate']);
  });

  test('can suppress toast emission while still logging', () => {
    const logged: unknown[] = [];
    const toasted: string[] = [];

    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    mutableToast.error = createToastErrorStub((message) => {
      toasted.push(message);
    });

    handleError(new Error('silent'), 'Silent error test', {
      metadata: {
        requestId: 'request-1',
      },
      toastError: false,
    });

    assert.equal(toasted.length, 0);
    assert.equal(logged.length, 1);
  });

  test('wrapAsync resolves structured error options from handler arguments', async () => {
    const logged: unknown[] = [];
    const toasted: string[] = [];

    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    mutableToast.error = createToastErrorStub((message) => {
      toasted.push(message);
    });

    const wrapped = wrapAsync(
      async (datasetId: string) => {
        throw new Error('wrapped boom');
      },
      'Wrapped error test',
      (datasetId) => ({
        metadata: {
          datasetId,
        },
      }),
    );

    wrapped('dataset-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(toasted, ['Wrapped error test: wrapped boom']);
    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0], [
      '[Wrapped error test]',
      {
        error: new Error('wrapped boom'),
        metadata: {
          datasetId: 'dataset-1',
        },
      },
    ]);
  });

  test('syncWrapper remains a compatibility alias over wrapAsync', async () => {
    const toasted: string[] = [];

    console.error = () => {};
    mutableToast.error = createToastErrorStub((message) => {
      toasted.push(message);
    });

    const wrapped = syncWrapper(async () => {
      throw new Error('compatibility boom');
    }, 'Compatibility wrapper test');

    wrapped();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(toasted, ['Compatibility wrapper test: compatibility boom']);
  });

  test('legacy syncWrapper module preserves handler arguments', async () => {
    const toasted: string[] = [];

    console.error = () => {};
    mutableToast.error = createToastErrorStub((message) => {
      toasted.push(message);
    });

    const wrapped = legacySyncWrapper(async (datasetId: string) => {
      throw new Error(`compatibility boom ${datasetId}`);
    }, 'Legacy compatibility wrapper test');

    wrapped('dataset-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(toasted, ['Legacy compatibility wrapper test: compatibility boom dataset-1']);
  });
});
