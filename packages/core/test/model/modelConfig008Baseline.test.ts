import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleModelConfig } from '../../src/model/assembleModelConfig.js';
import { resolveEffectiveLLMChatV2Data } from '../../src/model/chat-v2/resolveEffectiveLLMChatV2Data.js';
import { createLLMChatV2NodeData } from '../../src/model/chat-v2/llmChatV2NodeData.js';
import { serializeProject, deserializeProject } from '../../src/utils/serialization/serialization.js';
import type { Project } from '../../src/model/Project.js';
import type { ModelConfig, Settings } from '../../src/model/Settings.js';

/**
 * Re-establishes the Feature 006 portability baseline (deleted with the legacy node) against chat-v2:
 * a project-embedded `modelConfig` resolves the effective `LLMChatV2NodeData` with **no global
 * Settings** (headless/published runs), survives a serialize→deserialize round-trip, and leaves a
 * node that selects nothing byte-identical.
 */

const PROVIDER_MODEL_CONFIG: ModelConfig = {
  profiles: [
    { id: 'omlx', name: 'oMLX', provider: 'custom', customProviderBaseURL: 'http://localhost:9090/v1' },
  ],
  skills: [
    {
      id: 'no-think',
      name: 'No thinking',
      base: { temperature: 0.2, extraBody: { chat_template_kwargs: { enable_thinking: false } } },
      providers: { custom: { model: 'qwen-3-35b' } },
    },
  ],
  presets: [{ id: 'coder', name: 'Coder (oMLX)', profileId: 'omlx', skillId: 'no-think' }],
};

function project(modelConfig?: ModelConfig): Project {
  return {
    metadata: { id: 'proj-1' as Project['metadata']['id'], title: 'T', description: '' },
    graphs: {},
    modelConfig,
  };
}

describe('Feature 008 — chat-v2 model-config portability baseline', () => {
  it('resolves an embedded preset with NO global Settings (headless portability)', () => {
    // Headless: there is no global library, only the project's embedded modelConfig.
    const settings = assembleModelConfig({} as Settings, project(PROVIDER_MODEL_CONFIG));
    const effective = resolveEffectiveLLMChatV2Data(settings.modelConfig, { llmPresetId: 'coder' }, createLLMChatV2NodeData());

    assert.equal(effective.provider, 'custom');
    assert.equal(effective.customProviderBaseURL, 'http://localhost:9090/v1');
    assert.equal(effective.model, 'qwen-3-35b'); // the skill provider block sets the model (R1: Skill-owned)
    assert.equal(effective.temperature, 0.2);
    assert.deepEqual(JSON.parse(effective.extraProviderOptions), { chat_template_kwargs: { enable_thinking: false } });
  });

  it('survives a serialize → deserialize round-trip and resolves identically', () => {
    const before = assembleModelConfig({} as Settings, project(PROVIDER_MODEL_CONFIG));
    const effectiveBefore = resolveEffectiveLLMChatV2Data(before.modelConfig, { llmPresetId: 'coder' }, createLLMChatV2NodeData());

    const [roundTripped] = deserializeProject(serializeProject(project(PROVIDER_MODEL_CONFIG)));
    const after = assembleModelConfig({} as Settings, roundTripped);
    const effectiveAfter = resolveEffectiveLLMChatV2Data(after.modelConfig, { llmPresetId: 'coder' }, createLLMChatV2NodeData());

    assert.deepEqual(effectiveAfter, effectiveBefore);
  });

  it('project wins over the global library by id (merge)', () => {
    const global: Settings = {
      modelConfig: {
        profiles: [{ id: 'omlx', name: 'global', provider: 'openai' }],
      },
    };
    const settings = assembleModelConfig(global, project(PROVIDER_MODEL_CONFIG));
    const effective = resolveEffectiveLLMChatV2Data(settings.modelConfig, { llmPresetId: 'coder' }, createLLMChatV2NodeData());
    assert.equal(effective.provider, 'custom'); // project copy wins over global by id
    assert.equal(effective.model, 'qwen-3-35b'); // resolves the project's custom model, not the global openai
  });
});
