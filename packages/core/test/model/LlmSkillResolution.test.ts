import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySkillParams,
  MAX_SKILL_EXTENDS_DEPTH,
  resolveSkill,
  type ResolvedSkill,
} from '../../src/model/LlmSkillResolution.js';
import type { LlmSkill, Settings } from '../../src/model/Settings.js';
import { ChatNodeBase, type ChatNodeData } from '../../src/model/nodes/ChatNodeBase.js';
import { getInputOrData } from '../../src/utils/inputs.js';
import type { Inputs } from '../../src/model/GraphProcessor.js';
import type { PortId } from '../../src/model/NodeBase.js';

function settingsWith(skills: LlmSkill[]): Pick<Settings, 'modelConfig'> {
  return { modelConfig: { skills } };
}

describe('resolveSkill', () => {
  it('returns {} for an empty/undefined id (No-Skill passthrough)', () => {
    assert.deepEqual(resolveSkill({ modelConfig: { skills: [] } }, undefined), {});
    assert.deepEqual(resolveSkill({ modelConfig: { skills: [] } }, ''), {});
  });

  it('returns {} and traces for an unknown id', () => {
    const traces: string[] = [];
    const result = resolveSkill(settingsWith([{ id: 'a', name: 'A' }]), 'missing', (m) => traces.push(m));
    assert.deepEqual(result, {});
    assert.equal(traces.length, 1);
    assert.match(traces[0]!, /not found/);
  });

  it('resolves a single skill to all its fields', () => {
    const skill: LlmSkill = {
      id: 'dev',
      name: 'Developer',
      systemPrompt: 'You are a developer.',
      temperature: 0.2,
      reasoningEffort: 'high',
      responseFormat: 'json',
    };
    assert.deepEqual(resolveSkill(settingsWith([skill]), 'dev'), {
      systemPrompt: 'You are a developer.',
      temperature: 0.2,
      reasoningEffort: 'high',
      responseFormat: 'json',
    });
  });

  it('merges a 2-level extends chain with the child overriding the parent', () => {
    const skills: LlmSkill[] = [
      { id: 'base', name: 'Base', systemPrompt: 'base prompt', temperature: 0.9, reasoningEffort: 'low' },
      { id: 'child', name: 'Child', extends: 'base', temperature: 0.1 },
    ];
    assert.deepEqual(resolveSkill(settingsWith(skills), 'child'), {
      systemPrompt: 'base prompt', // inherited
      temperature: 0.1, // overridden
      reasoningEffort: 'low', // inherited
    });
  });

  it('merges a 3-level extends chain (grandparent -> parent -> child)', () => {
    const skills: LlmSkill[] = [
      { id: 'gp', name: 'GP', systemPrompt: 'gp', temperature: 0.9, maxTokens: 100 },
      { id: 'p', name: 'P', extends: 'gp', temperature: 0.5 },
      { id: 'c', name: 'C', extends: 'p', maxTokens: 500 },
    ];
    assert.deepEqual(resolveSkill(settingsWith(skills), 'c'), {
      systemPrompt: 'gp', // from grandparent
      temperature: 0.5, // parent overrides grandparent
      maxTokens: 500, // child overrides grandparent
    });
  });

  it('ignores an extends pointing at an unknown parent and keeps resolving the child', () => {
    const traces: string[] = [];
    const skills: LlmSkill[] = [{ id: 'child', name: 'Child', extends: 'ghost', temperature: 0.3 }];
    const result = resolveSkill(settingsWith(skills), 'child', (m) => traces.push(m));
    assert.deepEqual(result, { temperature: 0.3 });
    assert.match(traces[0]!, /unknown skill 'ghost'/);
  });

  it('guards against an extends cycle and returns the partial chain', () => {
    const traces: string[] = [];
    const skills: LlmSkill[] = [
      { id: 'a', name: 'A', extends: 'b', temperature: 0.2 },
      { id: 'b', name: 'B', extends: 'a', systemPrompt: 'b prompt' },
    ];
    const result = resolveSkill(settingsWith(skills), 'a', (m) => traces.push(m));
    assert.deepEqual(result, { temperature: 0.2, systemPrompt: 'b prompt' });
    assert.ok(traces.some((t) => /cycle/.test(t)));
  });

  it('caps the extends depth and stops walking', () => {
    const len = MAX_SKILL_EXTENDS_DEPTH + 5;
    const skills: LlmSkill[] = [];
    for (let i = 0; i < len; i++) {
      skills.push({
        id: `s${i}`,
        name: `S${i}`,
        extends: i < len - 1 ? `s${i + 1}` : undefined,
        ...(i === len - 1 ? { systemPrompt: 'deepest' } : {}),
      });
    }
    const traces: string[] = [];
    const result = resolveSkill(settingsWith(skills), 's0', (m) => traces.push(m));
    assert.ok(traces.some((t) => /max extends depth/.test(t)));
    assert.equal(result.systemPrompt, undefined); // deepest ancestor beyond the cap
  });
});

