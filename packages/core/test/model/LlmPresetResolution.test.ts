import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPresetOverridesToProfile,
  applyPresetOverridesToSkill,
  findDefaultPreset,
  resolveNodeModelComposition,
  resolvePreset,
} from '../../src/model/LlmPresetResolution.js';
import { resolveChatNodeConnection } from '../../src/model/LlmProfileResolution.js';
import { applySkillParams } from '../../src/model/LlmSkillResolution.js';
import { ChatNodeBase, type ChatNodeData } from '../../src/model/nodes/ChatNodeBase.js';
import { getInputOrData } from '../../src/utils/inputs.js';
import { DEFAULT_CHAT_ENDPOINT } from '../../src/utils/defaults.js';
import type { LlmPreset, LlmProfile, LlmSkill, Settings } from '../../src/model/Settings.js';
import type { Inputs } from '../../src/model/GraphProcessor.js';

function makeSettings(parts: {
  profiles?: LlmProfile[];
  skills?: LlmSkill[];
  presets?: LlmPreset[];
  openAiEndpoint?: string;
  openAiKey?: string;
}): Settings {
  return {
    llmProfiles: parts.profiles ?? [],
    llmSkills: parts.skills ?? [],
    llmPresets: parts.presets ?? [],
    openAiEndpoint: parts.openAiEndpoint,
    openAiKey: parts.openAiKey,
  } as Settings;
}

describe('resolvePreset', () => {
  it('returns empty for an empty/undefined id', () => {
    assert.deepEqual(resolvePreset(makeSettings({}), undefined), { profile: {}, skill: {}, overrides: {} });
  });

  it('traces and returns empty for an unknown id', () => {
    const traces: string[] = [];
    const result = resolvePreset(makeSettings({ presets: [{ id: 'p', name: 'P', profileId: 'x' }] }), 'missing', (m) =>
      traces.push(m),
    );
    assert.deepEqual(result, { profile: {}, skill: {}, overrides: {} });
    assert.match(traces[0]!, /preset 'missing' not found/);
  });

  it('expands to resolved profile + skill + overrides', () => {
    const settings = makeSettings({
      profiles: [{ id: 'prof', name: 'Prof', endpoint: 'http://p', apiKey: 'pk', defaultModel: 'qwen' }],
      skills: [{ id: 'sk', name: 'Sk', systemPrompt: 'be a dev', temperature: 0.3 }],
      presets: [{ id: 'P', name: 'P', profileId: 'prof', skillId: 'sk', overrides: { temperature: 0.6 } }],
    });
    assert.deepEqual(resolvePreset(settings, 'P'), {
      profile: { endpoint: 'http://p', apiKey: 'pk', defaultModel: 'qwen' },
      skill: { systemPrompt: 'be a dev', temperature: 0.3 },
      overrides: { temperature: 0.6 },
    });
  });

  it('traces and falls back per missing piece (unknown profileId / skillId)', () => {
    const traces: string[] = [];
    const settings = makeSettings({ presets: [{ id: 'P', name: 'P', profileId: 'ghostP', skillId: 'ghostS' }] });
    const result = resolvePreset(settings, 'P', (m) => traces.push(m));
    assert.deepEqual(result, { profile: {}, skill: {}, overrides: {} });
    assert.ok(traces.some((t) => /profile 'ghostP' not found/.test(t)));
    assert.ok(traces.some((t) => /skill 'ghostS' not found/.test(t)));
  });
});

describe('findDefaultPreset', () => {
  it('returns undefined when none is flagged (the byte-identical rail)', () => {
    assert.equal(findDefaultPreset(makeSettings({ presets: [{ id: 'p', name: 'P', profileId: 'x' }] })), undefined);
  });

  it('returns the flagged default', () => {
    const preset: LlmPreset = { id: 'd', name: 'D', profileId: 'x', isDefault: true };
    assert.equal(findDefaultPreset(makeSettings({ presets: [preset] }))?.id, 'd');
  });

  it('first wins and traces when several are flagged', () => {
    const traces: string[] = [];
    const presets: LlmPreset[] = [
      { id: 'a', name: 'A', profileId: 'x', isDefault: true },
      { id: 'b', name: 'B', profileId: 'y', isDefault: true },
    ];
    assert.equal(findDefaultPreset(makeSettings({ presets }), (m) => traces.push(m))?.id, 'a');
    assert.match(traces[0]!, /Multiple default/);
  });
});

