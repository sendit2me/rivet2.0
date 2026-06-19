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
const fields = read('modelConfigFields.tsx');
const overridesForm = read('LlmOverridesForm.tsx');
const jsonField = read('JsonObjectField.tsx');

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

test('the entity forms and shared field groups are presentational — no store access (reusable by the deferred global library)', () => {
  for (const [label, src] of [
    ['ProfileForm', profileForm],
    ['SkillForm', skillForm],
    ['PresetForm', presetForm],
    ['OverridesForm', overridesForm],
    ['modelConfigFields', fields],
    ['JsonObjectField', jsonField],
  ] as const) {
    // Store-coupling shows up as state-module imports, jotai hooks, or flush calls — none allowed.
    assert.doesNotMatch(src, /from '\.\.\/\.\.\/state\//, `${label} imports no store module`);
    assert.doesNotMatch(src, /useAtom\(|useAtomValue\(|flushHybridStorageGroup\(/, `${label} calls no store hooks`);
    assert.match(src, /onChange/, `${label} emits onChange`);
  }
});

test('connection/behavior fields are generic and shared by the forms', () => {
  // Generic OpenAI-compatible connection fields live in the shared group (never oMLX-shaped).
  assert.match(fields, /API endpoint/);
  assert.match(fields, /API key/);
  assert.doesNotMatch(fields, /oMLX|llama-server|Ollama|vLLM/i);
  // Profile/Skill forms compose the shared groups (pure extraction).
  assert.match(profileForm, /<ConnectionFields/);
  assert.match(skillForm, /<BehaviorFields/);
  // The preset editor reuses the Phase A selector (consistent picker on node + preset).
  assert.match(presetForm, /import \{ LlmSelectorField \} from '\.\.\/editors\/LlmSelectorEditors\.js';/);
});

test('C1 ships the deferred object editors via the shared JSON editor', () => {
  // Skill extraBody and the preset overrides editor are wired (the Phase C deferrals, now shipped).
  assert.match(skillForm, /import \{ JsonObjectField \}/);
  assert.match(skillForm, /update\(\{ extraBody: next \}\)/);
  assert.match(presetForm, /import \{ LlmOverridesForm \}/);
  assert.match(presetForm, /<LlmOverridesForm/);
  // The overrides editor runs the shared groups in override mode + the JSON editor for extraBody.
  assert.match(overridesForm, /mode="override"/);
  assert.match(overridesForm, /import \{ JsonObjectField \}/);
});

test('overrides are keyed by PRESENCE (not value) so inherit vs set-to-empty/zero is distinguishable', () => {
  // override mode tests key existence, not truthiness; toggling presence writes/removes the key.
  assert.match(fields, /mode === 'override' \? key in value : true/);
  assert.match(fields, /setPresent/);
});

test('extends pickers are always present and exclude self (finding 1 fix — no length guard)', () => {
  for (const [label, src, key] of [
    ['ProfileForm', profileForm, 'p'],
    ['SkillForm', skillForm, 's'],
  ] as const) {
    assert.match(src, new RegExp(`filter\\(\\(${key}\\) => ${key}\\.id !== value\\.id\\)`), `${label} excludes self`);
    assert.doesNotMatch(src, /extends\w*\.length > 0 &&/, `${label} has no length guard hiding extends`);
  }
});
