import { test, expect } from '@playwright/test';
import {
  createProject,
  openModelConfig,
  closeSettings,
  addProfile,
  addSkill,
  addPreset,
  addChatNode,
  pickOption,
  nodeFieldRow,
  ensureExpanded,
} from './helpers';

/**
 * Feature 005 C2 — read-only "overridden" badges. CANVAS-DEPENDENT (the badge lives on the node
 * editor), so isolated from the authoring tests.
 *
 * Scenario per the brief: a Profile (model qwen) + Skill (temperature 0.7) bundled in a Preset.
 * Node defaults (ChatNodeBase): temperature 0.5, model 'gpt-5'. Composed: temperature 0.7 (skill),
 * model 'qwen' (profile). So selecting the preset badges the **model** field immediately — the
 * node's non-empty default 'gpt-5' wins over the preset's 'qwen' at runtime. This is EXPECTED, not
 * a bug (called out in the brief), and is asserted as the connection-axis badge below.
 *
 * IMPORTANT (verified finding): the **behavior-axis** badge (temperature / reasoningEffort / …) does
 * NOT render in the running editor even when the node's own value is set and differs from the
 * composed Skill value. The pure C2 logic is correct and unit-tested
 * (packages/core/test/model/describeNodeComposition.test.ts: temp 0.9 → badge, 0.7/0.5 → no badge),
 * and I confirmed at runtime that the node value propagates (e.g. Reasoning Effort persists across a
 * node-editor close/reopen) and the composed Skill value is present — yet no behavior badge appears,
 * while the model (connection) badge works. The brief's temperature-overridden scenario is therefore
 * captured as a `fixme` below (it should pass once the behavior-axis badge renders). See the report.
 */

async function setupBundle(page) {
  await createProject(page);
  await openModelConfig(page);
  await addProfile(page, { name: 'QwenProf', model: 'qwen' });
  await addSkill(page, { name: 'WarmSkill', temperature: '0.7' });
  await addPreset(page, { name: 'Bundle', profile: 'QwenProf', skill: 'WarmSkill' });
  await closeSettings(page);
}

test.describe('model-config C2 — override badges (read-only)', () => {
  test('C2 — selecting the Preset badges the model field (expected) and the badge is read-only', async ({ page }) => {
    await setupBundle(page);
    await addChatNode(page);
    await pickOption(page, 'Preset', 'Bundle');
    await expect(nodeFieldRow(page, 'Preset')).toContainText('Bundle');

    // The connection-axis "overridden" badge appears on GPT Model (node default 'gpt-5' ≠ composed
    // 'qwen'). This is the documented expected behaviour, not a bug.
    const modelRow = nodeFieldRow(page, 'GPT Model');
    await expect(modelRow).toContainText('overridden');

    // Read-only: a plain titled span, never a button.
    const badge = modelRow.getByText('overridden', { exact: true });
    await expect(badge).toHaveAttribute(
      'title',
      "This field's value overrides the selected Preset/Skill/Profile.",
    );
    await expect(page.getByRole('button', { name: 'overridden' })).toHaveCount(0);
  });

  test('C2 — a field switched to an input port (wired) shows no badge', async ({ page }) => {
    await setupBundle(page);
    await addChatNode(page);
    await pickOption(page, 'Preset', 'Bundle');

    const modelRow = nodeFieldRow(page, 'GPT Model');
    await expect(modelRow).toContainText('overridden');

    // Switch GPT Model to an input port → the wire drives it → it is no longer a node override.
    await modelRow.getByRole('button', { name: 'Use an input port for GPT Model' }).click();
    await expect(modelRow).not.toContainText('overridden');
  });

  test('C2 — a node with no model-config selection shows no badges', async ({ page }) => {
    await setupBundle(page);
    await addChatNode(page);
    // Nothing selected on this node → the composition has no opinion → no field badges anywhere.
    await expect(page.getByText('overridden', { exact: true })).toHaveCount(0);
  });

  // The brief's behaviour-axis scenario: set a node behaviour field to a value that differs from the
  // composed Skill value → "overridden" badge appears; set it back to the composed value (or the node
  // default = inherited) → it clears. Driven via Reasoning Effort (a dropdown that DOES propagate to
  // node.data, unlike the number inputs). Currently `fixme`: the behaviour-axis badge does not render
  // in the running editor (see the describe-block note + the report). When that is fixed, un-fixme.
  test.fixme('C2 — behaviour-field badge appears when overridden and clears when matched / default', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);
    await addProfile(page, { name: 'QwenProf', model: 'qwen' });
    // Author a Skill whose reasoningEffort = High (the structural locator below targets the
    // unlabeled react-select that follows the "Reasoning effort (optional)" label).
    await page.getByRole('button', { name: 'Add Skill' }).click();
    await page.getByRole('textbox', { name: 'e.g. Developer' }).fill('ReasonSkill');
    await page
      .getByText('Reasoning effort (optional)', { exact: true })
      .locator('xpath=following::input[@role="combobox"][1]')
      .click();
    await page.getByText('High', { exact: true }).last().click();
    await page
      .getByRole('textbox', { name: 'e.g. Developer' })
      .locator('xpath=ancestor::*[.//button[normalize-space()="Done"]][1]')
      .getByRole('button', { name: 'Done' })
      .click();
    await addPreset(page, { name: 'Bundle', profile: 'QwenProf', skill: 'ReasonSkill' });
    await closeSettings(page);

    await addChatNode(page);
    await pickOption(page, 'Preset', 'Bundle');
    await ensureExpanded(page, 'Parameters');

    const reRow = nodeFieldRow(page, 'Reasoning Effort');
    // At the node default (Unset) the field inherits → no badge.
    await expect(reRow).not.toContainText('overridden');
    // Set it to a value ≠ the composed High → badge appears.
    await pickOption(page, 'Reasoning Effort', 'Low');
    await expect(reRow).toContainText('overridden');
    // Match the composed value → badge clears.
    await pickOption(page, 'Reasoning Effort', 'High');
    await expect(reRow).not.toContainText('overridden');
    // Back to the node default (inherited) → badge clears.
    await pickOption(page, 'Reasoning Effort', 'Low');
    await expect(reRow).toContainText('overridden');
    await pickOption(page, 'Reasoning Effort', 'Unset');
    await expect(reRow).not.toContainText('overridden');
  });
});
