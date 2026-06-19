import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeNodeComposition,
  computeOverriddenModelConfigFields,
} from '../../src/model/LlmPresetResolution.js';
import type { LlmPreset, LlmProfile, LlmSkill, Settings } from '../../src/model/Settings.js';

const profile: LlmProfile = {
  id: 'p',
  name: 'P',
  endpoint: 'http://profile/v1',
  defaultModel: 'qwen',
  headers: { 'x-shared': 'profile' },
};
const skill: LlmSkill = {
  id: 's',
  name: 'S',
  temperature: 0.7,
  maxTokens: 2048,
  extraBody: { chat_template_kwargs: { enable_thinking: false } },
};
const preset: LlmPreset = { id: 'pr', name: 'PR', profileId: 'p', skillId: 's' };

const settings: Settings = { modelConfig: { profiles: [profile], skills: [skill], presets: [preset] } };

// Minimal ChatNode defaults relevant to the override rule.
const DEFAULTS = { model: 'gpt-5', temperature: 0.5, top_p: 1, useTopP: false, maxTokens: 1024, stop: '' };

describe('describeNodeComposition', () => {
  it('composes the per-field values from the selected preset, excluding the node', () => {
    const composed = describeNodeComposition(settings, { llmPresetId: 'pr' });
    assert.equal(composed.model, 'qwen');
    assert.equal(composed.endpoint, 'http://profile/v1');
    assert.equal(composed.temperature, 0.7);
    assert.equal(composed.maxTokens, 2048);
    assert.deepEqual(composed.headers, { 'x-shared': 'profile' });
    // extraBody is the Skill (+ preset override) merge, NOT the node's own.
    assert.deepEqual(composed.extraBody, { chat_template_kwargs: { enable_thinking: false } });
  });

  it('has no opinion (all undefined) when nothing is selected and no default preset', () => {
    const composed = describeNodeComposition(settings, {});
    assert.equal(composed.model, undefined);
    assert.equal(composed.temperature, undefined);
    assert.equal(composed.extraBody, undefined);
  });

  it('a preset override wins over the skill/profile in the composed value', () => {
    const withOverride: Settings = {
      modelConfig: {
        profiles: [profile],
        skills: [skill],
        presets: [{ ...preset, overrides: { temperature: 0.1, defaultModel: 'claude' } }],
      },
    };
    const composed = describeNodeComposition(withOverride, { llmPresetId: 'pr' });
    assert.equal(composed.temperature, 0.1);
    assert.equal(composed.model, 'claude');
  });
});

describe('computeOverriddenModelConfigFields', () => {
  const composed = describeNodeComposition(settings, { llmPresetId: 'pr' });

  it('no badges when the node leaves preset-set fields at their defaults (skill fills them)', () => {
    const data = { ...DEFAULTS };
    const overridden = computeOverriddenModelConfigFields(composed, data, DEFAULTS);
    // model: node 'gpt-5' (truthy) differs from composed 'qwen' → that IS an override.
    assert.deepEqual([...overridden].sort(), ['model']);
  });

  it('badges a behavior field only when set (≠ default) AND ≠ composed', () => {
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, temperature: 0.9 }, DEFAULTS).has('temperature'), true);
    // equals composed (≠ default but matches the skill) → no badge
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, temperature: 0.7 }, DEFAULTS).has('temperature'), false);
    // at default → skill fills → no badge
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, temperature: 0.5 }, DEFAULTS).has('temperature'), false);
  });

  it('does not badge fields the composition has no opinion on (preset-less node)', () => {
    const empty = describeNodeComposition(settings, {});
    const overridden = computeOverriddenModelConfigFields(empty, { ...DEFAULTS, temperature: 0.9, model: 'gpt-4' }, DEFAULTS);
    assert.equal(overridden.size, 0);
  });

  it('connection: model uses overrideModel || model; endpoint badges only when set', () => {
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, model: 'qwen' }, DEFAULTS).has('model'), false);
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, overrideModel: 'gpt-4o' }, DEFAULTS).has('model'), true);
    // endpoint unset → inherits
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS }, DEFAULTS).has('endpoint'), false);
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, endpoint: 'http://node/v1' }, DEFAULTS).has('endpoint'), true);
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, endpoint: 'http://profile/v1' }, DEFAULTS).has('endpoint'), false);
  });

  it('headers: badges a shadowing key with a different value, not additive keys', () => {
    const shadow = computeOverriddenModelConfigFields(composed, { ...DEFAULTS, headers: [{ key: 'x-shared', value: 'node' }] }, DEFAULTS);
    assert.equal(shadow.has('headers'), true);
    const additive = computeOverriddenModelConfigFields(composed, { ...DEFAULTS, headers: [{ key: 'x-new', value: 'v' }] }, DEFAULTS);
    assert.equal(additive.has('headers'), false);
    const same = computeOverriddenModelConfigFields(composed, { ...DEFAULTS, headers: [{ key: 'x-shared', value: 'profile' }] }, DEFAULTS);
    assert.equal(same.has('headers'), false);
  });

  it('extraBody: badges a non-empty differing object; inherits when unset/empty/equal', () => {
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, extraBody: { chat_template_kwargs: { enable_thinking: true } } }, DEFAULTS).has('extraBody'), true);
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS }, DEFAULTS).has('extraBody'), false);
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, extraBody: {} }, DEFAULTS).has('extraBody'), false);
    assert.equal(computeOverriddenModelConfigFields(composed, { ...DEFAULTS, extraBody: { chat_template_kwargs: { enable_thinking: false } } }, DEFAULTS).has('extraBody'), false);
  });
});
