import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allInitializeStoreFns, createHybridStorage, flushHybridStorageGroup } from './hybridStorage';

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
});
