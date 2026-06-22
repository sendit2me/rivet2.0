import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMChatV2NodeData, type LLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import {
  resolveEffectiveLLMChatV2Data,
  assessLLMChatV2Completeness,
} from '../../../src/model/chat-v2/resolveEffectiveLLMChatV2Data.js';
import type { LlmProfile, LlmSkill, ModelConfig } from '../../../src/model/Settings.js';

function node(overrides: Partial<LLMChatV2NodeData> = {}): LLMChatV2NodeData {
  return { ...createLLMChatV2NodeData(), ...overrides };
}
// A complete binding: a custom Profile (connection) + a Skill that sets the model on its provider block.
const omlx: LlmProfile = { id: 'omlx', name: 'oMLX', provider: 'custom', customProviderBaseURL: 'http://x/v1' };
const coder = (base: LlmSkill['base'] = {}): LlmSkill => ({
  id: 's',
  name: 'S',
  base,
  providers: { custom: { model: 'Qwen-X' } },
});

describe('resolveEffectiveLLMChatV2Data — R2 overlap-deletion (config-less binding)', () => {
  it('bound: model-config comes ONLY from the layer; the node’s own model-config is ignored', () => {
    const cfg: ModelConfig = { profiles: [omlx], skills: [coder({ temperature: 0.2 })] };
    // The node carries non-default model-config (the old gpt-5 collision case) — it must be IGNORED.
    const eff = resolveEffectiveLLMChatV2Data(cfg, { llmProfileId: 'omlx', llmSkillId: 's' }, node({ model: 'node-model', temperature: 0.9 }));
    assert.equal(eff.provider, 'custom'); // from Profile
    assert.equal(eff.model, 'Qwen-X'); // from Skill block — NOT the node's 'node-model'
    assert.equal(eff.temperature, 0.2); // from Skill base — NOT the node's 0.9
  });

  it('layer-unset optional params are OMITTED (provider-defaulted), not back-filled to the node default', () => {
    const cfg: ModelConfig = { profiles: [omlx], skills: [coder({ temperature: 0.2 })] };
    const eff = resolveEffectiveLLMChatV2Data(cfg, { llmProfileId: 'omlx', llmSkillId: 's' }, node({ topP: 0.3 }));
    assert.equal(eff.temperature, 0.2);
    assert.equal(eff.topP, undefined); // layer left topP unset → omitted (NOT the node's 0.3 nor a default)
    assert.equal(eff.maxTokens, undefined);
  });

  it('node-OWNED fields (Q6 structural/output-contract + per-call) survive verbatim', () => {
    const cfg: ModelConfig = { profiles: [omlx], skills: [coder()] };
    const eff = resolveEffectiveLLMChatV2Data(
      cfg,
      { llmProfileId: 'omlx', llmSkillId: 's' },
      node({ responseFormat: 'json', useToolCalling: true, maxToolRounds: 7, outputUsage: true, openAIPreviousResponseId: 'resp_1' }),
    );
    assert.equal(eff.responseFormat, 'json'); // output contract — node-owned (NOT layer)
    assert.equal(eff.useToolCalling, true);
    assert.equal(eff.maxToolRounds, 7);
    assert.equal(eff.outputUsage, true);
    assert.equal(eff.openAIPreviousResponseId, 'resp_1'); // per-call — node-owned
  });

  it('Skill fan-out: base + the resolved provider’s block (needs a Profile for the provider)', () => {
    const skill: LlmSkill = {
      id: 's',
      name: 'S',
      base: { temperature: 0.4 },
      providers: { custom: { model: 'Qwen-X', enableOpenAICodeInterpreter: true } as never },
    };
    const eff = resolveEffectiveLLMChatV2Data({ profiles: [omlx], skills: [skill] }, { llmProfileId: 'omlx', llmSkillId: 's' }, node());
    assert.equal(eff.temperature, 0.4);
    assert.equal(eff.model, 'Qwen-X');
  });

  it('headers are LAYER-ONLY: the node’s own headers no longer merge in', () => {
    const profile: LlmProfile = { ...omlx, headers: { 'x-team': 'qa' } };
    const eff = resolveEffectiveLLMChatV2Data(
      { profiles: [profile], skills: [coder()] },
      { llmProfileId: 'omlx', llmSkillId: 's' },
      node({ headers: [{ key: 'x-node', value: 'leak' }] }),
    );
    assert.deepEqual(eff.headers, [{ key: 'x-team', value: 'qa' }]); // node header dropped
  });

  it('extraBody (custom) is LAYER-ONLY: the node’s own extraProviderOptions is ignored', () => {
    const skill: LlmSkill = { id: 's', name: 'S', base: { extraBody: { a: 1 } }, providers: { custom: { model: 'Qwen-X' } } };
    const eff = resolveEffectiveLLMChatV2Data(
      { profiles: [omlx], skills: [skill] },
      { llmProfileId: 'omlx', llmSkillId: 's' },
      node({ extraProviderOptions: '{"node":"leak"}' }),
    );
    assert.deepEqual(JSON.parse(eff.extraProviderOptions), { a: 1 }); // no node "leak"
  });

  it('reasoning-level maps to the resolved provider’s effort field', () => {
    const openai: LlmProfile = { id: 'p', name: 'P', provider: 'openai' };
    const skill: LlmSkill = { id: 's', name: 'S', base: { reasoningLevel: 'high' }, providers: { openai: { model: 'gpt-x' } } };
    const eff = resolveEffectiveLLMChatV2Data({ profiles: [openai], skills: [skill] }, { llmProfileId: 'p', llmSkillId: 's' }, node());
    assert.equal(eff.openAIReasoningEffort, 'high');
  });

  it('Preset.overrides apply to layer-owned fields; a node-owned override field is ignored', () => {
    const cfg: ModelConfig = {
      profiles: [omlx],
      skills: [coder({ temperature: 0.2 })],
      presets: [{ id: 'pre', name: 'Pre', profileId: 'omlx', skillId: 's', overrides: { temperature: 0.7, maxToolRounds: 9 } }],
    };
    const eff = resolveEffectiveLLMChatV2Data(cfg, { llmPresetId: 'pre' }, node({ maxToolRounds: 3 }));
    assert.equal(eff.temperature, 0.7); // layer-owned override wins
    assert.equal(eff.maxToolRounds, 3); // node-owned → from the node, the override is ignored
  });

  it('full-chain kind-guard: a chat skill that extends an IMAGE skill is rejected whole (no image model leaks)', () => {
    const cfg: ModelConfig = {
      profiles: [omlx],
      skills: [
        { id: 'img', name: 'img', kind: 'text-to-image', providers: { custom: { model: 'sdxl' } } },
        { id: 'chat', name: 'chat', extends: 'img', base: { temperature: 0.3 } },
      ],
    };
    const eff = resolveEffectiveLLMChatV2Data(cfg, { llmProfileId: 'omlx', llmSkillId: 'chat' }, node());
    assert.notEqual(eff.model, 'sdxl'); // the image parent's model did NOT leak through the chain
    assert.equal(eff.model, undefined); // the whole skill binding was rejected → no model → incomplete
  });
});

