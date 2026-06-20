import { test, expect } from '@playwright/test';
import {
  createProject,
  openModelConfig,
  closeSettings,
  addProfile,
  addSkill,
  addPreset,
  addChatNode,
  fieldGroup,
  pickOption,
  openComboMenu,
} from './helpers';

/**
 * Feature 005 Phase A + B — model-config UI regression suite.
 * One test per flow from the A/B test plan. Each test is self-contained: it
 * creates the project + entities it needs and relies on Playwright's
 * fresh-context-per-test isolation so localStorage never bleeds across tests.
 */

test.describe('model-config UI (Phase A + B)', () => {
  test('Flow 1 — author a Profile and confirm it persists across reload', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);

    await addProfile(page, {
      name: 'Test Local',
      endpoint: 'http://host.lima.internal:9090/v1',
      model: 'qwen3.6',
    });
    // Appears in the profiles list immediately.
    await expect(page.getByText('Test Local', { exact: true })).toBeVisible();

    // Persistence: reload and re-open the section.
    await page.reload();
    await openModelConfig(page);
    await expect(page.getByText('Test Local', { exact: true })).toBeVisible();

    // Field values survived too.
    await page
      .getByText('Test Local', { exact: true })
      .locator('xpath=ancestor::*[.//button[normalize-space()="Edit"]][1]')
      .getByRole('button', { name: 'Edit' })
      .click();
    await expect(page.getByRole('textbox', { name: /\/v1\/chat\/completions/ })).toHaveValue(
      'http://host.lima.internal:9090/v1',
    );
    await expect(page.getByRole('textbox', { name: /Default model when a node/ })).toHaveValue('qwen3.6');
  });

  test('Flow 2 — the Profile appears in a node\'s selector and can be selected', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);
    await addProfile(page, { name: 'Test Local', endpoint: 'http://host.lima.internal:9090/v1', model: 'qwen3.6' });
    await closeSettings(page);

    await addChatNode(page);

    // Open the LLM Profile selector: options include None and Test Local.
    const menu = await openComboMenu(page, 'LLM Profile');
    await expect(menu.getByText('Test Local', { exact: true })).toBeVisible();
    await expect(menu.getByText('None', { exact: true })).toBeVisible();
    await menu.getByText('Test Local', { exact: true }).click();

    await expect(fieldGroup(page, 'LLM Profile')).toContainText('Test Local');
  });

  test('Flow 3 — author a Skill, persist it, and see it in the node Skill selector', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);
    await addSkill(page, { name: 'Concise', systemPrompt: 'Be concise.', temperature: '0.3' });
    await expect(page.getByText('Concise', { exact: true })).toBeVisible();

    // Persists across reload.
    await page.reload();
    await openModelConfig(page);
    await expect(page.getByText('Concise', { exact: true })).toBeVisible();
    await closeSettings(page);

    // Node Skill selector lists Concise and can select it.
    await addChatNode(page);
    await pickOption(page, 'Skill', 'Concise');
    await expect(fieldGroup(page, 'Skill')).toContainText('Concise');
  });

  test('Flow 4 — author a Preset referencing the Profile + Skill and select it on a node', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);
    await addProfile(page, { name: 'Test Local', endpoint: 'http://host.lima.internal:9090/v1', model: 'qwen3.6' });
    await addSkill(page, { name: 'Concise', systemPrompt: 'Be concise.', temperature: '0.3' });
    await addPreset(page, { name: 'Local Concise', profile: 'Test Local', skill: 'Concise' });
    await expect(page.getByText('Local Concise', { exact: true })).toBeVisible();

    // Persists across reload.
    await page.reload();
    await openModelConfig(page);
    await expect(page.getByText('Local Concise', { exact: true })).toBeVisible();
    await closeSettings(page);

    // Node Preset selector lists Local Concise and selecting it shows it selected.
    await addChatNode(page);
    const menu = await openComboMenu(page, 'Preset');
    await expect(menu.getByText('Local Concise', { exact: true })).toBeVisible();
    await menu.getByText('Local Concise', { exact: true }).click();
    await expect(fieldGroup(page, 'Preset')).toContainText('Local Concise');
  });

  test('Flow 5 — None resets a selector; deleting a referenced Preset yields a Missing: row', async ({ page }) => {
    await createProject(page);
    await openModelConfig(page);
    await addProfile(page, { name: 'Test Local', endpoint: 'http://host.lima.internal:9090/v1', model: 'qwen3.6' });
    await addSkill(page, { name: 'Concise', systemPrompt: 'Be concise.', temperature: '0.3' });
    await addPreset(page, { name: 'Local Concise', profile: 'Test Local', skill: 'Concise' });
    await closeSettings(page);

    await addChatNode(page);

    // Part 1: select a Profile, then set it back to None.
    await pickOption(page, 'LLM Profile', 'Test Local');
    await expect(fieldGroup(page, 'LLM Profile')).toContainText('Test Local');
    await pickOption(page, 'LLM Profile', 'None');
    await expect(fieldGroup(page, 'LLM Profile')).toContainText('None');

    // Part 2: select the preset on the node, delete it in Project settings, reopen the node.
    await pickOption(page, 'Preset', 'Local Concise');
    await expect(fieldGroup(page, 'Preset')).toContainText('Local Concise');

    await openModelConfig(page);
    // "Local Concise" also shows on the node behind the modal; scope to the dialog.
    await page
      .getByRole('dialog', { name: 'Project settings' })
      .getByText('Local Concise', { exact: true })
      .locator('xpath=ancestor::*[.//button[normalize-space()="Remove"]][1]')
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.getByText('No presets defined.')).toBeVisible();
    await closeSettings(page);

    // The node now shows a dangling reference, not a blank or a crash, and recovers via None.
    await expect(fieldGroup(page, 'Preset')).toContainText('Missing:');
    await pickOption(page, 'Preset', 'None');
    await expect(fieldGroup(page, 'Preset')).toContainText('None');
  });

  test('Flow 6 — a fresh node with nothing selected is inert (selectors default to None)', async ({ page }) => {
    await createProject(page);
    // Define entities so the selectors *could* be populated — proving "nothing selected"
    // is a deliberate default rather than an empty project artifact.
    await openModelConfig(page);
    await addProfile(page, { name: 'Test Local', endpoint: 'http://host.lima.internal:9090/v1', model: 'qwen3.6' });
    await addSkill(page, { name: 'Concise', systemPrompt: 'Be concise.', temperature: '0.3' });
    await addPreset(page, { name: 'Local Concise', profile: 'Test Local', skill: 'Concise' });
    await closeSettings(page);

    await addChatNode(page);

    // All three model-config selectors default to None: the layer is inert.
    await expect(fieldGroup(page, 'Preset')).toContainText('None');
    await expect(fieldGroup(page, 'LLM Profile')).toContainText('None');
    await expect(fieldGroup(page, 'Skill')).toContainText('None');

    // And the node otherwise looks like an ordinary Chat node (default model unchanged).
    await expect(fieldGroup(page, 'GPT Model')).toContainText('GPT-5');
  });
});
