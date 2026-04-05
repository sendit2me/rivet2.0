import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCodeEditorCreateOptions, getNodeEditorCodeEditorMountKey, resolveCodeEditorTheme } from './codeEditorOptions.js';

test('buildCodeEditorCreateOptions disables folding by default', () => {
  const options = buildCodeEditorCreateOptions({
    text: 'const x = 1;',
    language: 'javascript',
  });

  assert.equal(options.folding, false);
  assert.equal(options.foldingStrategy, undefined);
  assert.equal(options.showFoldingControls, undefined);
  assert.equal(options.foldingHighlight, undefined);
  assert.equal(options.unfoldOnClickAfterEndOfLine, undefined);
});

test('buildCodeEditorCreateOptions enables expected folding options when requested', () => {
  const options = buildCodeEditorCreateOptions({
    text: '{\n  "value": 1\n}',
    language: 'json',
    enableFolding: true,
  });

  assert.equal(options.folding, true);
  assert.equal(options.foldingStrategy, 'auto');
  assert.equal(options.showFoldingControls, 'mouseover');
  assert.equal(options.foldingHighlight, true);
  assert.equal(options.unfoldOnClickAfterEndOfLine, false);
});

test('buildCodeEditorCreateOptions uses the provided theme verbatim', () => {
  const options = buildCodeEditorCreateOptions({
    text: '{\n  "value": 1\n}',
    language: 'json',
    theme: 'prompt-interpolation-molten',
  });

  assert.equal(options.theme, 'prompt-interpolation-molten');
});

test('buildCodeEditorCreateOptions preserves existing non-folding defaults', () => {
  const options = buildCodeEditorCreateOptions({
    text: 'body',
    theme: 'vs-dark',
    language: 'json',
    readOnly: true,
    scrollBeyondLastLine: false,
    enableFolding: true,
  });

  assert.equal(options.theme, 'vs-dark');
  assert.equal(options.lineNumbers, 'on');
  assert.equal(options.glyphMargin, false);
  assert.equal(options.lineNumbersMinChars, 2);
  assert.deepEqual(options.minimap, { enabled: false });
  assert.equal(options.wordWrap, 'on');
  assert.equal(options.readOnly, true);
  assert.equal(options.value, 'body');
  assert.equal(options.scrollBeyondLastLine, false);
});

test('resolveCodeEditorTheme expands prompt-interpolation themes with the active app theme', () => {
  assert.equal(resolveCodeEditorTheme('prompt-interpolation', 'molten'), 'prompt-interpolation-molten');
  assert.equal(resolveCodeEditorTheme('vs-dark', 'molten'), 'vs-dark');
  assert.equal(resolveCodeEditorTheme(undefined, 'molten'), undefined);
});

test('getNodeEditorCodeEditorMountKey changes when structural editor inputs change', () => {
  const baseKey = getNodeEditorCodeEditorMountKey({
    nodeId: 'node-1',
    fieldIdentity: 'body',
    language: 'json',
    theme: 'vs-dark',
    enableFolding: true,
  });

  assert.notEqual(
    baseKey,
    getNodeEditorCodeEditorMountKey({
      nodeId: 'node-2',
      fieldIdentity: 'body',
      language: 'json',
      theme: 'vs-dark',
      enableFolding: true,
    }),
  );
  assert.notEqual(
    baseKey,
    getNodeEditorCodeEditorMountKey({
      nodeId: 'node-1',
      fieldIdentity: 'headers',
      language: 'json',
      theme: 'vs-dark',
      enableFolding: true,
    }),
  );
  assert.notEqual(
    baseKey,
    getNodeEditorCodeEditorMountKey({
      nodeId: 'node-1',
      fieldIdentity: 'body',
      language: 'javascript',
      theme: 'vs-dark',
      enableFolding: true,
    }),
  );
  assert.notEqual(
    baseKey,
    getNodeEditorCodeEditorMountKey({
      nodeId: 'node-1',
      fieldIdentity: 'body',
      language: 'json',
      theme: 'prompt-interpolation-molten',
      enableFolding: true,
    }),
  );
  assert.notEqual(
    baseKey,
    getNodeEditorCodeEditorMountKey({
      nodeId: 'node-1',
      fieldIdentity: 'body',
      language: 'json',
      theme: 'prompt-interpolation-grapefruit',
      enableFolding: true,
    }),
  );
  assert.notEqual(
    baseKey,
    getNodeEditorCodeEditorMountKey({
      nodeId: 'node-1',
      fieldIdentity: 'body',
      language: 'json',
      theme: 'vs-dark',
      enableFolding: false,
    }),
  );
});

test('getNodeEditorCodeEditorMountKey stays stable when structural editor inputs do not change', () => {
  const args = {
    nodeId: 'node-1',
    fieldIdentity: 'body',
    language: 'json',
    theme: 'vs-dark',
    enableFolding: true,
  } as const;

  assert.equal(getNodeEditorCodeEditorMountKey(args), getNodeEditorCodeEditorMountKey(args));
});
