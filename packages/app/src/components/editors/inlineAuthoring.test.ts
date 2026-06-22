import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const selectors = read('LlmSelectorEditors.tsx');
const modal = read('LlmEntityAuthoringModal.tsx');

test('inline authoring reuses the SHARED forms + the SHARED authoring hook (no second surface)', () => {
  assert.match(modal, /import \{ LlmProfileForm \}/);
  assert.match(modal, /import \{ LlmSkillForm \}/);
  assert.match(modal, /import \{ LlmPresetForm \}/);
  assert.match(modal, /useModelConfigAuthoring\(\)/);
  // Save commits via the shared upserts; Cancel discards (draft state).
  assert.match(modal, /upsertProfile|upsertSkill|upsertPreset/);
  assert.match(modal, /useState/);
});

test('inline add is kind-respecting and auto-selects the new entity', () => {
  // A new Skill from a chat node's selector seeds the selector's kind (R1).
  assert.match(selectors, /name: 'New skill', kind: wantKind/);
  // On add (not edit), the newly created id is auto-selected.
  assert.match(selectors, /if \(modal\.mode === 'add'\) onSelect\(entity\.id\)/);
});

test('inline edit targets the SHARED project entity and says so (no per-node tweak)', () => {
  assert.match(modal, /changes affect every node bound to it/);
});

test('inline edit is gated when input-driven or empty; add stays enabled', () => {
  assert.match(selectors, /const canEdit = !inputDriven && !isReadonly && selected != null/);
  // Edit disabled unless canEdit; New disabled only when readonly.
  assert.match(selectors, /isDisabled=\{!canEdit\}/);
  assert.match(selectors, /isDisabled=\{isReadonly\}/);
});
