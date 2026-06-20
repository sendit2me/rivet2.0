import { type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Proof-of-work artifact capture for E2E runs. Each run gets its own timestamped directory under
 * `ui-testing/artifacts/<runId>/` holding numbered step screenshots, any saved files (e.g. the
 * `.rivet-project`), and a `manifest.json` summarising the steps + results. These are durable
 * evidence: hand them to a user/agent to understand the UI, or cite them when reporting a bug.
 *
 * Usage:
 *   const run = createRun('e2e-modelconfig');
 *   await run.shot(page, 'project-created');
 *   ... run.file('x.rivet-project') ... run.note('key', value) ...
 *   run.writeManifest({ status: 'passed' });
 */
export function createRun(label = 'run') {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const runId = `${stamp}_${label}`;
  // `npx playwright test` runs with cwd = ui-testing/, so artifacts/ lands beside tests/.
  const root = path.resolve(process.cwd(), 'artifacts');
  const dir = path.join(root, runId);
  fs.mkdirSync(dir, { recursive: true });

  let n = 0;
  const steps: Array<{ step: number; name: string; screenshot: string }> = [];
  const notes: Record<string, unknown> = {};

  return {
    runId,
    dir,
    /** Capture a numbered, named full-window screenshot into the run dir. */
    async shot(page: Page, name: string): Promise<string> {
      n += 1;
      const fileName = `${pad(n)}-${name}.png`;
      await page.screenshot({ path: path.join(dir, fileName) });
      steps.push({ step: n, name, screenshot: fileName });
      return fileName;
    },
    /** Absolute path for a file to be written into the run dir (e.g. the saved project). */
    file(name: string): string {
      return path.join(dir, name);
    },
    /** Record an arbitrary result/observation into the manifest. */
    note(key: string, value: unknown): void {
      notes[key] = value;
    },
    /** Write manifest.json (steps + notes + any extra fields) and return the run dir. */
    writeManifest(extra: Record<string, unknown> = {}): string {
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ runId, capturedAt: d.toISOString(), steps, notes, ...extra }, null, 2),
      );
      return dir;
    },
  };
}

/** Copy a file to a stable "latest" location (e.g. artifacts/e2e-modelconfig.rivet-project). */
export function copyToArtifacts(srcPath: string, destName: string): string {
  const dest = path.resolve(process.cwd(), 'artifacts', destName);
  fs.copyFileSync(srcPath, dest);
  return dest;
}

/** Read a saved text file (e.g. to verify the embedded modelConfig in a .rivet-project). */
export function readArtifact(p: string): string {
  return fs.readFileSync(p, 'utf8');
}
