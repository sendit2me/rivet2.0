import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const booleanNodeSource = readFileSync(new URL('./BooleanNode.tsx', import.meta.url), 'utf8');
const useNodeTypesSource = readFileSync(new URL('../../hooks/useNodeTypes.ts', import.meta.url), 'utf8');

test('bool node uses a canvas toggle that edits the same value as the settings panel', () => {
  assert.match(booleanNodeSource, /useEditNodeCommand\(\)/);
  assert.match(booleanNodeSource, /node\.data\.useValueInput[\s\S]*?return null;/);
  assert.match(booleanNodeSource, /gap: calc\(7px \* var\(--ui-font-scale, 1\)\);/);
  assert.match(booleanNodeSource, /onDoubleClick=\{handleDoubleClick\}/);
  assert.match(booleanNodeSource, /value: event\.target\.checked/);
  assert.match(booleanNodeSource, /<ScalableToggle[\s\S]*?ariaLabel="Bool value"[\s\S]*?isChecked=\{value\}/);
  assert.match(booleanNodeSource, /className="boolean-node-body-value">\{value \? 'True' : 'False'\}/);
  assert.doesNotMatch(booleanNodeSource, /boolean-node-body-label/);
});

test('bool node descriptor is registered for custom canvas body rendering', () => {
  assert.match(useNodeTypesSource, /import \{ booleanNodeDescriptor \} from '\.\.\/components\/nodes\/BooleanNode\.js';/);
  assert.match(useNodeTypesSource, /boolean: booleanNodeDescriptor,/);
});
