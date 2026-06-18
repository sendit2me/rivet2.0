import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNodeModelComposition } from '../../src/model/LlmPresetResolution.js';
import { assembleModelConfig } from '../../src/model/assembleModelConfig.js';
import type { Project } from '../../src/model/Project.js';
import type { LlmPreset, LlmProfile, LlmSkill, Settings } from '../../src/model/Settings.js';

/**
 * Feature 006 byte-identical rail: a project that *carries* a `modelConfig` but whose node selects
 * nothing must resolve **exactly** as a project that carries none — the embedded entities only take
 * effect when a node references them (or a preset is flagged default). This pins the SPEC §5 claim
 * "byte-identical regardless of what the project carries".
 */
describe('Feature 006 — byte-identical with a carried (but unselected) modelConfig', () => {
  const profiles: LlmProfile[] = [{ id: 'p-claude', name: 'Claude', defaultModel: 'claude-opus-4-8' }];
  const skills: LlmSkill[] = [{ id: 's-dev', name: 'Dev', systemPrompt: 'You are a developer.' }];
  // No `isDefault` — a default preset is opt-in and would (correctly) apply to a no-selection node.
  const presets: LlmPreset[] = [{ id: 'pr-x', name: 'X', profileId: 'p-claude', skillId: 's-dev' }];

  function project(): Project {
    return {
      metadata: { id: 'proj' as Project['metadata']['id'], title: 'T', description: '' },
      graphs: {},
      modelConfig: { profiles, skills, presets },
    };
  }

  const noSelection = { llmPresetId: undefined, llmProfileId: undefined, llmSkillId: undefined };

  it('a no-selection node resolves identically whether or not the project carries a modelConfig', () => {
    const withConfig: Settings = assembleModelConfig({}, project());
    const withoutConfig: Settings = assembleModelConfig({}, {
      metadata: { id: 'proj' as Project['metadata']['id'], title: 'T', description: '' },
      graphs: {},
    });

    const resolvedWith = resolveNodeModelComposition(withConfig, noSelection);
    const resolvedWithout = resolveNodeModelComposition(withoutConfig, noSelection);

    assert.deepEqual(resolvedWith, resolvedWithout);
    // …and concretely empty: no profile/skill connection or behavior injected.
    assert.deepEqual(resolvedWith, { profile: {}, skill: {}, extraBody: {} });
  });

  it('the same node DOES resolve to the carried entities once it selects one (portability proof)', () => {
    const withConfig: Settings = assembleModelConfig({}, project());
    const resolved = resolveNodeModelComposition(withConfig, {
      llmProfileId: 'p-claude',
      llmSkillId: 's-dev',
      llmPresetId: undefined,
    });
    assert.equal(resolved.profile.defaultModel, 'claude-opus-4-8');
    assert.equal(resolved.skill.systemPrompt, 'You are a developer.');
  });
});
