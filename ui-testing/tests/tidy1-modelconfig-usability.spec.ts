import { test, expect, Page, Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, openModelConfig, closeSettings, ensureExpanded, addNode } from './helpers';

/**
 * Tidy-up Phase 1 — chat-v2 model-config UI usability pass (read-only exploration).
 * Goal: findings + screenshots against the checklist, NOT pass/fail regression. Risky steps are
 * wrapped so a single brittle interaction (canvas) doesn't lose the screenshots before it.
 * The legacy Flows are invalidated by the excision; this is a fresh light checklist on chat-v2.
 */

const SHOT_DIR = join(__dirname, '..', 'artifacts', 'tidy1');
mkdirSync(SHOT_DIR, { recursive: true });
let n = 0;
async function shot(page: Page, name: string): Promise<void> {
  n += 1;
  const file = join(SHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`SHOT ${file}`);
}

/** Locate the control following a visible label (react-select / inputs don't always wire fieldProps). */
function afterLabel(page: Page, label: string, kind: 'input' | 'combo' = 'input'): Locator {
  const sel = kind === 'combo' ? '*[@role="combobox"]' : 'input';
  return page.getByText(label, { exact: true }).locator(`xpath=following::${sel}[1]`);
}

/** Open a react-select by clicking the control after a label, return its menu. */
async function openSelectAfter(page: Page, label: string): Promise<Locator> {
  const combo = afterLabel(page, label, 'combo');
  await combo.click();
  const id = (await combo.getAttribute('id')) || '';
  const base = id.replace(/-input$/, '');
  const menu = base ? page.locator(`#${base}-listbox`) : page.locator('[class*="menu"]');
  await expect(menu).toBeVisible({ timeout: 5000 });
  return menu;
}

async function pickAfter(page: Page, label: string, value: string): Promise<void> {
  const menu = await openSelectAfter(page, label);
  await menu.getByText(value, { exact: true }).click();
}

