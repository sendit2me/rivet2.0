import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMChatV2NodeData, type LLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import { resolveEffectiveLLMChatV2Data } from '../../../src/model/chat-v2/resolveEffectiveLLMChatV2Data.js';
import type { LlmPreset, LlmProfile, LlmSkill, ModelConfig } from '../../../src/model/Settings.js';

function node(overrides: Partial<LLMChatV2NodeData> = {}): LLMChatV2NodeData {
  return { ...createLLMChatV2NodeData(), ...overrides };
}

describe('resolveEffectiveLLMChatV2Data — byte-identical rail', () => {
  it('returns the SAME node data reference when no selector is set (identity, never runs overlay)', () => {
    const data = node({ temperature: 0.9 });
    const modelConfig: ModelConfig = { profiles: [{ id: 'p', name: 'P', provider: 'openai', defaultModel: 'x' }] };
    const result = resolveEffectiveLLMChatV2Data(modelConfig, {}, data);
    assert.equal(result, data); // identity
  });

  it('deep-equals the node data when a selector is set but dangles (empty overlay)', () => {
    const data = node({ temperature: 0.9 });
    const result = resolveEffectiveLLMChatV2Data({}, { llmProfileId: 'missing' }, data);
    assert.notEqual(result, data); // a copy, not identity
    assert.deepEqual(result, data); // but value-identical
  });
});

describe('resolveEffectiveLLMChatV2Data — Profile (connection)', () => {
  const profile: LlmProfile = {
    id: 'prof',
    name: 'Custom oMLX',
    provider: 'custom',
    customProviderBaseURL: 'http://localhost:9090/v1',
    apiKeySource: 'environment',
    customProviderApiKeyEnvVarName: 'OMLX_KEY',
    headers: { 'x-team': 'qa' },
    defaultModel: 'qwen-local',
  };

  it('applies provider (Profile-owned), connection fields, and the fallback model', () => {
    const result = resolveEffectiveLLMChatV2Data({ profiles: [profile] }, { llmProfileId: 'prof' }, node());
    assert.equal(result.provider, 'custom');
    assert.equal(result.customProviderBaseURL, 'http://localhost:9090/v1');
    assert.equal(result.customProviderApiKeyEnvVarName, 'OMLX_KEY');
    assert.deepEqual(result.headers, [{ key: 'x-team', value: 'qa' }]);
    assert.equal(result.model, 'qwen-local'); // node left model at default 'gpt-5' → fallback fills it
  });

  it('provider is Profile-owned: the Profile provider wins even over a node-set provider', () => {
    const result = resolveEffectiveLLMChatV2Data(
      { profiles: [profile] },
      { llmProfileId: 'prof' },
      node({ provider: 'openai' }),
    );
    assert.equal(result.provider, 'custom');
  });

  it('with no Profile, the node provider drives block selection', () => {
    const skill: LlmSkill = { id: 's', name: 'S', providers: { anthropic: { model: 'claude-x' } } };
    const result = resolveEffectiveLLMChatV2Data(
      { skills: [skill] },
      { llmSkillId: 's' },
      node({ provider: 'anthropic' }),
    );
    assert.equal(result.provider, 'anthropic');
    assert.equal(result.model, 'claude-x');
  });
});

describe('resolveEffectiveLLMChatV2Data — Skill fan-out', () => {
  it('applies base agnostic params for the matching provider', () => {
    const skill: LlmSkill = { id: 's', name: 'S', base: { temperature: 0.1, maxTokens: 4096, topP: 0.8 } };
    const result = resolveEffectiveLLMChatV2Data(
      { skills: [skill] },
      { llmSkillId: 's' },
      node({ provider: 'openai' }),
    );
    assert.equal(result.temperature, 0.1);
    assert.equal(result.maxTokens, 4096);
    assert.equal(result.topP, 0.8);
  });

  it('providers[provider] overlays on top of base, for the resolved provider only', () => {
    const skill: LlmSkill = {
      id: 's',
      name: 'S',
      base: { temperature: 0.1 },
      providers: {
        openai: { model: 'gpt-x', openAIReasoningEffort: 'high' },
        anthropic: { model: 'claude-x', anthropicEffort: 'max' },
      },
    };
    const onOpenai = resolveEffectiveLLMChatV2Data({ skills: [skill] }, { llmSkillId: 's' }, node({ provider: 'openai' }));
    assert.equal(onOpenai.model, 'gpt-x');
    assert.equal(onOpenai.openAIReasoningEffort, 'high');
    assert.equal(onOpenai.anthropicEffort, ''); // the anthropic block is not applied for an openai node

    const onAnthropic = resolveEffectiveLLMChatV2Data(
      { skills: [skill] },
      { llmSkillId: 's' },
      node({ provider: 'anthropic' }),
    );
    assert.equal(onAnthropic.model, 'claude-x');
    assert.equal(onAnthropic.anthropicEffort, 'max');
  });
});

