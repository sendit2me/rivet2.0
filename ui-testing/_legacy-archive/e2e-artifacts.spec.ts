import { test, expect } from '@playwright/test';
import {
  createProject, openModelConfig, closeSettings, addProfile, addPreset, saveCard,
  ensureExpanded, pickOption, addNodeAt, setTextNodeContent, wirePorts,
} from './helpers';
import { createRun, copyToArtifacts, readArtifact } from './artifacts';

/**
 * Full E2E that ALSO leaves durable proof-of-work on disk (e2e-test-plan.md Phase 1–3 + the
 * artifacts process documented in CLAUDE.md). Per run it writes ui-testing/artifacts/<runId>/ with
 * numbered step screenshots, the saved `.rivet-project`, and manifest.json; and refreshes the
 * convenience copy artifacts/e2e-modelconfig.rivet-project.
 *
 * Gated behind RUN_EXEC=1 (it runs against oMLX). Save uses Rivet's LegacyBrowserIOProvider download
 * path, forced by removing window.showSaveFilePicker before load (otherwise the FS-Access picker —
 * a native dialog Playwright can't drive — would be used; we detect that and skip the save safely).
 */

const RUN_EXEC = process.env.RUN_EXEC === '1';
const OMLX_ENDPOINT = process.env.OMLX_ENDPOINT || 'http://host.lima.internal:9090/v1/chat/completions';
const OMLX_MODEL = process.env.OMLX_MODEL || 'Qwen3.6-35B-A3B-nvfp4';

async function addReasonedSkill(page): Promise<void> {
  await page.getByRole('button', { name: 'Add Skill' }).click();
  await page.getByRole('textbox', { name: 'e.g. Developer' }).fill('Reasoned');
  await page.getByText('Temperature (optional)', { exact: true })
    .locator('xpath=following::input[@type="number"][1]').fill('0');
  await page.getByText('Response format (optional)', { exact: true })
    .locator('xpath=following::input[@role="combobox"][1]').click();
  await page.getByText('Text', { exact: true }).last().click();
  await page.getByPlaceholder(/Generic per-request body params/)
    .fill('{"chat_template_kwargs": {"enable_thinking": true}}');
  await saveCard(page, 'e.g. Developer');
  await expect(page.getByText('Reasoned', { exact: true })).toBeVisible();
}

test.describe('E2E artifacts (against oMLX)', () => {
  test.skip(!RUN_EXEC, 'Opt-in: set RUN_EXEC=1 (needs oMLX + open CORS). Captures artifacts/<runId>/.');

  test('capture full E2E proof: author → build → run → save .rivet-project', async ({ page }) => {
    test.setTimeout(240_000);
    const run = createRun('e2e-modelconfig');

    // Force the LegacyBrowserIOProvider (blob download) by removing showSaveFilePicker before load.
    await page.addInitScript(() => {
      let o: any = window;
      while (o) {
        if (Object.prototype.hasOwnProperty.call(o, 'showSaveFilePicker')) {
          try { delete o.showSaveFilePicker; } catch { /* non-configurable */ }
        }
        o = Object.getPrototypeOf(o);
      }
    });

    // --- Phase 1: author ---
    await createProject(page, 'E2E ModelConfig');
    const downloadSaveAvailable = !(await page.evaluate(() => 'showSaveFilePicker' in window));
    run.note('legacyDownloadSaveForced', downloadSaveAvailable);
    await run.shot(page, 'project-created');

    await openModelConfig(page);
    await addProfile(page, { name: 'oMLX Local', endpoint: OMLX_ENDPOINT, model: OMLX_MODEL });
    await run.shot(page, 'profile-authored');
    await addReasonedSkill(page);
    await run.shot(page, 'skill-authored');
    await addPreset(page, { name: 'Local Reasoned', profile: 'oMLX Local', skill: 'Reasoned' });
    await run.shot(page, 'preset-authored');
    await closeSettings(page);

    // --- Phase 1: build graph Text → Chat ---
    await page.getByRole('button', { name: 'Untitled Graph' }).click();
    await addNodeAt(page, 300, 170, 'Text', 'Text');
    await setTextNodeContent(page, 'what is 17 + 26? answer with the number only');
    await page.keyboard.press('Escape');
    await page.mouse.click(900, 300);
    await run.shot(page, 'text-node');

    await addNodeAt(page, 300, 450, 'Chat', 'Chat (Legacy)');
    await ensureExpanded(page, 'Advanced');
    await pickOption(page, 'Preset', 'Local Reasoned');
    await page.getByRole('textbox', { name: /Custom Model/i }).fill(OMLX_MODEL);
    await wirePorts(page, 'Output', 'Prompt');
    await run.shot(page, 'graph-wired');

    // --- Phase 2: run against oMLX ---
    await page.getByRole('button', { name: 'Run project' }).click();
    await expect(page.getByText(/Error processing|OpenAIError|404|CORS/i)).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByText('43', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
    run.note('runResult', '43 (deterministic 17+26 via oMLX)');
    await run.shot(page, 'run-result-43');

    // --- Phase 3: save the project to disk ---
    if (downloadSaveAvailable) {
      await page.getByText('Menu', { exact: true }).first().click();
      await run.shot(page, 'menu-open');
      const downloadPromise = page.waitForEvent('download');
      await page.getByText('Save project as...', { exact: true }).click();
      const download = await downloadPromise;
      const projPath = run.file('e2e-modelconfig.rivet-project');
      await download.saveAs(projPath);
      await run.shot(page, 'saved');

      // 006 portability-at-rest: the modelConfig (Profile/Skill/Preset) is embedded in the file.
      const yamlText = readArtifact(projPath);
      for (const needle of ['oMLX Local', 'Reasoned', 'Local Reasoned', OMLX_MODEL]) {
        expect(yamlText, `saved project should embed "${needle}"`).toContain(needle);
      }
      const latest = copyToArtifacts(projPath, 'e2e-modelconfig.rivet-project');
      run.note('savedProjectPath', projPath);
      run.note('latestCopyPath', latest);
      run.note('savedProjectBytes', yamlText.length);
      run.note('embedsModelConfig', true);
    } else {
      // FS-Access picker is in use (native dialog) — cannot be automated; leave for a manual save.
      run.note('savedProjectPath', null);
      run.note('saveSkippedReason', 'showSaveFilePicker present → FS-Access picker (not automatable)');
    }

    const dir = run.writeManifest({ status: 'passed', endpoint: OMLX_ENDPOINT, model: OMLX_MODEL });
    console.log('ARTIFACTS run dir =', dir);
  });
});
