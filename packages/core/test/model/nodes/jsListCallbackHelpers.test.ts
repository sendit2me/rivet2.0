import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  assertSynchronousCallbackResult,
  buildJSFilterWrapper,
  buildJSMapWrapper,
} from '../../../src/model/nodes/jsListCallbackHelpers.js';

describe('jsListCallbackHelpers', () => {
  it('injects the JS Filter callback body into a non-async callback wrapper', () => {
    const wrapper = buildJSFilterWrapper('return item > 2;');

    assert.match(wrapper, /const callback = \(item, index, array\) => \{/);
    assert.match(wrapper, /return item > 2;/);
    assert.match(wrapper, /filtered:/);
    assert.match(wrapper, /assertSynchronousCallbackResult\(result, 'JS Filter'\);/);
  });

  it('injects the JS Map callback body into a non-async callback wrapper', () => {
    const wrapper = buildJSMapWrapper('return item \* 2;');

    assert.match(wrapper, /const callback = \(item, index, array\) => \{/);
    assert.match(wrapper, /return item \* 2;/);
    assert.match(wrapper, /mapped:/);
    assert.match(wrapper, /assertSynchronousCallbackResult\(result, 'JS Map'\);/);
  });

  it('throws when a callback result is thenable', () => {
    assert.throws(
      () => assertSynchronousCallbackResult(Promise.resolve(true), 'JS Filter'),
      /JS Filter callbacks must be synchronous\./,
    );
  });

  it('does nothing for non-thenable callback results', () => {
    assert.doesNotThrow(() => assertSynchronousCallbackResult(true, 'JS Map'));
    assert.doesNotThrow(() => assertSynchronousCallbackResult({ then: 'nope' }, 'JS Map'));
  });
});
