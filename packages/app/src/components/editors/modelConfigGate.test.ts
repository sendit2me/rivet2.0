import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

// The "Show overrides / advanced editor" gate was removed (cleanup cut #1): R2 deleted the only editor
// groups that ever set `advanced`, leaving the whole mechanism with zero producers, so its assertions
// are gone with it. The extraBody JSON custom-editor registration below is unrelated and still live.
const customEditor = read('CustomEditor.tsx');

test('the extraBody JSON custom editor is registered', () => {
  assert.match(customEditor, /\.with\('extraBodyJson', \(\) => <ExtraBodyJsonEditor /);
});