describe('assessLLMChatV2Completeness — incomplete-until-bound', () => {
  const assess = (selectors: Parameters<typeof resolveEffectiveLLMChatV2Data>[1], cfg: ModelConfig) =>
    assessLLMChatV2Completeness(resolveEffectiveLLMChatV2Data(cfg, selectors, node()));

  it('nothing bound → incomplete (no connection, no model)', () => {
    assert.equal(assess({}, {}).complete, false);
  });

  it('Profile only → incomplete (connection but no model)', () => {
    const r = assess({ llmProfileId: 'omlx' }, { profiles: [omlx] });
    assert.equal(r.complete, false);
    assert.match(r.reason!, /model/);
  });

  it('Skill only → incomplete (no connection/provider to select a block)', () => {
    const r = assess({ llmSkillId: 's' }, { skills: [coder()] });
    assert.equal(r.complete, false);
    assert.match(r.reason!, /connection/);
  });

  it('Profile + Skill → complete', () => {
    assert.equal(assess({ llmProfileId: 'omlx', llmSkillId: 's' }, { profiles: [omlx], skills: [coder()] }).complete, true);
  });

  it('a Preset bundling both → complete', () => {
    const cfg: ModelConfig = {
      profiles: [omlx],
      skills: [coder()],
      presets: [{ id: 'pre', name: 'Pre', profileId: 'omlx', skillId: 's' }],
    };
    assert.equal(assess({ llmPresetId: 'pre' }, cfg).complete, true);
  });

  it('custom provider without a base URL → incomplete', () => {
    const noUrl: LlmProfile = { id: 'omlx', name: 'oMLX', provider: 'custom' };
    assert.equal(assess({ llmProfileId: 'omlx', llmSkillId: 's' }, { profiles: [noUrl], skills: [coder()] }).complete, false);
  });
});
