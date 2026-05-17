import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasDisplayableInterpolationInputs,
  shouldShowStructuredOutputDetails,
} from './parsedSourceDisplayUtils.js';

test('hasDisplayableInterpolationInputs uses shared interpolation discovery while ignoring reserved names', () => {
  assert.equal(hasDisplayableInterpolationInputs('return {{value}};'), true);
  assert.equal(
    hasDisplayableInterpolationInputs('return {{item}} + {{index}} + {{array}};', {
      reservedInputNames: new Set(['item', 'index', 'array']),
    }),
    false,
  );
  assert.equal(
    hasDisplayableInterpolationInputs('return {{item}} + {{factor}};', {
      reservedInputNames: new Set(['item', 'index', 'array']),
    }),
    true,
  );
  assert.equal(hasDisplayableInterpolationInputs('return "{{{escaped}}}";'), false);
});

test('shouldShowStructuredOutputDetails hides details only in compact output previews', () => {
  assert.equal(shouldShowStructuredOutputDetails('compact'), false);
  assert.equal(shouldShowStructuredOutputDetails('expanded-preview'), true);
  assert.equal(shouldShowStructuredOutputDetails('full'), true);
});
