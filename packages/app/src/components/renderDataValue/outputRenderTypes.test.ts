import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowLargeStoredValueActions } from './outputRenderTypes.js';

test('large stored value actions show in explicit full mode', () => {
  assert.equal(shouldShowLargeStoredValueActions({ mode: 'full' }), true);
});

test('large stored value actions stay hidden in compact and hover preview modes', () => {
  assert.equal(shouldShowLargeStoredValueActions({ mode: 'compact' }), false);
  assert.equal(shouldShowLargeStoredValueActions({ mode: 'expanded-preview' }), false);
});

test('fullscreen preview can opt into large stored value actions without full mode', () => {
  assert.equal(
    shouldShowLargeStoredValueActions({
      mode: 'expanded-preview',
      allowLargeStoredValueActions: true,
    }),
    true,
  );
});
