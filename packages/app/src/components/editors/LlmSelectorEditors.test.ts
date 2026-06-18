import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('./LlmSelectorEditors.tsx', import.meta.url), 'utf8');
const dispatchSource = readFileSync(new URL('./DefaultNodeEditorField.tsx', import.meta.url), 'utf8');

test('llm selectors build options via the shared helper and read the project model-config', () => {
  assert.match(source, /import \{ getLlmSelectorOptions.* \} from '\.\.\/\.\.\/utils\/llmSelectorOptions';/);
  assert.match(source, /getLlmSelectorOptions\(items, \{ selectedId: value \}\)/);
  // Phase B: the source is the PROJECT's model-config (what travels/runs), via the one-spot helper —
  // not the global settings atom. Routing through getEditorModelConfig keeps the future global-merge
  // a single change here, not a re-edit of the three renderers.
  assert.match(source, /import \{ projectState \} from '\.\.\/\.\.\/state\/savedGraphs';/);
  assert.match(source, /import \{ getEditorModelConfig \} from '\.\.\/\.\.\/utils\/projectModelConfig';/);
  assert.match(source, /getEditorModelConfig\(project\)\.profiles/);
  assert.match(source, /getEditorModelConfig\(project\)\.skills/);
  assert.match(source, /getEditorModelConfig\(project\)\.presets/);
  // The shared field is exported so the Phase B preset editor reuses the exact same picker.
  assert.match(source, /export const LlmSelectorField/);
  // No hardcoded domain knowledge — options come from the project config, not a baked-in list.
  assert.doesNotMatch(source, /nanoid/);
});

test('the three selectors are wired into the node-editor dispatch', () => {
  assert.match(dispatchSource, /\.with\(\{ type: 'llmProfileSelector' \}/);
  assert.match(dispatchSource, /\.with\(\{ type: 'llmSkillSelector' \}/);
  assert.match(dispatchSource, /\.with\(\{ type: 'llmPresetSelector' \}/);
  assert.match(dispatchSource, /DefaultLlmProfileSelectorEditor/);
  assert.match(dispatchSource, /DefaultLlmSkillSelectorEditor/);
  assert.match(dispatchSource, /DefaultLlmPresetSelectorEditor/);
});
