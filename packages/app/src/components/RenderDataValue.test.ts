import assert from 'node:assert/strict';
import test from 'node:test';

import { getOutputPortsToRender, shouldRenderOutputValueExpanded } from './renderDataValue/outputPortPreviewPolicy.js';

test('compact output rendering keeps LLM Chat response and retry-attempt transport outputs together', () => {
  assert.deepEqual(
    getOutputPortsToRender(['response', 'requestStatus', 'requestError', 'requestStatuses', 'requestErrors'], true),
    ['requestStatus', 'requestError', 'requestStatuses', 'requestErrors'],
  );
});

test('compact output rendering keeps the usual first-output preview for normal output sets', () => {
  assert.deepEqual(getOutputPortsToRender(['response', 'requestStatus', 'requestError'], true), ['response']);
  assert.deepEqual(getOutputPortsToRender(['response', 'usage'], true), ['response']);
});

test('LLM Chat retry-attempt arrays render expanded inside compact output groups', () => {
  assert.equal(shouldRenderOutputValueExpanded('requestStatuses'), true);
  assert.equal(shouldRenderOutputValueExpanded('requestErrors'), true);
  assert.equal(shouldRenderOutputValueExpanded('requestStatus'), false);
});
