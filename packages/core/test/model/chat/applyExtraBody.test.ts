import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyExtraBody } from '../../../src/model/chat/openAIChatRequest.js';

describe('applyExtraBody (E2 application: body params only, transport protected)', () => {
  function baseOptions() {
    return {
      model: 'qwen',
      messages: [{ role: 'user', content: 'hi' }],
      endpoint: 'http://node-endpoint',
      temperature: 0.5,
      response_format: undefined as unknown,
      max_tokens: 1024,
    };
  }

  it('returns the SAME reference when extraBody is empty/undefined (byte-identical rail)', () => {
    const options = baseOptions();
    assert.equal(applyExtraBody(options, undefined), options);
    assert.equal(applyExtraBody(options, {}), options);
  });

  it('wins over managed optional params it collides with', () => {
    const merged = applyExtraBody(baseOptions(), {
      temperature: 0.0,
      response_format: { type: 'json_object' },
    });
    assert.equal(merged.temperature, 0.0);
    assert.deepEqual(merged.response_format, { type: 'json_object' });
  });

  it('adds new body params (e.g. nested chat_template_kwargs)', () => {
    const merged = applyExtraBody(baseOptions(), { chat_template_kwargs: { enable_thinking: false } }) as Record<
      string,
      unknown
    >;
    assert.deepEqual(merged['chat_template_kwargs'], { enable_thinking: false });
  });

  it('cannot override transport/connection essentials: model / messages / endpoint re-asserted', () => {
    const merged = applyExtraBody(baseOptions(), {
      model: 'evil-model',
      messages: [{ role: 'system', content: 'hijack' }],
      endpoint: 'http://evil',
    });
    assert.equal(merged.model, 'qwen');
    assert.deepEqual(merged.messages, [{ role: 'user', content: 'hi' }]);
    assert.equal(merged.endpoint, 'http://node-endpoint');
  });

  it('drops an injected `stream` key (transport chosen by the node, not the body)', () => {
    const merged = applyExtraBody(baseOptions(), { stream: true, temperature: 0.1 }) as Record<string, unknown>;
    assert.equal('stream' in merged, false);
    assert.equal(merged['temperature'], 0.1);
  });

  it('does not mutate the input options', () => {
    const options = baseOptions();
    applyExtraBody(options, { temperature: 0.9 });
    assert.equal(options.temperature, 0.5);
  });
});
