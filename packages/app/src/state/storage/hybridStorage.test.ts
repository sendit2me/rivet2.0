import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allInitializeStoreFns,
  configureHybridStorageBackend,
  createHybridStorage,
  flushHybridStorageGroup,
} from './hybridStorage';

describe('createHybridStorage', () => {
  it('buffers values in memory for grouped keys', () => {
    const writes: Array<{ key: string; value: string }> = [];
    const { storage } = createHybridStorage('grouped', {
      getItem: async () => null,
      setItem: async (key, value) => {
        writes.push({ key, value });
      },
      removeItem: async () => {},
    });

    storage.setItem('alpha', { value: 1 });
    storage.setItem('beta', { value: 2 });

    assert.deepEqual(storage.getItem('alpha', null), { value: 1 });
    assert.deepEqual(storage.getItem('beta', null), { value: 2 });
    assert.equal(writes.length, 0);
  });

  it('flushHybridStorageGroup immediately persists the latest grouped snapshot', async () => {
    const writes: Array<{ key: string; value: string }> = [];
    const { storage } = createHybridStorage('grouped-flush', {
      getItem: async () => null,
      setItem: async (key, value) => {
        writes.push({ key, value });
      },
      removeItem: async () => {},
    });

    storage.setItem('alpha', { value: 1 });
    storage.setItem('beta', { value: 2 });

    await flushHybridStorageGroup('grouped-flush');

    assert.deepEqual(writes, [
      {
        key: 'grouped-flush',
        value: JSON.stringify({
          alpha: { value: 1 },
          beta: { value: 2 },
        }),
      },
    ]);
  });

  it('flushing after rapid writes persists the latest value and cancels stale debounced writes', async () => {
    const writes: Array<{ key: string; value: string }> = [];
    const { storage } = createHybridStorage('grouped-cancel', {
      getItem: async () => null,
      setItem: async (key, value) => {
        writes.push({ key, value });
      },
      removeItem: async () => {},
    });

    storage.setItem('alpha', { value: 1 });
    storage.setItem('alpha', { value: 2 });

    await flushHybridStorageGroup('grouped-cancel');
    await new Promise((resolve) => setTimeout(resolve, 1100));

    assert.deepEqual(writes, [
      {
        key: 'grouped-cancel',
        value: JSON.stringify({
          alpha: { value: 2 },
        }),
      },
    ]);
  });

  it('registering the same grouped key more than once remains safe and flushes the latest state', async () => {
    const writesA: Array<{ key: string; value: string }> = [];
    const writesB: Array<{ key: string; value: string }> = [];
    const first = createHybridStorage('grouped-shared', {
      getItem: async () => null,
      setItem: async (key, value) => {
        writesA.push({ key, value });
      },
      removeItem: async () => {},
    });
    const second = createHybridStorage('grouped-shared', {
      getItem: async () => null,
      setItem: async (key, value) => {
        writesB.push({ key, value });
      },
      removeItem: async () => {},
    });

    first.storage.setItem('alpha', { value: 1 });
    second.storage.setItem('beta', { value: 2 });

    await flushHybridStorageGroup('grouped-shared');

    assert.deepEqual(writesA, []);
    assert.deepEqual(writesB, [
      {
        key: 'grouped-shared',
        value: JSON.stringify({
          alpha: { value: 1 },
          beta: { value: 2 },
        }),
      },
    ]);
  });

  it('registering the same grouped key more than once only registers one initialize function', () => {
    const initialSize = allInitializeStoreFns.size;

    createHybridStorage('grouped-init-shared', {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    });
    createHybridStorage('grouped-init-shared', {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    });

    assert.equal(allInitializeStoreFns.size, initialSize + 1);
  });

  it('can persist grouped keys immediately when debouncing is disabled', async () => {
    const writes: Array<{ key: string; value: string }> = [];
    const { storage } = createHybridStorage(
      'grouped-immediate',
      {
        getItem: async () => null,
        setItem: async (key, value) => {
          writes.push({ key, value });
        },
        removeItem: async () => {},
      },
      { debounceMs: 0 },
    );

    storage.setItem('alpha', { value: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(writes, [
      {
        key: 'grouped-immediate',
        value: JSON.stringify({
          alpha: { value: 1 },
        }),
      },
    ]);
  });

  it('can swap the async storage backend before hosted initialization', async () => {
    const writes: Array<{ key: string; value: string }> = [];
    createHybridStorage('grouped-host-storage');

    const previousBackend = configureHybridStorageBackend({
      getItem: async () => null,
      setItem: async (key, value) => {
        writes.push({ key, value });
      },
      removeItem: async () => {},
    });

    try {
      const { storage } = createHybridStorage('grouped-host-storage');
      storage.setItem('alpha', { value: 1 });
      await flushHybridStorageGroup('grouped-host-storage');

      assert.deepEqual(writes, [
        {
          key: 'grouped-host-storage',
          value: JSON.stringify({
            alpha: { value: 1 },
          }),
        },
      ]);
    } finally {
      configureHybridStorageBackend(previousBackend);
    }
  });

  it('resets hosted storage controllers to the built-in backend when storage is omitted', async () => {
    const writes: Array<{ key: string; value: string }> = [];
    createHybridStorage('grouped-host-storage-reset');

    const previousBackend = configureHybridStorageBackend({
      getItem: async () => null,
      setItem: async (key, value) => {
        writes.push({ key, value });
      },
      removeItem: async () => {},
    });

    try {
      const { storage } = createHybridStorage('grouped-host-storage-reset');
      storage.setItem('alpha', { value: 1 });
      await flushHybridStorageGroup('grouped-host-storage-reset');

      configureHybridStorageBackend(undefined);
      storage.setItem('beta', { value: 2 });
      await flushHybridStorageGroup('grouped-host-storage-reset');

      assert.equal(writes.length, 1);
      assert.deepEqual(writes[0], {
        key: 'grouped-host-storage-reset',
        value: JSON.stringify({
          alpha: { value: 1 },
        }),
      });
    } finally {
      configureHybridStorageBackend(previousBackend);
    }
  });
});
