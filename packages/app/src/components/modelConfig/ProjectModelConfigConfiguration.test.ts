import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

const panel = read('ProjectModelConfigConfiguration.tsx');
const profileForm = read('LlmProfileForm.tsx');
const skillForm = read('LlmSkillForm.tsx');
const presetForm = read('LlmPresetForm.tsx');

test('the panel authors into the project store and flushes immediately', () => {
  // Authoring target is the PROJECT (portability home from 006), not global settings.
  assert.match(panel, /import \{ projectState \} from '\.\.\/\.\.\/state\/savedGraphs\.js';/);
  assert.match(panel, /useAtom\(projectState\)/);
  // Writes land under Project.modelConfig per axis (project-scoped, travels with the project).
  assert.match(panel, /modelConfig: \{ \.\.\.prev\.modelConfig, \[axis\]: next \}/);
  // The 'project' hybrid storage group is debounced — edits must be flushed to persist + survive reload.
  assert.match(panel, /import \{ flushHybridStorageGroup \} from '\.\.\/\.\.\/state\/storage\.js';/);
  assert.match(panel, /flushHybridStorageGroup\('project'\)/);
  // Does NOT author into the global settings atom (that's the deferred global library).
  assert.doesNotMatch(panel, /settingsState/);
});

test('the panel does CRUD over all three axes', () => {
  for (const axis of ['profiles', 'skills', 'presets']) {
    assert.match(panel, new RegExp(`writeAxis\\('${axis}'`), `writes the ${axis} axis`);
  }
  assert.match(panel, /Add Preset/);
  assert.match(panel, /Add Profile/);
  assert.match(panel, /Add Skill/);
  // New entities get a generated id.
  assert.match(panel, /import \{ nanoid \} from 'nanoid\/non-secure';/);
});

test('the entity forms are presentational — no store access (reusable by the deferred global library)', () => {
  for (const [label, src] of [
    ['ProfileForm', profileForm],
    ['SkillForm', skillForm],
    ['PresetForm', presetForm],
  ] as const) {
    // Store-coupling shows up as state-module imports, jotai hooks, or flush calls — none allowed.
    assert.doesNotMatch(src, /from '\.\.\/\.\.\/state\//, `${label} imports no store module`);
    assert.doesNotMatch(src, /useAtom\(|useAtomValue\(|flushHybridStorageGroup\(/, `${label} calls no store hooks`);
    assert.match(src, /onChange/, `${label} emits onChange`);
  }
});

test('forms stay generic and defer object-valued fields to Phase C', () => {
  // Profile connection fields are generic (never oMLX-shaped).
  assert.match(profileForm, /API endpoint/);
  assert.match(profileForm, /API key/);
  assert.doesNotMatch(profileForm, /oMLX|chat_template_kwargs/i);
  // The preset editor reuses the Phase A selector (consistent picker on node + preset).
  assert.match(presetForm, /import \{ LlmSelectorField \} from '\.\.\/editors\/LlmSelectorEditors\.js';/);
  // Phase C deferrals: no object editors for a skill's extraBody or a preset's overrides yet.
  assert.doesNotMatch(skillForm, /extraBody/);
  assert.doesNotMatch(presetForm, /overrides/);
});