test('chat-v2 model-config UI — usability exploration', async ({ page }) => {
  test.setTimeout(180_000);

  // ---- Setup ----
  await createProject(page, 'Tidy1');
  await openModelConfig(page);
  await shot(page, 'modelconfig-section-open');

  // ===== Checklist 1 — Profile authoring (custom) =====
  await test.step('Profile (custom)', async () => {
    await page.getByRole('button', { name: 'Add Profile' }).click();
    await page.getByRole('textbox', { name: 'e.g. Claude (planning)' }).fill('oMLX (custom)');
    await shot(page, 'profile-custom-default-provider'); // default provider = openai; what fields show?
    await pickAfter(page, 'Provider', 'Custom provider');
    await shot(page, 'profile-custom-after-pick'); // expect customProviderBaseURL + env var fields
    // probe which conditional fields are present
    const hasCustomBaseURL = await page.getByText('Provider base URL', { exact: true }).count();
    const hasEnvVar = await page.getByText('API key env var (optional)', { exact: true }).count();
    const hasHostedBaseURL = await page.getByText('Base URL (optional)', { exact: true }).count();
    console.log(`PROBE custom: providerBaseURL=${hasCustomBaseURL} envVar=${hasEnvVar} hostedBaseURL=${hasHostedBaseURL}`);
    await afterLabel(page, 'Provider base URL').fill('http://host.lima.internal:9090/v1').catch(() => {});
    await afterLabel(page, 'Fallback model (optional)').fill('Qwen3.6-35B-A3B-nvfp4').catch(() => {});
    await shot(page, 'profile-custom-filled');
    await page.getByRole('dialog', { name: 'Project settings' }).getByRole('button', { name: 'Done' }).first().click().catch(() => {});
  });

  // ===== Checklist 1 — Profile authoring (hosted / openai) =====
  await test.step('Profile (openai)', async () => {
    await page.getByRole('button', { name: 'Add Profile' }).click();
    await page.getByRole('textbox', { name: 'e.g. Claude (planning)' }).fill('OpenAI');
    // default provider should already be openai → hosted Base URL visible, custom fields hidden
    const hasHostedBaseURL = await page.getByText('Base URL (optional)', { exact: true }).count();
    const hasCustomBaseURL = await page.getByText('Provider base URL', { exact: true }).count();
    console.log(`PROBE openai(default): hostedBaseURL=${hasHostedBaseURL} providerBaseURL=${hasCustomBaseURL}`);
    await shot(page, 'profile-openai');
    await afterLabel(page, 'Fallback model (optional)').fill('gpt-5').catch(() => {});
    await page.getByRole('dialog', { name: 'Project settings' }).getByRole('button', { name: 'Done' }).first().click().catch(() => {});
    await shot(page, 'profiles-listed');
  });

  // ===== Checklist 2 — Skill authoring (base + custom provider block) =====
  await test.step('Skill', async () => {
    await page.getByRole('button', { name: 'Add Skill' }).click();
    await page.getByRole('textbox', { name: 'e.g. Developer' }).fill('No-think');
    await shot(page, 'skill-form-top'); // base subsection + per-provider blocks subsection
    // base temperature
    await page.getByText('Temperature (optional)', { exact: true }).locator('xpath=following::input[@type="number"][1]').fill('0.2').catch(() => {});
    await pickAfter(page, 'Reasoning level (optional)', 'Low').catch(() => {});
    await shot(page, 'skill-base-filled');
    // enable the Custom provider block
    const customToggleRow = page.getByText('Configure Custom provider', { exact: true });
    if (await customToggleRow.count()) {
      await customToggleRow.first().locator('xpath=preceding::input[1]').dispatchEvent('click').catch(() => {});
      await shot(page, 'skill-custom-block-enabled');
    } else {
      console.log('PROBE: "Configure Custom provider" toggle not found by that text');
    }
    await shot(page, 'skill-full');
    await page.getByRole('dialog', { name: 'Project settings' }).getByRole('button', { name: 'Done' }).first().click().catch(() => {});
  });

  // ===== Checklist 3 — Preset authoring =====
  await test.step('Preset', async () => {
    await page.getByRole('button', { name: 'Add Preset' }).click();
    await page.getByRole('textbox', { name: /Planner \(Claude\)/ }).fill('Coder (oMLX)');
    await shot(page, 'preset-form');
    await pickAfter(page, 'Profile (connection)', 'oMLX (custom)').catch((e) => console.log('preset profile pick failed', e.message));
    await pickAfter(page, 'Skill (behavior, optional)', 'No-think').catch((e) => console.log('preset skill pick failed', e.message));
    await shot(page, 'preset-bundled');
    // overrides subsection
    await ensureExpanded(page, 'Overrides (advanced)').catch(() => {});
    await shot(page, 'preset-overrides');
    await page.getByRole('dialog', { name: 'Project settings' }).getByRole('button', { name: 'Done' }).first().click().catch(() => {});
    await shot(page, 'all-entities-listed');
  });

  await closeSettings(page).catch(() => {});

  // ===== Checklist 4 + 6 — Node selectors + rail =====
  await test.step('Node selectors', async () => {
    try {
      await addNode(page, 'LLM Chat', 'LLM Chat');
      await shot(page, 'node-added');
      await ensureExpanded(page, 'Model config');
      await shot(page, 'node-modelconfig-group');
      // Probe the three selector comboboxes
      for (const label of ['Preset', 'Profile', 'Skill']) {
        const cnt = await page.getByRole('combobox', { name: label }).count();
        console.log(`PROBE node selector '${label}' combobox count=${cnt}`);
      }
      // Select the preset
      await pickOptionByName(page, 'Preset', 'Coder (oMLX)').catch((e) => console.log('node preset pick failed', e.message));
      await shot(page, 'node-preset-selected');
      // Does selecting a preset change the node BODY (effective values), or does it still show node defaults?
      const bodyShowsCustom = await page.getByText(/Custom provider|Qwen/, { exact: false }).count();
      console.log(`PROBE node body reflects preset effective values? matches=${bodyShowsCustom} (0 = body still shows node's own defaults)`);
    } catch (e) {
      console.log('NODE STEP failed (canvas brittleness):', (e as Error).message);
      await shot(page, 'node-step-failure');
    }
  });

  // ===== Checklist 5 — The round-trip (pivot-trigger): persistence across reload =====
  await test.step('Round-trip (reload)', async () => {
    await page.reload();
    await expect(page.getByRole('button', { name: 'Project settings' })).toBeVisible({ timeout: 15000 });
    // Entities persist?
    await openModelConfig(page).catch(() => {});
    const profilesPersist = await page.getByText('oMLX (custom)', { exact: true }).count();
    const presetPersist = await page.getByText('Coder (oMLX)', { exact: true }).count();
    console.log(`PROBE after reload: profile 'oMLX (custom)' listed=${profilesPersist}, preset 'Coder (oMLX)' listed=${presetPersist}`);
    await shot(page, 'reload-entities-persist');
    await closeSettings(page).catch(() => {});
    // Node selector persists? Re-open the node editor (the node is still on the canvas).
    await page.getByRole('button', { name: 'Untitled Graph' }).click().catch(() => {});
    await page.mouse.click(560, 545).catch(() => {}); // click the node card to select/open it
    await ensureExpanded(page, 'Model config').catch(() => {});
    await shot(page, 'reload-node-selector');
    const presetStillSelected = await page.getByText('Coder (oMLX)', { exact: true }).count();
    console.log(`PROBE after reload: node Preset selector still shows 'Coder (oMLX)'? matches=${presetStillSelected}`);
  });

  console.log(`\nSCREENSHOTS in ${SHOT_DIR} (${n} captured)`);
});

/** Pick from a react-select located by its accessible name (node selectors DO wire the combobox name). */
async function pickOptionByName(page: Page, comboName: string, value: string): Promise<void> {
  const combo = page.getByRole('combobox', { name: comboName });
  await combo.click();
  const id = (await combo.getAttribute('id')) || '';
  const base = id.replace(/-input$/, '');
  const menu = page.locator(`#${base}-listbox`);
  await expect(menu).toBeVisible({ timeout: 5000 });
  await menu.getByText(value, { exact: true }).click();
}