describe('applyPresetOverrides* (overrides win; headers deep-merge)', () => {
  it('folds connection overrides onto the profile, deep-merging headers', () => {
    const merged = applyPresetOverridesToProfile(
      { endpoint: 'http://p', apiKey: 'pk', headers: { a: '1', shared: 'p' } },
      { apiKey: 'ovr', defaultModel: 'M', headers: { shared: 'o', b: '2' } },
    );
    assert.deepEqual(merged, {
      endpoint: 'http://p', // untouched
      apiKey: 'ovr', // overridden
      defaultModel: 'M', // added
      headers: { a: '1', shared: 'o', b: '2' }, // deep-merged, override wins
    });
  });

  it('folds behavior overrides onto the skill', () => {
    const merged = applyPresetOverridesToSkill(
      { systemPrompt: 'skill', temperature: 0.3, reasoningEffort: 'low' },
      { systemPrompt: 'ovr', temperature: 0.6 },
    );
    assert.deepEqual(merged, { systemPrompt: 'ovr', temperature: 0.6, reasoningEffort: 'low' });
  });
});

// ---- End-to-end composition: exercises the REAL chain the Chat node runs ----

const defaults = ChatNodeBase.defaultData();

function withData(overrides: Partial<ChatNodeData>): ChatNodeData {
  return { ...ChatNodeBase.defaultData(), ...overrides };
}

/** Mirror ChatNodeBase.process(): composition -> connection + skill params + systemPrompt. */
function compose(settings: Settings, data: ChatNodeData, inputs: Inputs = {}) {
  const { profile, skill } = resolveNodeModelComposition(settings, {
    llmPresetId: data.llmPresetId,
    llmProfileId: data.llmProfileId,
    llmSkillId: data.llmSkillId,
  });
  const params = applySkillParams(data, defaults, skill);
  const connection = resolveChatNodeConnection({
    profile,
    global: settings,
    node: { endpoint: data.endpoint, model: data.model, headers: {} },
    defaultEndpoint: DEFAULT_CHAT_ENDPOINT,
  });
  return {
    connection,
    temperature: getInputOrData(params, inputs, 'temperature', 'number'),
    systemPrompt: skill.systemPrompt,
  };
}

