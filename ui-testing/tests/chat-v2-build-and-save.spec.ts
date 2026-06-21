import { test, expect, Page, Locator } from '@playwright/test';
import { parse as parseYaml } from 'yaml';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, openModelConfig, closeSettings, ensureExpanded, addNode } from './helpers';
import { createRun, readArtifact } from './artifacts';

/**
 * chat-v2 build-and-save artifact spec. Drives the full authoring + binding flow through the UI,
 * saves a real `.rivet-project` via the forced-download path, and asserts the **saved file's
 * content** by parsing the YAML (no UI reopen — sidesteps the viewport-reset / re-find-the-node
 * brittleness). Produces a durable, openable artifact: a committed sample fixture (a "before 009"
 * baseline + reusable fixture) and conclusively closes the Phase-1 [PARTIAL] persistence question.
 *
 * Normal runs save under the gitignored artifacts/<run>/. Set WRITE_FIXTURE=1 to also refresh the
 * committed snapshot at fixtures/chat-v2-modelconfig-sample.rivet-project (kept out of normal runs
 * so the entity nanoids / timestamps don't churn the tracked file).
 */

const OMLX_BASE_URL = process.env.OMLX_BASE_URL || 'http://host.lima.internal:9090/v1';
const OMLX_MODEL = process.env.OMLX_MODEL || 'Qwen3.6-35B-A3B-nvfp4';
const WRITE_FIXTURE = process.env.WRITE_FIXTURE === '1';
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'chat-v2-modelconfig-sample.rivet-project');

// --- small chat-v2 authoring utilities (react-select / inputs don't always wire fieldProps) ------
function afterLabel(page: Page, label: string, kind: 'input' | 'combo' = 'input'): Locator {
  const sel = kind === 'combo' ? '*[@role="combobox"]' : 'input';
  return page.getByText(label, { exact: true }).locator(`xpath=following::${sel}[1]`);
}
async function pickAfter(page: Page, label: string, value: string): Promise<void> {
  const combo = afterLabel(page, label, 'combo');
  await combo.click();
  const id = (await combo.getAttribute('id')) || '';
  const base = id.replace(/-input$/, '');
  const menu = base ? page.locator(`#${base}-listbox`) : page.locator('[class*="menu"]');
  await expect(menu).toBeVisible({ timeout: 5000 });
  await menu.getByText(value, { exact: true }).click();
}
async function fillAfter(page: Page, label: string, value: string): Promise<void> {
  await afterLabel(page, label).fill(value);
}
async function cardDone(page: Page): Promise<void> {
  await page.getByRole('dialog', { name: 'Project settings' }).getByRole('button', { name: 'Done' }).first().click();
}
/** Pick from a node-editor selector combobox (these DO wire the accessible name). */
async function pickNodeSelector(page: Page, comboName: string, value: string): Promise<void> {
  const combo = page.getByRole('combobox', { name: comboName });
  await combo.click();
  const id = (await combo.getAttribute('id')) || '';
  const menu = page.locator(`#${id.replace(/-input$/, '')}-listbox`);
  await expect(menu).toBeVisible({ timeout: 5000 });
  await menu.getByText(value, { exact: true }).click();
}

type SerializedProject = {
  data?: {
    modelConfig?: {
      profiles?: Array<Record<string, unknown>>;
      skills?: Array<Record<string, unknown>>;
      presets?: Array<Record<string, unknown>>;
    };
    // Serialized nodes are a keyed object: `'[<id>]:<type> "<title>"' -> node`. The type is in the key.
    graphs?: Record<string, { nodes?: Record<string, Record<string, unknown>> }>;
  };
};

