import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cloneModelConfigEntity } from '../../src/model/modelConfigAuthoring.js';
import type { LlmSkill } from '../../src/model/Settings.js';

describe('cloneModelConfigEntity — copy-new (diverging fork)', () => {
  it('gives a new id, a "Copy of …" name, and preserves extends (the pointer)', () => {
    const skill: LlmSkill = {
      id: 'orig',
      name: 'Coder',
      extends: 'parent',
      base: { temperature: 0.2 },
      providers: { custom: { model: 'Qwen' } },
    };
    const clone = cloneModelConfigEntity(skill, 'new-id');
    assert.equal(clone.id, 'new-id');
    assert.equal(clone.name, 'Copy of Coder');
    assert.equal(clone.extends, 'parent'); // inheritance stays live
    assert.equal(clone.base?.temperature, 0.2);
    assert.equal((clone as LlmSkill).providers?.custom?.model, 'Qwen');
  });

  it('is a DEEP clone: editing the clone (incl. nested base/providers) never mutates the original', () => {
    const skill: LlmSkill = { id: 'orig', name: 'S', base: { temperature: 0.2 }, providers: { custom: { model: 'Qwen' } } };
    const clone = cloneModelConfigEntity(skill, 'new-id');
    clone.base!.temperature = 0.9;
    (clone as LlmSkill).providers!.custom!.model = 'changed';
    assert.equal(skill.base!.temperature, 0.2); // original untouched
    assert.equal(skill.providers!.custom!.model, 'Qwen');
    assert.notEqual(clone.base, skill.base); // distinct nested objects
    assert.notEqual(clone.providers!.custom, skill.providers!.custom);
  });
});
