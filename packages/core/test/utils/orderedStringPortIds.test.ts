import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  hasValidStoredOrderedPortIds,
  resolveStoredOrderedPortIds,
} from '../../src/utils/orderedStringPortIds.js';

describe('orderedStringPortIds helpers', () => {
  it('accepts unique stored ids', () => {
    assert.equal(hasValidStoredOrderedPortIds(2, ['port-a', 'port-b']), true);
    assert.deepEqual(
      resolveStoredOrderedPortIds(2, ['port-a', 'port-b'], {
        kind: 'prefix',
        prefix: 'case',
        startIndex: 1,
      }),
      ['port-a', 'port-b'],
    );
  });

  it('rejects duplicate stored ids and falls back to legacy ids', () => {
    assert.equal(hasValidStoredOrderedPortIds(2, ['port-a', 'port-a']), false);
    assert.deepEqual(
      resolveStoredOrderedPortIds(2, ['port-a', 'port-a'], {
        kind: 'prefix',
        prefix: 'case',
        startIndex: 1,
      }),
      ['case1', 'case2'],
    );
  });
});
