import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleModelConfig, mergeModelConfig } from '../../src/model/assembleModelConfig.js';
import type { Project } from '../../src/model/Project.js';
import type { LlmProfile, ModelConfig, Settings } from '../../src/model/Settings.js';

const profile = (id: string, defaultModel: string): LlmProfile => ({ id, name: id, defaultModel });

function project(modelConfig?: ModelConfig): Project {
  return {
    metadata: { id: 'proj-1' as Project['metadata']['id'], title: 'T', description: '' },
    graphs: {},
    modelConfig,
  };
}

describe('mergeModelConfig', () => {
  it('merges by id with the project winning over the global library', () => {
    const merged = mergeModelConfig(
      { profiles: [profile('a', 'project-model'), profile('b', 'qwen')] },
      { profiles: [profile('a', 'global-model'), profile('c', 'claude')] },
    );
    // 'a' resolves to the project copy; 'b' (project-only) and 'c' (global-only) both survive.
    assert.deepEqual(merged.profiles, [
      profile('a', 'project-model'),
      profile('b', 'qwen'),
      profile('c', 'claude'),
    ]);
  });

  it('keeps an absent axis absent (does not synthesize empty arrays)', () => {
    const merged = mergeModelConfig({ profiles: [profile('a', 'm')] }, {});
    assert.deepEqual(merged.profiles, [profile('a', 'm')]);
    assert.equal(merged.skills, undefined);
    assert.equal(merged.presets, undefined);
  });

  it('handles both sides empty/undefined', () => {
    assert.deepEqual(mergeModelConfig(undefined, undefined), {
      profiles: undefined,
      skills: undefined,
      presets: undefined,
    });
  });
});

describe('assembleModelConfig', () => {
  it('folds the project model-config over the global, project winning', () => {
    const global: Settings = {
      openAiKey: 'gk',
      modelConfig: { profiles: [profile('a', 'global'), profile('g', 'global-only')] },
    };
    const result = assembleModelConfig(global, project({ profiles: [profile('a', 'project')] }));
    assert.deepEqual(result.modelConfig?.profiles, [profile('a', 'project'), profile('g', 'global-only')]);
  });

  it('carries every other settings field through untouched', () => {
    const global: Settings = {
      openAiKey: 'gk',
      openAiEndpoint: 'https://example/v1',
      chatNodeHeaders: { 'x-h': '1' },
      modelConfig: {},
    };
    const result = assembleModelConfig(global, project());
    assert.equal(result.openAiKey, 'gk');
    assert.equal(result.openAiEndpoint, 'https://example/v1');
    assert.deepEqual(result.chatNodeHeaders, { 'x-h': '1' });
  });

  it('is pure — mutates neither the global settings nor the project', () => {
    const global: Settings = { modelConfig: { profiles: [profile('a', 'global')] } };
    const proj = project({ profiles: [profile('a', 'project'), profile('b', 'extra')] });
    const globalSnapshot = JSON.parse(JSON.stringify(global));
    const projSnapshot = JSON.parse(JSON.stringify(proj));

    const result = assembleModelConfig(global, proj);

    assert.notEqual(result, global);
    assert.notEqual(result.modelConfig, global.modelConfig);
    assert.deepEqual(global, globalSnapshot, 'global settings unchanged');
    assert.deepEqual(proj, projSnapshot, 'project unchanged');
  });

  it('a project carrying no model-config leaves the merged config empty (byte-identical rail)', () => {
    const result = assembleModelConfig({}, project());
    assert.deepEqual(result.modelConfig, { profiles: undefined, skills: undefined, presets: undefined });
  });
});
