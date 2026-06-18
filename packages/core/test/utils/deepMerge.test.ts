import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from '../../src/utils/deepMerge.js';

describe('deepMerge', () => {
  it('overlays top-level keys, override winning', () => {
    assert.deepEqual(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 }), { a: 1, b: 3, c: 4 });
  });

  it('recurses into nested plain objects (combines sub-keys)', () => {
    assert.deepEqual(
      deepMerge({ chat_template_kwargs: { enable_thinking: false } }, { chat_template_kwargs: { add_generation_prompt: true } }),
      { chat_template_kwargs: { enable_thinking: false, add_generation_prompt: true } },
    );
  });

  it('override wins on the same nested sub-key', () => {
    assert.deepEqual(
      deepMerge({ chat_template_kwargs: { enable_thinking: true } }, { chat_template_kwargs: { enable_thinking: false } }),
      { chat_template_kwargs: { enable_thinking: false } },
    );
  });

  it('replaces arrays wholesale (does not concatenate or merge by index)', () => {
    assert.deepEqual(deepMerge({ stop: ['a', 'b'] }, { stop: ['c'] }), { stop: ['c'] });
  });

  it('a non-object override replaces an object base at that key', () => {
    assert.deepEqual(deepMerge({ x: { nested: 1 } }, { x: 5 }), { x: 5 });
  });

  it('does not mutate either input', () => {
    const base = { a: { b: 1 } };
    const over = { a: { c: 2 } };
    deepMerge(base, over);
    assert.deepEqual(base, { a: { b: 1 } });
    assert.deepEqual(over, { a: { c: 2 } });
  });
});
