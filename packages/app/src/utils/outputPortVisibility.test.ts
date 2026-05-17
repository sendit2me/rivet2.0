import assert from 'node:assert/strict';
import test from 'node:test';
import { WarningsPort } from '@valerypopoff/rivet2-core';
import {
  hasVisibleStoredPortMapValues,
  hasVisibleStoredSplitOutputValues,
  isVisibleOutputPort,
} from './outputPortVisibility.js';

test('isVisibleOutputPort hides warning and internal output ports', () => {
  assert.equal(isVisibleOutputPort('output'), true);
  assert.equal(isVisibleOutputPort(WarningsPort), false);
  assert.equal(isVisibleOutputPort('__internalPort_private'), false);
});

test('hasVisibleStoredPortMapValues ignores hidden and absent port wrappers', () => {
  assert.equal(
    hasVisibleStoredPortMapValues({
      output: undefined,
      [WarningsPort]: { type: 'string[]', storage: 'inline', value: ['warning'] },
    } as any),
    false,
  );

  assert.equal(
    hasVisibleStoredPortMapValues({
      output: { type: 'string', storage: 'inline', value: 'visible' },
      [WarningsPort]: { type: 'string[]', storage: 'inline', value: ['warning'] },
    } as any),
    true,
  );
});

test('hasVisibleStoredSplitOutputValues only counts splits with visible port wrappers', () => {
  assert.equal(
    hasVisibleStoredSplitOutputValues({
      0: {
        [WarningsPort]: { type: 'string[]', storage: 'inline', value: ['warning'] },
      },
    } as any),
    false,
  );

  assert.equal(
    hasVisibleStoredSplitOutputValues({
      0: {
        output: { type: 'string', storage: 'inline', value: 'visible' },
      },
    } as any),
    true,
  );
});
