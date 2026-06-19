import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

const nodeEditor = read('DefaultNodeEditor.tsx');
const nodeEditorField = read('DefaultNodeEditorField.tsx');
const customEditor = read('CustomEditor.tsx');

test('Show-overrides gate: advanced rows are marked and CSS-hidden by default', () => {
  // The pref drives the gate, default off (defined in state/ui.ts).
  assert.match(nodeEditor, /import \{ showModelConfigOverridesState \} from '\.\.\/\.\.\/state\/ui';/);
  // Only nodes that actually declare an advanced editor get the gate + toggle (no chrome elsewhere).
  assert.match(nodeEditor, /editors\.some\(\(editor\) => editor\.advanced\)/);
  assert.match(nodeEditor, /hide-advanced-editors/);
  assert.match(nodeEditor, /Show overrides/);
  // Each advanced editor's row carries the class the CSS gate targets.
  assert.match(nodeEditorField, /editor\.advanced && 'advanced-editor'/);
  // The gate is CSS (hide), not unmount — so toggling preserves field state.
  assert.match(nodeEditor, /&\.hide-advanced-editors > \.row\.advanced-editor \{\s*display: none;/);
});

test('the extraBody JSON custom editor is registered', () => {
  assert.match(customEditor, /\.with\('extraBodyJson', \(\) => <ExtraBodyJsonEditor /);
});
