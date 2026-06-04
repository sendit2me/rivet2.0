import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const labeledToggleSource = readFileSync(new URL('./LabeledToggle.tsx', import.meta.url), 'utf8');

test('labeled toggle owns the switch-label gap inside clickable labels', () => {
  assert.match(labeledToggleSource, /--labeled-toggle-gap: calc\(8px \* var\(--ui-font-scale, 1\)\);/);
  assert.doesNotMatch(labeledToggleSource, /\.labeled-toggle-control\s*{[\s\S]*?gap: var\(--labeled-toggle-gap\);/);
  assert.match(
    labeledToggleSource,
    /\.labeled-toggle-label label\s*{[\s\S]*?padding-left: var\(--labeled-toggle-gap\);/,
  );
  assert.match(labeledToggleSource, /<Label htmlFor=\{id\}>\{label\}<\/Label>/);
  assert.match(labeledToggleSource, /<label className="labeled-toggle-helper-label" htmlFor=\{id\}>/);
});
