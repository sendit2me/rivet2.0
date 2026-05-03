import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const repoRoot = resolve(appDir, '..', '..');
const yarnPath = resolve(repoRoot, '.yarn', 'releases', 'yarn-4.6.0.cjs');
const syncDesktopVersionScript = resolve(repoRoot, 'scripts', 'sync-desktop-version.mjs');

const syncResult = spawnSync(process.execPath, [syncDesktopVersionScript], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1);
}

const result = spawnSync(
  process.execPath,
  ['--max-old-space-size=8192', yarnPath, 'workspace', '@valerypopoff/rivet-app-executor', 'run', 'build'],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
