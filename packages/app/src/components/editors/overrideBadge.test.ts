import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

const nodeEditor = read('DefaultNodeEditor.tsx');
const nodeEditorField = read('DefaultNodeEditorField.tsx');

test('the overridden set is computed from the core composition + override helpers (no merge re-impl)', () => {
  assert.match(nodeEditor, /describeNodeComposition,\s*\n?\s*computeOverriddenModelConfigFields/);
  // Same project-scoped source as the selectors.
  assert.match(nodeEditor, /getEditorModelConfig\(project\)/);
  assert.match(nodeEditor, /describeNodeComposition\(/);
  assert.match(nodeEditor, /computeOverriddenModelConfigFields\(composed, data, defaults\)/);
  // Defaults come from a fresh node of the same type (the runtime baseline for the ≠default rule).
  assert.match(nodeEditor, /createDynamic\(node\.type\)\.data/);
});

test('input-wired fields are excluded (the wire drives them, not an override)', () => {
  assert.match(nodeEditor, /useInputToggleDataKey/);
  assert.match(nodeEditor, /data\[toggleKey\]/);
  assert.match(nodeEditor, /overridden\.delete\(dataKey\)/);
  // The set is threaded down to the field renderer.
  assert.match(nodeEditor, /overriddenDataKeys=\{overriddenDataKeys\}/);
});

test('the badge is read-only and rendered only for overridden fields', () => {
  assert.match(nodeEditorField, /overriddenDataKeys\?\.has\(fieldDataKey\)/);
  assert.match(nodeEditorField, /isOverridden && \(/);
  assert.match(nodeEditorField, /className="override-badge"/);
  // Read-only: the badge is a plain span with no onChange / click handler.
  assert.doesNotMatch(nodeEditorField, /override-badge"[^>]*onClick/);
});
