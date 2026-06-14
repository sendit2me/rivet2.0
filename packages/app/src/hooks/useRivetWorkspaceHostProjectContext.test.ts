import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hooksDir = dirname(fileURLToPath(import.meta.url));

test('workspace host releases cached context atoms without deleting persisted context values', () => {
  const savedGraphsSource = readFileSync(join(hooksDir, '..', 'state', 'savedGraphs.ts'), 'utf8');
  const workspaceHostSource = readFileSync(join(hooksDir, 'useRivetWorkspaceHost.ts'), 'utf8');

  assert.match(savedGraphsSource, /export function releaseProjectContextState\(projectId: ProjectId\): void \{/);
  assert.match(savedGraphsSource, /projectContextState\.remove\(projectId\);/);
  assert.doesNotMatch(savedGraphsSource, /storage\.removeItem\(`projectContext__"\$\{projectId\}"`\)/);
  assert.match(workspaceHostSource, /releaseProjectContextState\(currentProjectId\);/);
  assert.match(workspaceHostSource, /releaseProjectContextState\(projectId\);/);
  assert.doesNotMatch(workspaceHostSource, /clearProjectContextState/);
});
