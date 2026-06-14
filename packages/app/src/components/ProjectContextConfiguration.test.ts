import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('project context value edits flush app-local project storage immediately', () => {
  const source = readFileSync(join(componentsDir, 'ProjectContextConfiguration.tsx'), 'utf8');

  assert.match(source, /import \{ flushHybridStorageGroup \} from '\.\.\/state\/storage\.js';/);
  assert.match(source, /function persistProjectContextValues\(\): void \{/);
  assert.match(source, /flushHybridStorageGroup\('project'\)/);
  assert.match(source, /handleError\(error, 'Failed to persist project context values', \{ toastError: false \}\);/);
  assert.equal((source.match(/persistProjectContextValues\(\);/g) ?? []).length, 2);
});
