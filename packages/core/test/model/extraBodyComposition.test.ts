import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNodeModelComposition } from '../../src/model/LlmPresetResolution.js';
import { resolveSkill } from '../../src/model/LlmSkillResolution.js';
import type { LlmPreset, LlmSkill, Settings } from '../../src/model/Settings.js';

function settings(parts: { skills?: LlmSkill[]; presets?: LlmPreset[] }): Settings {
  return { llmSkills: parts.skills ?? [], llmPresets: parts.presets ?? [], llmProfiles: [] } as Settings;
}

describe('extraBody deep-merge across the Skill extends chain', () => {
  it('combines parent and child extraBody (child wins per key)', () => {
    const skills: LlmSkill[] = [
      { id: 'base', name: 'Base', extraBody: { chat_template_kwargs: { enable_thinking: false }, top_k: 40 } },
      { id: 'child', name: 'Child', extends: 'base', extraBody: { chat_template_kwargs: { add_generation_prompt: true } } },
    ];
    assert.deepEqual(resolveSkill(settings({ skills }), 'child').extraBody, {
      chat_template_kwargs: { enable_thinking: false, add_generation_prompt: true },
      top_k: 40,
    });
  });
});

describe('extraBody composition (Node > Preset.override > Skill, deep)', () => {
  const skills: LlmSkill[] = [
    { id: 'terse', name: 'Terse', extraBody: { chat_template_kwargs: { enable_thinking: false }, top_k: 40 } },
  ];

  it('node selecting only a skill gets the skill extraBody', () => {
    const { extraBody } = resolveNodeModelComposition(settings({ skills }), { llmSkillId: 'terse' });
    assert.deepEqual(extraBody, { chat_template_kwargs: { enable_thinking: false }, top_k: 40 });
  });

  it('preset override deep-merges over its skill (preset wins per key)', () => {
    const presets: LlmPreset[] = [
      {
        id: 'P',
        name: 'P',
        profileId: 'x',
        skillId: 'terse',
        overrides: { extraBody: { chat_template_kwargs: { enable_thinking: true }, repetition_penalty: 1.1 } },
      },
    ];
    const { extraBody } = resolveNodeModelComposition(settings({ skills, presets }), { llmPresetId: 'P' });
    assert.deepEqual(extraBody, {
      chat_template_kwargs: { enable_thinking: true }, // preset overrides skill's false
      top_k: 40, // from skill
      repetition_penalty: 1.1, // from preset override
    });
  });

  it('node extraBody wins over preset and skill, deep per key', () => {
    const presets: LlmPreset[] = [
      {
        id: 'P',
        name: 'P',
        profileId: 'x',
        skillId: 'terse',
        overrides: { extraBody: { chat_template_kwargs: { enable_thinking: true } } },
      },
    ];
    const { extraBody } = resolveNodeModelComposition(settings({ skills, presets }), {
      llmPresetId: 'P',
      extraBody: { chat_template_kwargs: { add_generation_prompt: false }, top_k: 5 },
    });
    assert.deepEqual(extraBody, {
      chat_template_kwargs: { enable_thinking: true, add_generation_prompt: false }, // skill+preset+node combine
      top_k: 5, // node overrides skill's 40
    });
  });

  it('empty at all levels → {} (byte-identical rail)', () => {
    assert.deepEqual(resolveNodeModelComposition(settings({}), {}).extraBody, {});
  });
});