describe('resolveEffectiveLLMChatV2Data — reasoning-level map', () => {
  const skill = (reasoningLevel: string): LlmSkill => ({ id: 's', name: 'S', base: { reasoningLevel: reasoningLevel as never } });

  it('maps base.reasoningLevel to the provider effort field (low/med/high everywhere)', () => {
    const oa = resolveEffectiveLLMChatV2Data({ skills: [skill('high')] }, { llmSkillId: 's' }, node({ provider: 'openai' }));
    assert.equal(oa.openAIReasoningEffort, 'high');
    const an = resolveEffectiveLLMChatV2Data({ skills: [skill('low')] }, { llmSkillId: 's' }, node({ provider: 'anthropic' }));
    assert.equal(an.anthropicEffort, 'low');
    const go = resolveEffectiveLLMChatV2Data({ skills: [skill('medium')] }, { llmSkillId: 's' }, node({ provider: 'google' }));
    assert.equal(go.googleThinkingLevel, 'medium');
  });

  it('minimal maps for openai/google but is left UNSET for anthropic (no equivalent, no lossy guess)', () => {
    const oa = resolveEffectiveLLMChatV2Data({ skills: [skill('minimal')] }, { llmSkillId: 's' }, node({ provider: 'openai' }));
    assert.equal(oa.openAIReasoningEffort, 'minimal');
    const go = resolveEffectiveLLMChatV2Data({ skills: [skill('minimal')] }, { llmSkillId: 's' }, node({ provider: 'google' }));
    assert.equal(go.googleThinkingLevel, 'minimal');
    const an = resolveEffectiveLLMChatV2Data({ skills: [skill('minimal')] }, { llmSkillId: 's' }, node({ provider: 'anthropic' }));
    assert.equal(an.anthropicEffort, ''); // unchanged default
  });

  it('an explicit provider-block effort value wins over the base mapping', () => {
    const skill: LlmSkill = {
      id: 's',
      name: 'S',
      base: { reasoningLevel: 'low' },
      providers: { openai: { openAIReasoningEffort: 'xhigh' } },
    };
    const result = resolveEffectiveLLMChatV2Data({ skills: [skill] }, { llmSkillId: 's' }, node({ provider: 'openai' }));
    assert.equal(result.openAIReasoningEffort, 'xhigh');
  });
});

describe('resolveEffectiveLLMChatV2Data — precedence', () => {
  it('model precedence: Node > Skill.providers[p].model > Profile.defaultModel', () => {
    const modelConfig: ModelConfig = {
      profiles: [{ id: 'prof', name: 'P', provider: 'openai', defaultModel: 'profile-model' }],
      skills: [{ id: 's', name: 'S', providers: { openai: { model: 'skill-model' } } }],
    };
    // Node left at default → skill block model wins over profile default.
    const blockWins = resolveEffectiveLLMChatV2Data(modelConfig, { llmProfileId: 'prof', llmSkillId: 's' }, node());
    assert.equal(blockWins.model, 'skill-model');

    // Node explicitly set (differs from default) → node wins.
    const nodeWins = resolveEffectiveLLMChatV2Data(
      modelConfig,
      { llmProfileId: 'prof', llmSkillId: 's' },
      node({ model: 'node-model' }),
    );
    assert.equal(nodeWins.model, 'node-model');

    // Only a profile → its defaultModel fills.
    const profileOnly = resolveEffectiveLLMChatV2Data(modelConfig, { llmProfileId: 'prof' }, node());
    assert.equal(profileOnly.model, 'profile-model');
  });

  it('Preset.overrides win over Skill, and node selectors replace the preset pieces', () => {
    const modelConfig: ModelConfig = {
      profiles: [{ id: 'prof', name: 'P', provider: 'openai', defaultModel: 'm' }],
      skills: [
        { id: 'sa', name: 'SA', base: { temperature: 0.2 } },
        { id: 'sb', name: 'SB', base: { temperature: 0.9 } },
      ],
      presets: [{ id: 'pre', name: 'Pre', profileId: 'prof', skillId: 'sa', overrides: { temperature: 0.5 } }],
    };
    // Preset.overrides beats the preset's skill.
    const viaPreset = resolveEffectiveLLMChatV2Data(modelConfig, { llmPresetId: 'pre' }, node());
    assert.equal(viaPreset.temperature, 0.5);

    // An explicit node skill selector replaces the preset's skill (sb's 0.9, override no longer references it...
    // override still applies on top → 0.5 wins as it's highest below the node).
    const nodeSkill = resolveEffectiveLLMChatV2Data(modelConfig, { llmPresetId: 'pre', llmSkillId: 'sb' }, node());
    assert.equal(nodeSkill.temperature, 0.5); // preset override still highest-below-node
  });
});

