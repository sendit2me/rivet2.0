import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import {
  resolveEffectiveLLMChatV2Data,
  getSkillKind,
  flattenSkillChain,
} from '../../../src/model/chat-v2/resolveEffectiveLLMChatV2Data.js';
import type { ImageSkill, LlmProfile, LlmSkill, ModelConfig } from '../../../src/model/Settings.js';

describe('R1 — Skill signature (kind), model→Skill, and the forcing fixture', () => {
  it('getSkillKind: absent kind defaults to text-to-text; image skill reports its kind', () => {
    assert.equal(getSkillKind({}), 'text-to-text');
    assert.equal(getSkillKind({ kind: 'text-to-text' }), 'text-to-text');
    assert.equal(getSkillKind({ kind: 'text-to-image' }), 'text-to-image');
  });

  it('an ImageSkill is a valid, round-trippable LlmSkill (non-chat shape: width/height + provider model)', () => {
    const img: ImageSkill = {
      id: 'sdxl',
      name: 'SDXL',
      kind: 'text-to-image',
      base: { width: 1024, height: 1024 },
      providers: { custom: { model: 'sdxl-turbo' } },
    };
    const cfg: ModelConfig = { skills: [img] };
    const roundTripped = JSON.parse(JSON.stringify(cfg)) as ModelConfig;
    assert.deepEqual(roundTripped.skills![0], img); // kind + image-shaped fields survive serialization
  });

  it('the chat selector excludes a non-chat Skill (the kind-filter predicate)', () => {
    const skills: LlmSkill[] = [
      { id: 'chat', name: 'chat', base: { temperature: 0.5 } }, // absent kind = text-to-text
      { id: 'img', name: 'img', kind: 'text-to-image', base: { width: 512 } },
    ];
    const shownToChatNode = skills.filter((s) => getSkillKind(s) === 'text-to-text');
    assert.deepEqual(
      shownToChatNode.map((s) => s.id),
      ['chat'],
    );
  });

  it('flattenSkillChain composes an image base+provider across extends (kind-agnostic merge)', () => {
    const parent: ImageSkill = { id: 'imgbase', name: 'base', kind: 'text-to-image', base: { width: 512 } };
    const child: ImageSkill = {
      id: 'sdxl',
      name: 'sdxl',
      kind: 'text-to-image',
      extends: 'imgbase',
      base: { height: 768 },
      providers: { custom: { model: 'sdxl' } },
    };
    const byId = new Map<string, LlmSkill>([
      [parent.id, parent],
      [child.id, child],
    ]);
    const flat = flattenSkillChain(byId, 'sdxl');
    const base = flat.base as Record<string, unknown>;
    assert.equal(base.width, 512); // inherited from the parent base
    assert.equal(base.height, 768); // the child's own
    assert.equal((flat.providers.custom as Record<string, unknown>).model, 'sdxl'); // provider layer
  });

  it('Gap A: a chat node ignores an image skill, however the id arrives (the input-driven path)', () => {
    const profile: LlmProfile = { id: 'p', name: 'p', provider: 'custom', customProviderBaseURL: 'http://x/v1' };
    const img: ImageSkill = { id: 'img', name: 'img', kind: 'text-to-image', providers: { custom: { model: 'sdxl' } } };
    const cfg: ModelConfig = { profiles: [profile], skills: [img] };
    const node = createLLMChatV2NodeData();

    const withImage = resolveEffectiveLLMChatV2Data(cfg, { llmProfileId: 'p', llmSkillId: 'img' }, node);
    const profileOnly = resolveEffectiveLLMChatV2Data(cfg, { llmProfileId: 'p' }, node);
    assert.deepEqual(withImage, profileOnly); // the image skill contributed nothing
    assert.notEqual(withImage.model, 'sdxl'); // and did not leak the image model
  });

  it('the chat model now comes from the Skill provider block (Profile carries no model)', () => {
    const profile: LlmProfile = { id: 'p', name: 'p', provider: 'custom', customProviderBaseURL: 'http://x/v1' };
    const chatSkill: LlmSkill = { id: 's', name: 's', base: { temperature: 0.3 }, providers: { custom: { model: 'Qwen-X' } } };
    const cfg: ModelConfig = { profiles: [profile], skills: [chatSkill] };
    const node = createLLMChatV2NodeData();

    const eff = resolveEffectiveLLMChatV2Data(cfg, { llmProfileId: 'p', llmSkillId: 's' }, node);
    assert.equal(eff.provider, 'custom');
    assert.equal(eff.model, 'Qwen-X'); // from the skill's per-provider block (not the profile)
    assert.equal(eff.temperature, 0.3); // from the skill base
  });

  it('rail: no selectors → identity (unchanged by R1)', () => {
    const node = createLLMChatV2NodeData();
    assert.equal(resolveEffectiveLLMChatV2Data({ skills: [] }, {}, node), node); // same reference
  });
});
