import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * LIVE validation — the arbitration harness runs in BROWSER-EXECUTOR mode and actually hits oMLX.
 *
 * The default executor is 'browser' (useLocalExecutor → GraphProcessor in the page thread), so the
 * LLM Chat nodes issue a client-side fetch. This proves the browser-executor path end-to-end against
 * oMLX — which the headless runGraph (Node executor) did NOT cover — and isolates Peter's Mac failure
 * to pure DNS: graph + client-side execution + oMLX + CORS + (keyless) auth all work here.
 *
 * Base URL: the saved fixture bakes `http://localhost:9090/v1` — the Mac-browser case (oMLX on the
 * Mac; keyless Profiles, works out-of-box there). For a VM run (Playwright-in-VM, where `localhost`
 * is the VM, not the Mac) set **OMLX_BASE_URL** — the test patches the loaded fixture's 4 Profile base
 * URLs to it. In the VM: `RUN_OMLX=1 OMLX_BASE_URL=http://host.lima.internal:9090/v1`. oMLX binds
 * 0.0.0.0 and sends `Access-Control-Allow-Origin: *`; the Profiles are keyless (no env var needed).
 *
 * Gated live (needs oMLX up): run with RUN_OMLX=1. Not part of the default suite.
 */

const RUN_OMLX = process.env.RUN_OMLX === '1';
const FIXTURE = join(__dirname, '..', 'fixtures', 'arbitration-harness.rivet-project');
const FIXTURE_DEFAULT_URL = 'http://localhost:9090/v1';
const OMLX_BASE_URL = process.env.OMLX_BASE_URL; // override the baked localhost for VM runs
const EFFECTIVE_BASE_URL = OMLX_BASE_URL ?? FIXTURE_DEFAULT_URL;

/** Load the fixture, patching the 4 Profile base URLs to OMLX_BASE_URL when set (→ a temp file). */
function fixtureToLoad(): string {
  if (!OMLX_BASE_URL) {
    return FIXTURE;
  }
  const patched = readFileSync(FIXTURE, 'utf8').split(FIXTURE_DEFAULT_URL).join(OMLX_BASE_URL);
  const tmp = join(tmpdir(), 'arbitration-harness.patched.rivet-project');
  writeFileSync(tmp, patched, 'utf8');
  return tmp;
}

test.describe('arbitration harness — browser executor vs oMLX (live)', () => {
  test.skip(!RUN_OMLX, 'Opt-in: set RUN_OMLX=1 (needs oMLX up). Proves the browser-executor path hits oMLX.');

  test('loads the saved project, runs in the browser, and hits oMLX for the full chain', async ({ page }) => {
    test.setTimeout(180_000);

    // Capture the client-side LLM requests + any that fail (Peter's Mac symptom would show as failed).
    const completions: { url: string; status: number }[] = [];
    const failed: { url: string; failure: string }[] = [];
    page.on('response', (r) => {
      if (r.request().method() === 'POST' && r.url().includes('/v1/chat/completions')) {
        completions.push({ url: r.url(), status: r.status() });
      }
    });
    page.on('requestfailed', (r) => {
      if (r.url().includes('/v1/chat/completions') || r.url().includes('9090')) {
        failed.push({ url: r.url(), failure: r.failure()?.errorText ?? 'unknown' });
      }
    });

    // Force the file-<input> open path (delete the FS-Access pickers so Playwright can drive it).
    await page.addInitScript(() => {
      let o: unknown = window;
      while (o) {
        for (const key of ['showOpenFilePicker', 'showSaveFilePicker']) {
          if (Object.prototype.hasOwnProperty.call(o, key)) {
            try {
              delete (o as Record<string, unknown>)[key];
            } catch {
              /* non-configurable */
            }
          }
        }
        o = Object.getPrototypeOf(o);
      }
    });

    await page.goto('/');

    // Load the saved .rivet-project via the welcome screen's "Open project" → hidden file input.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Open project' }).click(),
    ]);
    await chooser.setFiles(fixtureToLoad());

    // Project loaded → the editor chrome appears.
    await expect(page.getByRole('button', { name: 'Project settings' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Run project' })).toBeVisible();

    // Run the whole graph in the browser.
    await page.getByRole('button', { name: 'Run project' }).click();

    // Each LLM Chat node = one POST. The full chain is agentA + agentB + arbiter + resume → ≥4.
    // The resume POST firing proves the arbiter picked AND GetGlobal (wait:true) fetched the winner.
    await expect
      .poll(() => completions.filter((c) => c.status === 200).length, {
        timeout: 150_000,
        message: 'successful POST /v1/chat/completions (browser → oMLX)',
      })
      .toBeGreaterThanOrEqual(4);

    const ok = completions.filter((c) => c.status === 200);
    console.log(`oMLX completions: ${ok.length} successful POSTs; sample URL = ${ok[0]?.url}`);
    console.log(`failed LLM/oMLX requests: ${failed.length}`, failed.slice(0, 3));

    // No client-side fetch failures (the Mac symptom would be ERR_NAME_NOT_RESOLVED here).
    expect(failed, 'no client-side oMLX request should fail in the VM browser').toHaveLength(0);
    // The request really went to the effective base URL (the patched override, or the baked default).
    expect(ok[0]?.url).toContain(new URL(EFFECTIVE_BASE_URL).host);
  });
});
