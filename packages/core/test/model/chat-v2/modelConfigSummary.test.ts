import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMChatV2NodeData, type LLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import {
  deriveModelConfigSummary,
  type ModelConfigSummaryField,
} from '../../../src/model/chat-v2/modelConfigSummary.js';

const defaults = (): LLMChatV2NodeData => createLLMChatV2NodeData();
const byKey = (fields: ModelConfigSummaryField[], key: ModelConfigSummaryField['key']) =>
  fields.find((f) => f.key === key)!;

describe('deriveModelConfigSummary — headline fields', () => {
  it('vanilla (no source): provider is editable & not overridden; no custom extraBody row', () => {
    const d = defaults();
    const fields = deriveModelConfigSummary(d, d, d, false);
    const provider = byKey(fields, 'provider');
    assert.equal(provider.editable, true); // node-owned when no source
    assert.equal(provider.overridden, false);
    assert.equal(byKey(fields, 'reasoning').control, 'enum'); // openai default has an effort field
    assert.equal(
      fields.find((f) => f.key === 'extraBody'),
      undefined, // openai → no extraBody summary row
    );
  });

  it('bound (custom preset, node at defaults): shows resolved values, all inherited', () => {
    const d = defaults();
    const data: LLMChatV2NodeData = { ...d, llmPresetId: 'coder' };
    const effective: LLMChatV2NodeData = {
      ...d,
      provider: 'custom',
      model: 'Qwen3.6-35B-A3B-nvfp4',
      temperature: 0.2,
      extraProviderOptions: '{"chat_template_kwargs":{"enable_thinking":false}}',
    };
    const fields = deriveModelConfigSummary(effective, data, d, true);

    const provider = byKey(fields, 'provider');
    assert.equal(provider.value, 'Custom provider');
    assert.equal(provider.editable, false); // Profile-owned: display-only when a source is bound
    assert.equal(provider.overridden, false);

    assert.equal(byKey(fields, 'model').value, 'Qwen3.6-35B-A3B-nvfp4');
    assert.equal(byKey(fields, 'model').overridden, false); // node left model at default → inherited
    assert.equal(byKey(fields, 'temperature').value, '0.2');
    assert.equal(byKey(fields, 'temperature').overridden, false);

    assert.equal(byKey(fields, 'reasoning').control, 'readonly'); // custom has no effort field
    assert.equal(byKey(fields, 'reasoning').value, '—');

    const extra = byKey(fields, 'extraBody');
    assert.equal(extra.value, 'chat_template_kwargs'); // top-level key summary
    assert.equal(extra.editable, false);
    assert.equal(extra.overridden, false); // node added none of its own
  });

  it('node override flips the marker and offers a revert (editable)', () => {
    const d = defaults();
    const data: LLMChatV2NodeData = { ...d, llmProfileId: 'p', temperature: 0.9, model: 'override-model' };
    const effective: LLMChatV2NodeData = { ...d, provider: 'custom', temperature: 0.9, model: 'override-model' };
    const fields = deriveModelConfigSummary(effective, data, d, true);
    assert.equal(byKey(fields, 'temperature').overridden, true);
    assert.equal(byKey(fields, 'temperature').editable, true);
    assert.equal(byKey(fields, 'model').overridden, true);
    assert.equal(byKey(fields, 'model').dataKey, 'model');
  });

  it('provider special-case: overridden+editable only when NO source drives it', () => {
    const d = defaults();
    const data: LLMChatV2NodeData = { ...d, provider: 'anthropic' };
    const effective: LLMChatV2NodeData = { ...d, provider: 'anthropic' };

    const noSource = deriveModelConfigSummary(effective, data, d, false);
    assert.equal(byKey(noSource, 'provider').overridden, true);
    assert.equal(byKey(noSource, 'provider').editable, true);

    const withSource = deriveModelConfigSummary(effective, data, d, true);
    assert.equal(byKey(withSource, 'provider').overridden, false);
    assert.equal(byKey(withSource, 'provider').editable, false);
  });

  it('reasoning maps to the resolved provider effort field', () => {
    const d = defaults();
    for (const [provider, field] of [
      ['openai', 'openAIReasoningEffort'],
      ['anthropic', 'anthropicEffort'],
      ['google', 'googleThinkingLevel'],
    ] as const) {
      const effective: LLMChatV2NodeData = { ...d, provider };
      const reasoning = byKey(deriveModelConfigSummary(effective, d, d, true), 'reasoning');
      assert.equal(reasoning.dataKey, field, `${provider} → ${field}`);
      assert.equal(reasoning.control, 'enum');
    }
  });
});
