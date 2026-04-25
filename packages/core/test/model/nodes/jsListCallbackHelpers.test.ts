import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  assertSynchronousCallbackResult,
  buildJSFilterWrapper,
  buildJSMapWrapper,
  getJSListCallbackInterpolationInputDefinitions,
  interpolateJSListCallbackBody,
} from '../../../src/model/nodes/jsListCallbackHelpers.js';
import type { PortId } from '../../../src/index.js';

describe('jsListCallbackHelpers', () => {
  it('injects the JS Filter callback body into a non-async callback wrapper', () => {
    const wrapper = buildJSFilterWrapper('return item > 2;');

    assert.match(wrapper, /const callback = \(item, index, array\) => \{/);
    assert.match(wrapper, /return item > 2;/);
    assert.match(wrapper, /filtered:/);
    assert.match(wrapper, /assertSynchronousCallbackResult\(result, 'JS Filter'\);/);
  });

  it('injects the JS Map callback body into a non-async callback wrapper', () => {
    const wrapper = buildJSMapWrapper('return item * 2;');

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

  it('discovers value interpolation ports without duplicating callback locals', () => {
    assert.deepStrictEqual(
      getJSListCallbackInterpolationInputDefinitions('return {{item}} > {{min}} && {{index}} !== {{array}};'),
      [
        {
          id: 'min',
          title: 'min',
          dataType: 'any',
          required: false,
        },
      ],
    );
  });

  it('uses shared interpolation token rules for escaped and malformed tokens', () => {
    assert.deepStrictEqual(
      getJSListCallbackInterpolationInputDefinitions('return "{{{literal}}}" + {{broken + {{value}};'),
      [
        {
          id: 'value',
          title: 'value',
          dataType: 'any',
          required: false,
        },
      ],
    );
  });

  it('renders callback locals and value inputs in parsed callback previews', () => {
    assert.strictEqual(
      interpolateJSListCallbackBody('return {{item}} ?? {{index}} ?? {{array}} ?? {{fallback}};', {
        ['array' as PortId]: { type: 'number[]', value: [1, 2, 3] },
        ['fallback' as PortId]: { type: 'string', value: 'value' },
      }),
      'return item ?? index ?? array ?? "value";',
    );
  });
});
