import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('./LlmSelectorEditors.tsx', import.meta.url), 'utf8');
const dispatchSource = readFileSync(new URL('./DefaultNodeEditorField.tsx', import.meta.url), 'utf8');

test('llm selectors build options via the shared helper and read settingsState', () => {
  assert.match(source, /import \{ getLlmSelectorOptions.* \} from '\.\.\/\.\.\/utils\/llmSelectorOptions';/);
  assert.match(source, /getLlmSelectorOptions\(items, \{ selectedId: value \}\)/);
  assert.match(source, /import \{ settingsState \} from '\.\.\/\.\.\/state\/settings';/);
  // Each selector reads the relevant Settings array via the Feature 006 `modelConfig` path
  // (the merged project+global set at runtime).
  assert.match(source, /settings\.modelConfig\?\.profiles \?\? \[\]/);
  assert.match(source, /settings\.modelConfig\?\.skills \?\? \[\]/);
  assert.match(source, /settings\.modelConfig\?\.presets \?\? \[\]/);
  // No hardcoded domain knowledge — options come from Settings, not a baked-in list.
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