describe('Preset composition end-to-end (Node > Preset.overrides > Skill > Profile > Global)', () => {
  const profiles: LlmProfile[] = [
    { id: 'PA', name: 'A', endpoint: 'http://a', apiKey: 'kA', defaultModel: 'model-A' },
    { id: 'PB', name: 'B', endpoint: 'http://b', apiKey: 'kB', defaultModel: 'model-B' },
  ];
  const skills: LlmSkill[] = [{ id: 'sk', name: 'Sk', systemPrompt: 'skill-sp', temperature: 0.3 }];

  it('(a) byte-identical when no default preset is defined and the node selects nothing', () => {
    const settings = makeSettings({ profiles, skills, openAiEndpoint: 'http://global', openAiKey: 'gk' });
    const { connection, temperature, systemPrompt } = compose(settings, withData({ model: '' }));
    assert.equal(connection.endpoint, 'http://global'); // global, not any profile
    assert.equal(connection.apiKey, 'gk');
    assert.equal(temperature, 0.5); // node default, untouched
    assert.equal(systemPrompt, undefined); // nothing injected
  });

  it('default preset applies only when the node selects nothing', () => {
    const presets: LlmPreset[] = [{ id: 'D', name: 'D', profileId: 'PA', skillId: 'sk', isDefault: true }];
    const settings = makeSettings({ profiles, skills, presets, openAiEndpoint: 'http://global', openAiKey: 'gk' });
    // selects nothing -> inherits the default preset
    const applied = compose(settings, withData({ model: '' }));
    assert.equal(applied.connection.endpoint, 'http://a');
    assert.equal(applied.systemPrompt, 'skill-sp');
  });

  it('(b) all-or-nothing: a skill-only node does NOT inherit the default preset connection', () => {
    const presets: LlmPreset[] = [{ id: 'D', name: 'D', profileId: 'PA', skillId: 'sk', isDefault: true }];
    const settings = makeSettings({ profiles, skills, presets, openAiEndpoint: 'http://global', openAiKey: 'gk' });
    // node selects a skill -> opted out of the default preset -> global connection, chosen skill
    const { connection, systemPrompt } = compose(settings, withData({ model: '', llmSkillId: 'sk' }));
    assert.equal(connection.endpoint, 'http://global'); // NOT http://a
    assert.equal(connection.apiKey, 'gk');
    assert.equal(systemPrompt, 'skill-sp'); // the skill still applies
  });

  it('full precedence: preset overrides beat skill + profile for endpoint/key/temperature/systemPrompt', () => {
    const presets: LlmPreset[] = [
      {
        id: 'P',
        name: 'P',
        profileId: 'PA',
        skillId: 'sk',
        overrides: { endpoint: 'http://override', apiKey: 'kOvr', temperature: 0.6, systemPrompt: 'ovr-sp' },
      },
    ];
    const settings = makeSettings({ profiles, skills, presets });
    const { connection, temperature, systemPrompt } = compose(settings, withData({ model: '', llmPresetId: 'P' }));
    assert.equal(connection.endpoint, 'http://override'); // override > profile
    assert.equal(connection.apiKey, 'kOvr');
    assert.equal(temperature, 0.6); // override > skill, node at default
    assert.equal(systemPrompt, 'ovr-sp'); // override > skill
  });

  it('(c) Option-C survives overrides: a node value differing from default beats a preset override', () => {
    const presets: LlmPreset[] = [{ id: 'P', name: 'P', profileId: 'PA', overrides: { temperature: 0.7 } }];
    const settings = makeSettings({ profiles, presets });
    // node temperature 0.9 (typed, differs from default 0.5) must win over the override 0.7
    const { temperature } = compose(settings, withData({ model: '', llmPresetId: 'P', temperature: 0.9 }));
    assert.equal(temperature, 0.9);
  });

  it('node-typed endpoint beats a preset override (Node > Preset)', () => {
    const presets: LlmPreset[] = [{ id: 'P', name: 'P', profileId: 'PA', overrides: { endpoint: 'http://override' } }];
    const settings = makeSettings({ profiles, presets });
    const { connection } = compose(settings, withData({ model: '', llmPresetId: 'P', endpoint: 'http://node' }));
    assert.equal(connection.endpoint, 'http://node');
  });

  it('preset vs explicit: a node llmProfileId replaces the preset profile piece', () => {
    const presets: LlmPreset[] = [{ id: 'P', name: 'P', profileId: 'PA', skillId: 'sk' }];
    const settings = makeSettings({ profiles, skills, presets });
    // preset says PA, but node explicitly picks PB -> PB wins for the connection
    const { connection, systemPrompt } = compose(
      settings,
      withData({ model: '', llmPresetId: 'P', llmProfileId: 'PB' }),
    );
    assert.equal(connection.endpoint, 'http://b'); // PB, not PA
    assert.equal(connection.apiKey, 'kB');
    assert.equal(systemPrompt, 'skill-sp'); // skill piece still from the preset
  });

  it('(d) override beats a node-chosen profile, but node gets that profile endpoint/key (Decision 3 edge)', () => {
    const presets: LlmPreset[] = [{ id: 'P', name: 'P', profileId: 'PA', overrides: { defaultModel: 'M' } }];
    const settings = makeSettings({ profiles, presets });
    // node picks PB AND the preset overrides defaultModel=M: PB's endpoint/key, but M's model.
    const { connection } = compose(settings, withData({ model: '', llmPresetId: 'P', llmProfileId: 'PB' }));
    assert.equal(connection.endpoint, 'http://b'); // PB
    assert.equal(connection.apiKey, 'kB'); // PB
    assert.equal(connection.model, 'M'); // preset override
  });
});