describe('applySkillParams (Option C: Node > Skill > node default)', () => {
  const defaults = ChatNodeBase.defaultData();

  function withData(overrides: Partial<ChatNodeData>): ChatNodeData {
    return { ...ChatNodeBase.defaultData(), ...overrides };
  }

  it('No-Skill ({}) leaves the data byte-identical (regression)', () => {
    const data = withData({ temperature: 0.7, reasoningEffort: 'low' });
    assert.deepEqual(applySkillParams(data, defaults, {}), data);
  });

  it('fills a field the node left at its default', () => {
    const data = withData({}); // temperature at default 0.5
    const skill: ResolvedSkill = { temperature: 0.2 };
    assert.equal(applySkillParams(data, defaults, skill).temperature, 0.2);
  });

  it('keeps a node value that differs from the default (node wins)', () => {
    const data = withData({ temperature: 0.7 });
    const skill: ResolvedSkill = { temperature: 0.2 };
    assert.equal(applySkillParams(data, defaults, skill).temperature, 0.7);
  });

  it('does not touch systemPrompt (handled by message injection, not params)', () => {
    const data = withData({});
    const skill: ResolvedSkill = { systemPrompt: 'hello' };
    assert.equal((applySkillParams(data, defaults, skill) as Record<string, unknown>).systemPrompt, undefined);
  });

  it('handles sentinel fields uniformly (reasoningEffort default "")', () => {
    assert.equal(applySkillParams(withData({}), defaults, { reasoningEffort: 'high' }).reasoningEffort, 'high');
    assert.equal(
      applySkillParams(withData({ reasoningEffort: 'low' }), defaults, { reasoningEffort: 'high' }).reasoningEffort,
      'low',
    );
  });
});

describe('behavior-param precedence end-to-end (applySkillParams + getInputOrData)', () => {
  // Mirrors how ChatNodeBase.process() resolves a param: skill folded in first, then
  // getInputOrData applies the input-port override.
  const defaults = ChatNodeBase.defaultData();
  function resolveTemperature(data: ChatNodeData, inputs: Inputs, skill: ResolvedSkill): number {
    return getInputOrData(applySkillParams(data, defaults, skill), inputs, 'temperature', 'number');
  }
  const noInputs: Inputs = {};

  it('node default + skill -> skill value', () => {
    const data = { ...defaults };
    assert.equal(resolveTemperature(data, noInputs, { temperature: 0.2 }), 0.2);
  });

  it('node-typed value (differs from default) + skill -> node value wins', () => {
    const data = { ...defaults, temperature: 0.7 };
    assert.equal(resolveTemperature(data, noInputs, { temperature: 0.2 }), 0.7);
  });

  it('input-port-wired value beats both the skill and the node default', () => {
    const data = { ...defaults, useTemperatureInput: true }; // node field at default, but port wired
    const inputs = { ['temperature' as PortId]: { type: 'number', value: 0.9 } } as unknown as Inputs;
    assert.equal(resolveTemperature(data, inputs, { temperature: 0.2 }), 0.9);
  });
});
