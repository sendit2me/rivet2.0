import { test, expect, Locator } from '@playwright/test';
import {
  createProject,
  openModelConfig,
  saveCard,
  editEntity,
  addProfile,
  openComboMenu,
} from './helpers';

/**
 * Feature 005 Phase C1 — authoring forms (object editors + Extends + Overrides). These tests live in
 * Project settings only (no canvas / node placement), so they are immune to the a11y-opaque canvas.
 * The node-side C1 behaviour (Show-overrides) lives in model-config-c1-node.spec.ts.
 *
 * Locator notes (verified against source + a live probe):
 *  - The JSON object editor (Skill extraBody) and the override value inputs do NOT wire Atlaskit
 *    fieldProps to their controls, so their accessible name is NOT the label. The JSON editor is
 *    located by its placeholder (helper text); the override value input by label→following-input.
 *  - The override presence toggles DO expose the label as an aria-label ("Override <Field label>"),
 *    but the Atlaskit Toggle's <input> is visually covered, so toggle it with a forced click.
 *  - "Extends (optional)" is an LlmSelectorField (react-select) — same machinery the Preset
 *    Profile/Skill pickers use — so getByRole('combobox', { name }) + openComboMenu resolve it.
 */

/**
 * Toggle an Atlaskit override presence checkbox to a target state. The Atlaskit Toggle's <input> is
 * visually covered by its styled track, so a normal click isn't actionable; dispatch the click
 * straight to the input element, which flips `checked` and fires Atlaskit's onChange.
 */
async function setToggle(toggle: Locator, on: boolean): Promise<void> {
  if ((await toggle.isChecked()) !== on) {
    await toggle.dispatchEvent('click');
    await expect(toggle).toBeChecked({ checked: on });
  }
}

