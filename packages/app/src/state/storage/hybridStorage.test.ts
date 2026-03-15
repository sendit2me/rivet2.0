import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHybridStorage } from './hybridStorage';

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
});