describe('resolveEffectiveLLMChatV2Data — extends resolves before the provider overlay', () => {
  it('skill-extends-skill merges base (child wins) and provider blocks, then overlays the provider', () => {
    const modelConfig: ModelConfig = {
      skills: [
        { id: 'parent', name: 'Parent', base: { temperature: 0.2, maxTokens: 1000 }, providers: { custom: { model: 'parent-model' } } },
        { id: 'child', name: 'Child', extends: 'parent', base: { temperature: 0.7 } },
      ],
    };
    const result = resolveEffectiveLLMChatV2Data({ ...modelConfig }, { llmSkillId: 'child' }, node({ provider: 'custom' }));
    assert.equal(result.temperature, 0.7); // child base wins
    assert.equal(result.maxTokens, 1000); // inherited from parent base
    assert.equal(result.model, 'parent-model'); // inherited provider block, applied after extends merge
  });

  it('guards extends cycles (returns the partial chain, does not loop)', () => {
    const modelConfig: ModelConfig = {
      skills: [
        { id: 'a', name: 'A', extends: 'b', base: { temperature: 0.1 } },
        { id: 'b', name: 'B', extends: 'a', base: { maxTokens: 50 } },
      ],
    };
    const result = resolveEffectiveLLMChatV2Data(modelConfig, { llmSkillId: 'a' }, node({ provider: 'openai' }));
    assert.equal(result.temperature, 0.1);
    assert.equal(result.maxTokens, 50);
  });
});

describe('resolveEffectiveLLMChatV2Data — headers per-key merge (not replace)', () => {
  const profile: LlmProfile = {
    id: 'prof',
    name: 'P',
    provider: 'openai',
    headers: { authorization: 'Bearer profile', 'x-team': 'qa' },
  };

  it('a node header no longer drops the profile connection headers (per-key merge, node wins)', () => {
    const result = resolveEffectiveLLMChatV2Data(
      { profiles: [profile] },
      { llmProfileId: 'prof' },
      node({ headers: [{ key: 'x-team', value: 'override' }, { key: 'x-trace', value: 'on' }] }),
    );
    const asRecord = Object.fromEntries(result.headers.map((h) => [h.key, h.value]));
    assert.equal(asRecord['authorization'], 'Bearer profile'); // profile header preserved
    assert.equal(asRecord['x-team'], 'override'); // node wins on the shared key
    assert.equal(asRecord['x-trace'], 'on'); // node-only header kept
  });

  it('profile-only headers apply when the node has none', () => {
    const result = resolveEffectiveLLMChatV2Data({ profiles: [profile] }, { llmProfileId: 'prof' }, node());
    assert.deepEqual(
      result.headers.sort((a, b) => a.key.localeCompare(b.key)),
      [
        { key: 'authorization', value: 'Bearer profile' },
        { key: 'x-team', value: 'qa' },
      ],
    );
  });

  it('rail-safe: with no Profile/override headers layered, the node headers are untouched', () => {
    const nodeHeaders = [{ key: 'x-own', value: '1' }];
    const result = resolveEffectiveLLMChatV2Data(
      { skills: [{ id: 's', name: 'S', base: { temperature: 0.1 } }] },
      { llmSkillId: 's' },
      node({ headers: nodeHeaders }),
    );
    assert.deepEqual(result.headers, nodeHeaders);
  });
});

describe('resolveEffectiveLLMChatV2Data — extraBody escape hatch (custom-only)', () => {
  it('serializes merged extraBody into extraProviderOptions for a custom provider', () => {
    const skill: LlmSkill = {
      id: 's',
      name: 'S',
      base: { extraBody: { chat_template_kwargs: { enable_thinking: false } } },
    };
    const result = resolveEffectiveLLMChatV2Data(
      { skills: [skill] },
      { llmSkillId: 's' },
      node({ provider: 'custom', customProviderBaseURL: 'http://x' }),
    );
    assert.deepEqual(JSON.parse(result.extraProviderOptions), { chat_template_kwargs: { enable_thinking: false } });
  });

  it('does NOT touch extraProviderOptions for a hosted provider (custom-only)', () => {
    const skill: LlmSkill = { id: 's', name: 'S', base: { extraBody: { foo: 1 } } };
    const result = resolveEffectiveLLMChatV2Data({ skills: [skill] }, { llmSkillId: 's' }, node({ provider: 'openai' }));
    assert.equal(result.extraProviderOptions, ''); // unchanged default
  });

  it('precedence Node > Preset.overrides > providers.custom > base, with stable key order', () => {
    const modelConfig: ModelConfig = {
      skills: [
        {
          id: 's',
          name: 'S',
          base: { extraBody: { a: 'base', b: 'base' } },
          providers: { custom: { extraBody: { b: 'block', c: 'block' } } },
        },
      ],
      presets: [{ id: 'pre', name: 'Pre', profileId: 'prof', skillId: 's', overrides: { extraBody: { c: 'override', d: 'override' } } }],
      profiles: [{ id: 'prof', name: 'P', provider: 'custom', customProviderBaseURL: 'http://x' }],
    };
    const result = resolveEffectiveLLMChatV2Data(
      modelConfig,
      { llmPresetId: 'pre' },
      node({ provider: 'custom', extraProviderOptions: JSON.stringify({ d: 'node', e: 'node' }) }),
    );
    assert.deepEqual(JSON.parse(result.extraProviderOptions), {
      a: 'base',
      b: 'block',
      c: 'override',
      d: 'node',
      e: 'node',
    });
    // Stable key order: serialization is deterministically sorted.
    assert.equal(result.extraProviderOptions, '{"a":"base","b":"block","c":"override","d":"node","e":"node"}');
  });
});