test.describe('model-config C1 — authoring (extraBody, overrides, Extends)', () => {
  test('C1 — Skill extraBody: valid JSON persists across reload', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);

    await page.getByRole('button', { name: 'Add Skill' }).click();
    await page.getByRole('textbox', { name: 'e.g. Developer' }).fill('JsonSkill');
    const extra = page.getByPlaceholder(/Generic per-request body params/);
    await extra.fill('{"chat_template_kwargs": {"enable_thinking": false}}');
    // Valid input commits: no inline error.
    await expect(page.getByText('Invalid JSON', { exact: false })).toHaveCount(0);
    await saveCard(page, 'e.g. Developer');
    await expect(page.getByText('JsonSkill', { exact: true })).toBeVisible();

    // Persists across reload, with the object re-serialised back into the textarea.
    await page.reload();
    await openModelConfig(page);
    await editEntity(page, 'JsonSkill');
    await expect(page.getByPlaceholder(/Generic per-request body params/)).toHaveValue(/chat_template_kwargs/);
    await expect(page.getByPlaceholder(/Generic per-request body params/)).toHaveValue(/enable_thinking/);
  });

  test('C1 — Skill extraBody: invalid JSON shows an inline error and is NOT saved', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);

    await page.getByRole('button', { name: 'Add Skill' }).click();
    await page.getByRole('textbox', { name: 'e.g. Developer' }).fill('BadJsonSkill');
    await page.getByPlaceholder(/Generic per-request body params/).fill('{ not json');

    // Inline error appears (exact copy from JsonObjectField) and the value is not committed.
    await expect(page.getByText('Invalid JSON — fix to apply (not saved while invalid).')).toBeVisible();

    await saveCard(page, 'e.g. Developer');
    await expect(page.getByText('BadJsonSkill', { exact: true })).toBeVisible();

    // After reload the skill exists but its extraBody was never saved → field is empty.
    await page.reload();
    await openModelConfig(page);
    await editEntity(page, 'BadJsonSkill');
    await expect(page.getByPlaceholder(/Generic per-request body params/)).toHaveValue('');
  });

  test('C1 — Preset override: temperature is OFF (inherited) by default; ON writes it, OFF removes it; persists', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);

    await page.getByRole('button', { name: 'Add Preset' }).click();
    await page.getByRole('textbox', { name: /Planner \(Claude\)/ }).fill('OverridePreset');

    // The Overrides (advanced) subsection is present; temperature starts OFF (inherited): its
    // presence toggle is unchecked and its value input is read-only (not editable).
    await expect(page.getByText('Overrides (advanced)')).toBeVisible();
    const tempToggle = page.getByLabel('Override Temperature (optional)');
    const tempInput = page
      .getByText('Temperature (optional)', { exact: true })
      .locator('xpath=following::input[@type="number"][1]');
    await expect(tempToggle).not.toBeChecked();
    await expect(tempInput).not.toBeEditable();

    // Toggle ON → the input enables and we write a value.
    await setToggle(tempToggle, true);
    await expect(tempToggle).toBeChecked();
    await expect(tempInput).toBeEditable();
    await tempInput.fill('0.5');
    await saveCard(page, /Planner \(Claude\)/);
    await expect(page.getByText('OverridePreset', { exact: true })).toBeVisible();

    // Persists across reload: toggle ON, value 0.5.
    await page.reload();
    await openModelConfig(page);
    await editEntity(page, 'OverridePreset');
    await expect(page.getByLabel('Override Temperature (optional)')).toBeChecked();
    await expect(
      page.getByText('Temperature (optional)', { exact: true }).locator('xpath=following::input[@type="number"][1]'),
    ).toHaveValue('0.5');

    // Toggle OFF → the override is removed; persists as OFF.
    await setToggle(page.getByLabel('Override Temperature (optional)'), false);
    await saveCard(page, /Planner \(Claude\)/);
    await page.reload();
    await openModelConfig(page);
    await editEntity(page, 'OverridePreset');
    await expect(page.getByLabel('Override Temperature (optional)')).not.toBeChecked();
  });

  test('C1 a11y — each project-settings section reports its own unique region name', async ({ page }) => {
    // The C1 a11y fix gave each ProjectInfo section a unique aria region id. Previously the Plugins /
    // Context-values regions both mis-reported their name as "LLM model config"; with the fix each
    // region resolves to its own trigger label. Open both sections so react-collapsible mounts their
    // region content, then assert clean, unambiguous getByRole('region', { name }) locators.
    await createProject(page);
    const dialog = page.getByRole('dialog', { name: 'Project settings' });
    await openModelConfig(page); // expands "LLM model config"
    await page.getByRole('button', { name: 'Plugins', expanded: false }).first().click();

    // Exactly one region is named "LLM model config" (the bug would have made it ≥ 2).
    await expect(dialog.getByRole('region', { name: 'LLM model config' })).toHaveCount(1);
    // The Plugins section now reports its own name, not the model-config one.
    await expect(dialog.getByRole('region', { name: 'Plugins' })).toBeVisible();
  });

  test('C1 — Extends with ONE profile: lists only None and never self', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);
    await addProfile(page, { name: 'Solo' });

    await editEntity(page, 'Solo');
    const menu = await openComboMenu(page, 'Extends (optional)');
    await expect(menu.getByText('None', { exact: true })).toBeVisible();
    await expect(menu.getByText('Solo', { exact: true })).toHaveCount(0);
  });

  test('C1 — Extends with TWO profiles: lists the other profile and excludes self', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);
    await addProfile(page, { name: 'Alpha' });
    await addProfile(page, { name: 'Beta' });

    await editEntity(page, 'Alpha');
    const menu = await openComboMenu(page, 'Extends (optional)');
    await expect(menu.getByText('None', { exact: true })).toBeVisible();
    await expect(menu.getByText('Beta', { exact: true })).toBeVisible();
    await expect(menu.getByText('Alpha', { exact: true })).toHaveCount(0);
  });
});
