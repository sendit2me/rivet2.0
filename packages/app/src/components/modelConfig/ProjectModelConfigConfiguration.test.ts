import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

const panel = read('ProjectModelConfigConfiguration.tsx');
// R3: the store read/write moved to the shared authoring hook (one path for the panel + the inline modal).
const authHook = read('../../hooks/useModelConfigAuthoring.ts');
const profileForm = read('LlmProfileForm.tsx');
const skillForm = read('LlmSkillForm.tsx');
const presetForm = read('LlmPresetForm.tsx');
const fields = read('modelConfigFields.tsx');
const overridesForm = read('LlmOverridesForm.tsx');
const jsonField = read('JsonObjectField.tsx');

test('the shared authoring hook writes to the project store and flushes immediately', () => {
  // Authoring target is the PROJECT (portability home from 006), not global settings — and it's one
  // shared write path (the hook), consumed by the panel + the inline node-editor modal.
  assert.match(authHook, /import \{ projectState \} from '\.\.\/state\/savedGraphs\.js';/);
  assert.match(authHook, /useAtom\(projectState\)/);
  // Writes land under Project.modelConfig per axis (project-scoped, travels with the project).
  assert.match(authHook, /modelConfig: \{ \.\.\.prev\.modelConfig, \[axis\]: next \}/);
  // The 'project' hybrid storage group is debounced — edits must be flushed to persist + survive reload.
  assert.match(authHook, /import \{ flushHybridStorageGroup \} from '\.\.\/state\/storage\.js';/);
  assert.match(authHook, /flushHybridStorageGroup\('project'\)/);
  // The panel consumes the hook, and does NOT author into the global settings atom.
  assert.match(panel, /useModelConfigAuthoring\(\)/);
  assert.doesNotMatch(panel, /settingsState/);
});

test('the hook does CRUD + clone over all three axes; the panel surfaces add/duplicate', () => {
  for (const axis of ['profiles', 'skills', 'presets']) {
    const cap = axis[0]!.toUpperCase() + axis.slice(1, -1); // profiles -> Profile
    assert.match(authHook, new RegExp(`upsert${cap}`), `hook upserts the ${axis} axis`);
    assert.match(authHook, new RegExp(`clone${cap}`), `hook clones the ${axis} axis (copy-new)`);
    assert.match(authHook, new RegExp(`remove${cap}`), `hook removes from the ${axis} axis`);
  }
  // copy-new uses the core clone helper; new entities get a generated id in the hook.
  assert.match(authHook, /cloneModelConfigEntity/);
  assert.match(authHook, /import \{ nanoid \} from 'nanoid\/non-secure';/);
  // The panel surfaces add + duplicate affordances.
  assert.match(panel, /Add Preset/);
  assert.match(panel, /Add Profile/);
  assert.match(panel, /Add Skill/);
  assert.match(panel, /Duplicate/);
  assert.match(panel, /duplicateProfile|duplicateSkill|duplicatePreset/);
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

test('connection/base fields are the chat-v2 fan-out shape and shared by the forms', () => {
  // Provider-aware connection fields live in the shared group (never server-branded).
  assert.match(fields, /Provider/);
  assert.match(fields, /Base URL/);
  assert.doesNotMatch(fields, /oMLX|llama-server|Ollama|vLLM/i);
  // Profile/Skill forms compose the shared chat-v2 groups (pure extraction).
  assert.match(profileForm, /<ProfileConnectionFields/);
  assert.match(skillForm, /<SkillBaseFields/);
  // The preset editor reuses the Phase A selector (consistent picker on node + preset).
  assert.match(presetForm, /import \{ LlmSelectorField \} from '\.\.\/editors\/LlmSelectorField\.js';/);
});

test('forms wire the shared JSON editor for the extraBody escape hatch', () => {
  // Skill base + per-provider blocks carry extraBody via the shared JSON editor (custom-provider hatch).
  assert.match(skillForm, /import \{ JsonObjectField \}/);
  assert.match(skillForm, /extraBody/);
  assert.match(presetForm, /import \{ LlmOverridesForm \}/);
  assert.match(presetForm, /<LlmOverridesForm/);
  // The overrides editor runs the shared override-mode group + the JSON editor for extraBody.
  assert.match(overridesForm, /<OverrideFields/);
  assert.match(overridesForm, /import \{ JsonObjectField \}/);
});

test('overrides are keyed by PRESENCE (not value) so inherit vs set-to-empty/zero is distinguishable', () => {
  // override mode tests key existence, not truthiness; toggling presence writes/removes the key.
  assert.match(fields, /mode === 'override' \? key in value : true/);
  assert.match(fields, /setPresent/);
});

test('Tidy Phase 2 — copy + forms fixes', () => {
  // API key source defaults to a visible "Environment" rather than an ambiguous empty Select.
  assert.match(fields, /field="apiKeySource"[\s\S]*?fallback="environment"/);
  // stopSequences has a form control on the Skill Base subsection (D12 deferred-authoring closed).
  assert.match(fields, /field="stopSequences"/);
  // Stale helper copy corrected (no chat-v2 systemPrompt; provider/baseURL not endpoint; "LLM Chat").
  assert.match(presetForm, /provider \/ base URL \/ key/);
  assert.doesNotMatch(presetForm, /system prompt \/ sampling/);
  assert.match(presetForm, /sampling \/ model/);
  assert.match(panel, /the LLM Chat node editor/);
});

test('extends pickers are always present and exclude self (finding 1 fix — no length guard)', () => {
  for (const [label, src, key] of [
    ['ProfileForm', profileForm, 'p'],
    ['SkillForm', skillForm, 's'],
  ] as const) {
    // Self-exclusion (prefix match — SkillForm appends a same-kind clause, Gap B, see below).
    assert.match(src, new RegExp(`filter\\(\\(${key}\\) => ${key}\\.id !== value\\.id`), `${label} excludes self`);
    assert.doesNotMatch(src, /extends\w*\.length > 0 &&/, `${label} has no length guard hiding extends`);
  }
  // Gap B: the SkillForm extends picker also filters to the SAME kind (kind-agnostic merge would mis-merge a mismatched parent).
  assert.match(skillForm, /getSkillKind\(s\) === getSkillKind\(value\)/, 'SkillForm extends picker is kind-filtered');
});
