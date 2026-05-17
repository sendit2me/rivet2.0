import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue } from '@valerypopoff/rivet2-core';
import { getStorageDecision } from './executionDataPreview.js';
import { REF_STORAGE_THRESHOLD_CHARS } from './outputStorageLimits.js';

test('getStorageDecision builds text previews for large strings', () => {
  const decision = getStorageDecision({
    type: 'string',
    value: 'a'.repeat(REF_STORAGE_THRESHOLD_CHARS + 1),
  });

  assert.equal(decision.storage, 'ref');
  assert.equal(decision.preview.kind, 'text');
  assert.equal(decision.sizeHint, REF_STORAGE_THRESHOLD_CHARS + 1);
});

test('getStorageDecision keeps malformed string payloads inline', () => {
  const decision = getStorageDecision({
    type: 'string',
    value: undefined,
  } as unknown as DataValue);

  assert.deepEqual(decision, {
    storage: 'inline',
  });
});

test('getStorageDecision keeps undefined visible in large any-array previews', () => {
  const decision = getStorageDecision({
    type: 'any[]',
    value: [
      undefined,
      ...Array.from({ length: 400 }, (_, index) => ({ [`key-${index}`]: `value-${index}-${'x'.repeat(64)}` })),
    ],
  });

  assert.equal(decision.storage, 'ref');
  assert.equal(decision.preview.kind, 'json');
  assert.match(decision.preview.excerpt, /"undefined"/);
  assert.doesNotMatch(decision.preview.excerpt, /^\[\n  null,/);
});

test('getStorageDecision stores media payloads by ref with summary previews', () => {
  const decision = getStorageDecision({
    type: 'binary',
    value: new Uint8Array([1, 2, 3]),
  });

  assert.equal(decision.storage, 'ref');
  assert.deepEqual(decision.preview, {
    kind: 'summary',
    label: 'Binary',
    totalBytes: 3,
  });
  assert.equal(decision.sizeHint, 3);
});
