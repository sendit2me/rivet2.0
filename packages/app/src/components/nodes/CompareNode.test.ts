import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const compareNodeSource = readFileSync(new URL('./CompareNode.tsx', import.meta.url), 'utf8');
const coreCompareNodeSource = readFileSync(
  new URL('../../../../core/src/model/nodes/CompareNode.ts', import.meta.url),
  'utf8',
);
const useNodeTypesSource = readFileSync(new URL('../../hooks/useNodeTypes.ts', import.meta.url), 'utf8');

const comparisonOperators = ['==', '!=', '<', '<=', '>', '>=', 'and', 'or', 'xor', 'nand', 'nor', 'xnor'];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('compare node exports one shared comparison operator list for settings and canvas body', () => {
  assert.match(coreCompareNodeSource, /export const compareNodeComparisonFunctionOptions/);
  assert.match(coreCompareNodeSource, /options: compareNodeComparisonFunctionOptions/);
  assert.match(compareNodeSource, /compareNodeComparisonFunctionOptions/);

  for (const operator of comparisonOperators) {
    assert.match(coreCompareNodeSource, new RegExp(`value: '${escapeRegExp(operator)}'`));
  }
});

test('compare node canvas body edits comparisonFunction through the node edit command', () => {
  assert.match(compareNodeSource, /useEditNodeCommand\(\)/);
  assert.match(compareNodeSource, /comparisonFunction: nextComparisonFunction/);
  assert.match(compareNodeSource, /aria-label="Comparison function"/);
  assert.match(compareNodeSource, /<select[\s\S]*?compareNodeComparisonFunctionOptions\.map/);
});

test('compare node canvas body shows passive input-driven text instead of the selector', () => {
  assert.match(compareNodeSource, /node\.data\.useComparisonFunctionInput[\s\S]*?\(input\)/);
  assert.match(compareNodeSource, /onDoubleClick=\{handleDoubleClick\}/);
  assert.match(compareNodeSource, /event\.stopPropagation\(\)/);
});

test('compare node selector blurs when a pointer-down happens outside the node', () => {
  assert.match(compareNodeSource, /if \(!isSelectFocused\) \{[\s\S]*?return;[\s\S]*?\}/);
  assert.match(compareNodeSource, /\}, \[isSelectFocused\]\);/);
  assert.match(compareNodeSource, /document\.addEventListener\('pointerdown', handleDocumentPointerDown, true\)/);
  assert.match(compareNodeSource, /document\.activeElement !== selectElement/);
  assert.match(compareNodeSource, /rootRef\.current\?\.closest<HTMLElement>\('\.node'\)/);
  assert.match(compareNodeSource, /nodeElement\?\.contains\(event\.target\)/);
  assert.match(compareNodeSource, /selectElement\.blur\(\)/);
  assert.match(compareNodeSource, /document\.removeEventListener\('pointerdown', handleDocumentPointerDown, true\)/);
  assert.match(compareNodeSource, /onFocus=\{\(\) => setIsSelectFocused\(true\)\}/);
  assert.match(compareNodeSource, /onBlur=\{\(\) => setIsSelectFocused\(false\)\}/);
});

test('compare node descriptor is registered for custom canvas body rendering', () => {
  assert.match(useNodeTypesSource, /import \{ compareNodeDescriptor \} from '\.\.\/components\/nodes\/CompareNode\.js';/);
  assert.match(useNodeTypesSource, /compare: compareNodeDescriptor,/);
});