test('chat-v2 build-and-save: author → bind → save → assert the .rivet-project content', async ({ page }) => {
  test.setTimeout(180_000);
  const run = createRun('chat-v2-modelconfig');

  // Force the LegacyBrowserIOProvider blob download (the FS-Access picker can't be driven).
  await page.addInitScript(() => {
    let o: unknown = window;
    while (o) {
      if (Object.prototype.hasOwnProperty.call(o, 'showSaveFilePicker')) {
        try {
          delete (o as Record<string, unknown>).showSaveFilePicker;
        } catch {
          /* non-configurable */
        }
      }
      o = Object.getPrototypeOf(o);
    }
  });

  // ---- Author the modelConfig ----
  await createProject(page, 'Chat-v2 ModelConfig Sample');
  const downloadSaveForced = !(await page.evaluate(() => 'showSaveFilePicker' in window));
  run.note('legacyDownloadSaveForced', downloadSaveForced);
  await openModelConfig(page);

  await test.step('Profiles (custom oMLX + hosted openai)', async () => {
    await page.getByRole('button', { name: 'Add Profile' }).click();
    await page.getByRole('textbox', { name: 'e.g. Claude (planning)' }).fill('oMLX Local');
    await pickAfter(page, 'Provider', 'Custom provider');
    await fillAfter(page, 'Provider base URL', OMLX_BASE_URL);
    await fillAfter(page, 'Fallback model (optional)', OMLX_MODEL);
    await cardDone(page);

    await page.getByRole('button', { name: 'Add Profile' }).click();
    await page.getByRole('textbox', { name: 'e.g. Claude (planning)' }).fill('OpenAI');
    await fillAfter(page, 'Fallback model (optional)', 'gpt-5'); // provider defaults to openai
    await cardDone(page);
    await run.shot(page, 'profiles');
  });

  await test.step('Skill (base + custom provider block + escape-hatch extraBody)', async () => {
    await page.getByRole('button', { name: 'Add Skill' }).click();
    await page.getByRole('textbox', { name: 'e.g. Developer' }).fill('No-think');
    await page.getByText('Temperature (optional)', { exact: true })
      .locator('xpath=following::input[@type="number"][1]').fill('0.2');
    await page.getByText('Max tokens (optional)', { exact: true })
      .locator('xpath=following::input[@type="number"][1]').fill('2048');
    await pickAfter(page, 'Reasoning level (optional)', 'Low');
    // Enable the Custom provider block, set its model + extraBody (the thinking toggle).
    await page.getByText('Configure Custom provider', { exact: true })
      .locator('xpath=preceding::input[1]').dispatchEvent('click');
    await page.getByPlaceholder(/Model id/).fill(OMLX_MODEL);
    await page.getByPlaceholder(/Provider-specific body params/)
      .fill('{"chat_template_kwargs":{"enable_thinking":false}}');
    await cardDone(page);
    await run.shot(page, 'skill');
  });

  await test.step('Preset (oMLX profile + skill + an override)', async () => {
    await page.getByRole('button', { name: 'Add Preset' }).click();
    await page.getByRole('textbox', { name: /Planner \(Claude\)/ }).fill('Coder (oMLX)');
    await pickAfter(page, 'Profile (connection)', 'oMLX Local');
    await pickAfter(page, 'Skill (behavior, optional)', 'No-think');
    // One override: toggle "Override Max tokens" on, then set a concrete value. The override input is
    // disabled until the presence toggle takes, and the controlled <input> needs a blur to commit the
    // onChange (a plain .fill() left it at the toggle's initial 0 — the fixture bug).
    const toggle = page.getByRole('dialog', { name: 'Project settings' }).getByLabel('Override Max tokens');
    await toggle.dispatchEvent('click');
    const overrideInput = toggle.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " override-field-row ")]//input[@type="number"]',
    );
    await expect(overrideInput).toBeEnabled({ timeout: 5000 });
    await overrideInput.fill('4096');
    await overrideInput.blur(); // commit the controlled-input onChange
    run.note('overrideMaxTokens', 4096);
    await cardDone(page);
    await run.shot(page, 'preset');
  });

  await closeSettings(page);

  // ---- Place an LLM Chat node and bind the Preset ----
  await test.step('Bind the Preset on an LLM Chat node', async () => {
    await addNode(page, 'LLM Chat', 'LLM Chat');
    await ensureExpanded(page, 'Model config');
    await pickNodeSelector(page, 'Preset', 'Coder (oMLX)');
    await run.shot(page, 'node-bound');
  });

  // ---- Save the .rivet-project via the forced download path ----
  expect(downloadSaveForced, 'the FS-Access picker must be forced off so the save is automatable').toBe(true);
  const projPath = run.file('chat-v2-modelconfig-sample.rivet-project');
  await test.step('Save to disk', async () => {
    await page.getByText('Menu', { exact: true }).first().click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Save project as...', { exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(projPath);
    await run.shot(page, 'saved');
  });

  // ---- Assert the saved file's content (parse YAML — no UI reopen) ----
  const text = readArtifact(projPath);
  const parsed = parseYaml(text) as SerializedProject;
  const mc = parsed.data?.modelConfig ?? {};
  const profiles = mc.profiles ?? [];
  const skills = mc.skills ?? [];
  const presets = mc.presets ?? [];

  const omlx = profiles.find((p) => p.name === 'oMLX Local');
  const openai = profiles.find((p) => p.name === 'OpenAI');
  const skill = skills.find((s) => s.name === 'No-think');
  const preset = presets.find((p) => p.name === 'Coder (oMLX)');

  // Profiles: both provider paths present, key connection fields persisted.
  expect(omlx, 'oMLX profile embedded').toBeTruthy();
  expect(omlx!.provider).toBe('custom');
  expect(omlx!.customProviderBaseURL).toBe(OMLX_BASE_URL);
  expect(omlx!.defaultModel).toBe(OMLX_MODEL);
  expect(openai, 'OpenAI profile embedded').toBeTruthy();
  expect(openai!.provider).toBe('openai');

  // Skill: base params + the custom provider block + the escape-hatch extraBody.
  expect(skill, 'Skill embedded').toBeTruthy();
  const base = (skill!.base ?? {}) as Record<string, unknown>;
  expect(base.temperature).toBe(0.2);
  expect(base.maxTokens).toBe(2048);
  expect(base.reasoningLevel).toBe('low');
  const customBlock = ((skill!.providers ?? {}) as Record<string, Record<string, unknown>>).custom ?? {};
  expect(customBlock.model).toBe(OMLX_MODEL);
  const extra = (customBlock.extraBody ?? {}) as { chat_template_kwargs?: { enable_thinking?: boolean } };
  expect(extra.chat_template_kwargs?.enable_thinking).toBe(false);

  // Preset: bundles the oMLX profile + the skill by id.
  expect(preset, 'Preset embedded').toBeTruthy();
  expect(preset!.profileId).toBe(omlx!.id);
  expect(preset!.skillId).toBe(skill!.id);
  // A concrete override (exercises the 009 card's "overridden" marker live).
  expect((preset!.overrides as Record<string, unknown> | undefined)?.maxTokens).toBe(4096);

  // The node carries the expected llmPresetId. Nodes are keyed `'[<id>]:<type> "<title>"'`.
  const graphs = parsed.data?.graphs ?? {};
  const nodeEntries = Object.values(graphs).flatMap((g) => Object.entries(g.nodes ?? {}));
  const chatEntry = nodeEntries.find(([key]) => key.includes(':llmChatV2'));
  expect(chatEntry, 'an llmChatV2 node is in the saved graph').toBeTruthy();
  const chatNode = chatEntry![1];
  expect((chatNode.data as Record<string, unknown>).llmPresetId).toBe(preset!.id);

  // ---- Emit the artifact ----
  run.note('savedProjectBytes', text.length);
  run.note('profileNames', profiles.map((p) => p.name));
  run.note('presetId', preset!.id);
  run.note('nodeLlmPresetId', (chatNode.data as Record<string, unknown>).llmPresetId);
  if (WRITE_FIXTURE) {
    mkdirSync(join(__dirname, '..', 'fixtures'), { recursive: true });
    copyFileSync(projPath, FIXTURE_PATH);
    run.note('fixtureRefreshed', FIXTURE_PATH);
    console.log('FIXTURE written:', FIXTURE_PATH);
  }
  run.writeManifest({ status: 'passed', omlxBaseURL: OMLX_BASE_URL, model: OMLX_MODEL });
  console.log('SAVED .rivet-project asserted at', projPath);
});
