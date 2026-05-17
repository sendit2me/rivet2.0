import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowStructuredOutputDetails } from './parsedSourceDisplayUtils.js';

test('shouldShowStructuredOutputDetails hides details only in compact output previews', () => {
  assert.equal(shouldShowStructuredOutputDetails('compact'), false);
  assert.equal(shouldShowStructuredOutputDetails('expanded-preview'), true);
  assert.equal(shouldShowStructuredOutputDetails('full'), true);
});
