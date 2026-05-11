import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue } from '@valerypopoff/rivet2-core';

import { deleteGlobalDataRef, getGlobalDataRef, setGlobalDataRef } from './globalDataRefs.js';

test('global data refs tolerate malformed values without failing size calculation', () => {
  const malformedRefId = 'malformed-image-array-ref';
  const malformedValue = { type: 'image[]', value: undefined } as unknown as DataValue;

  assert.doesNotThrow(() => setGlobalDataRef(malformedRefId, malformedValue));
  assert.equal(getGlobalDataRef(malformedRefId), malformedValue);

  deleteGlobalDataRef(malformedRefId);
});

test('global data refs tolerate zero size hints for empty values', () => {
  const emptyChatMessageRefId = 'empty-chat-message-ref';
  const emptyChatMessageValue = {
    type: 'chat-message',
    value: {
      type: 'user',
      message: '',
    },
  } satisfies DataValue;

  assert.doesNotThrow(() => setGlobalDataRef(emptyChatMessageRefId, emptyChatMessageValue, { sizeHint: 0 }));
  assert.equal(getGlobalDataRef(emptyChatMessageRefId), emptyChatMessageValue);

  deleteGlobalDataRef(emptyChatMessageRefId);
});
