import { Page, Locator, expect } from '@playwright/test';

/**
 * Helpers built on stable, accessibility-first locators (getByRole / accessible
 * names + the visible labels observed during the manual pass). No CSS-class
 * selectors; where structural scoping is needed we use XPath relative to a
 * visible label, which survives styling changes.
 */

/** Create a fresh blank project from the welcome screen and wait until it loads. */
export async function createProject(page: Page, name = 'MC Test'): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create new project' }).click();
  await page.getByRole('textbox', { name: 'Project Name' }).fill(name);
  await page.getByRole('button', { name: 'Create Project' }).click();
  // Project is loaded once the sidebar shows the Project settings entry point.
  await expect(page.getByRole('button', { name: 'Project settings' })).toBeVisible();
}

/** Open Project settings and ensure the "LLM model config" section is expanded. */
export async function openModelConfig(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Project settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Project settings' })).toBeVisible();
  await ensureExpanded(page, 'LLM model config');
  // The Add buttons live inside the section; wait for them to be actionable.
  await expect(page.getByRole('button', { name: 'Add Profile' })).toBeVisible();
}

/** Close the Project settings modal via its footer "Done" button. */
export async function closeSettings(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Project settings' });
  // The footer Done is last in DOM order (after any open entity-editor cards).
  await dialog.getByRole('button', { name: 'Done' }).last().click();
  await expect(dialog).toBeHidden();
}

/**
 * Idempotently expand a Collapsible identified by its trigger's accessible name.
 * Only the collapsed trigger exposes aria-expanded=false, so we click only then —
 * safe whether the section starts collapsed (first open) or expanded (after reload).
 */
export async function ensureExpanded(page: Page, name: string): Promise<void> {
  const collapsed = page.getByRole('button', { name, expanded: false });
  if (await collapsed.count()) {
    await collapsed.first().click();
  }
}

/** The entity-editor card currently open, located via the name field inside it. */
function cardOf(page: Page, nameFieldAccessibleName: string | RegExp): Locator {
  return page
    .getByRole('textbox', { name: nameFieldAccessibleName })
    .locator('xpath=ancestor::*[.//button[normalize-space()="Done"]][1]');
}

/** Save the currently-open entity card (clicks the card's own Done, not the footer). */
export async function saveCard(page: Page, nameFieldAccessibleName: string | RegExp): Promise<void> {
  await cardOf(page, nameFieldAccessibleName).getByRole('button', { name: 'Done' }).click();
}

/**
 * Click the "Edit" button on an entity list row, located via the row's visible name.
 * Scoped to the Project settings dialog so a same-named label on a node behind the
 * modal can't be hit by accident.
 */
export async function editEntity(page: Page, name: string): Promise<void> {
  await page
    .getByRole('dialog', { name: 'Project settings' })
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::*[.//button[normalize-space()="Edit"]][1]')
    .getByRole('button', { name: 'Edit' })
    .click();
}

// NOTE (chat-v2 seed): the legacy `addProfile` / `addSkill` / `addPreset` entity-authoring helpers
// were removed in the relocate — they filled fields the excision deleted (endpoint / systemPrompt) and
// the legacy node. The chat-v2 authoring is driven inline in `tidy1-modelconfig-usability.spec.ts`;
// extract shared chat-v2 authoring helpers here as the suite is rebuilt. The reusable building blocks
// below (createProject / openModelConfig / ensureExpanded / pickOption / addNode / canvas) carry over.

/** Container of a labelled field: nearest ancestor of the label that holds a control. */
export function fieldGroup(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::*[.//*[@role="combobox" or @role="spinbutton" or @role="textbox"]][1]');
}

/**
 * Open a react-select combobox (by accessible name) and return its menu locator.
 * react-select here renders options without role=option, but the menu has a stable
 * runtime id derived from the input id: `<prefix>-input` -> `<prefix>-listbox`.
 */
export async function openComboMenu(page: Page, comboName: string): Promise<Locator> {
  const combo = page.getByRole('combobox', { name: comboName });
  await combo.click();
  const inputId = await combo.getAttribute('id');
  const base = (inputId || '').replace(/-input$/, '');
  const menu = page.locator(`#${base}-listbox`);
  await expect(menu).toBeVisible();
  return menu;
}

/** Open a react-select combobox (by accessible name) and click a named option. */
export async function pickOption(page: Page, comboName: string, value: string): Promise<void> {
  const menu = await openComboMenu(page, comboName);
  await menu.getByText(value, { exact: true }).click();
}

/**
 * Open the project graph and drop a node of the given type on the canvas via the
 * right-click Add-node menu (the menu *is* in the a11y tree; the canvas itself is not).
 * This is the brittle, a11y-opaque step — kept here, isolated, so a canvas break can
 * only take down node tests, not the project-settings authoring tests.
 */
export async function addNode(page: Page, search: string, exactLabel: string): Promise<void> {
  await page.getByRole('button', { name: 'Untitled Graph' }).click();
  const box = page.getByRole('textbox', { name: 'Type in node name...' });
  // Right-click an empty canvas spot to open the add-node search (retry until it shows).
  await expect(async () => {
    await page.mouse.click(430, 520, { button: 'right' });
    await expect(box).toBeVisible({ timeout: 1500 });
  }).toPass();
  await box.fill(search);
  await page.getByText(exactLabel, { exact: true }).first().click();
}

// NOTE (chat-v2 seed): the legacy `addChatNode` helper (the deleted "Chat (Legacy)" node, LLM
// selectors under "Advanced") was removed. On chat-v2 the node is "LLM Chat" and the selectors live
// in the "Model config" group — see `tidy1-modelconfig-usability.spec.ts` for the current pattern.

/**
 * The node-editor field ROW for a labelled control. This is the `DefaultNodeEditorField`
 * root `<div class="row …">` — it holds the control AND any sibling "overridden" badge,
 * so it's the right scope for badge assertions (a tighter ancestor would miss the badge).
 */
export function nodeFieldRow(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " row ")][1]');
}

/** Type a value into a node number field (e.g. "Temperature") located via its row. */
export async function fillNodeNumber(page: Page, label: string, value: string): Promise<void> {
  await nodeFieldRow(page, label).getByRole('spinbutton').fill(value);
}

/* ------------------------------------------------------------------------- *
 * Canvas graph-building helpers (E2E / execution specs only).
 * The canvas is a11y-opaque, so these use screenshot-free DOM probing of the
 * Rivet port elements (`.port` / `.port-circle` / `.port-label`) plus pixel
 * drags. Kept here, isolated, so canvas brittleness can't take down the
 * authoring/badge specs. All learned the hard way during the oMLX E2E:
 *  - place a node by right-clicking an EMPTY canvas spot (retry until the
 *    add-node search opens); the node editor panel occupies the right ~third,
 *    so keep placement/ports in the left region (x < ~690).
 *  - the Text node body is a Monaco editor — edit it via its hidden
 *    `.monaco-editor textarea` (focus + Ctrl+A + type); clicking the wrapper
 *    doesn't take.
 *  - port `id`s are only populated on the SELECTED node, so locate ports by
 *    their visible `.port-label` text (stable selected or not).                */

/** Right-click an empty canvas point and drop a node of the given type (retrying the menu). */
export async function addNodeAt(
  page: Page,
  x: number,
  y: number,
  search: string,
  exactLabel: string,
): Promise<void> {
  const box = page.getByRole('textbox', { name: 'Type in node name...' });
  let opened = false;
  for (let i = 0; i < 8 && !opened; i++) {
    await page.mouse.click(x, y, { button: 'right' });
    if (await box.isVisible().catch(() => false)) {
      opened = true;
      break;
    }
    await page.waitForTimeout(400);
  }
  if (!opened) throw new Error(`add-node menu did not open at ${x},${y}`);
  await box.fill(search);
  await page.getByText(exactLabel, { exact: true }).first().click();
  await page.waitForTimeout(500);
}

/** Replace a selected Text node's content (its body is a Monaco editor). */
export async function setTextNodeContent(page: Page, content: string): Promise<void> {
  const ta = page.locator('.monaco-editor textarea').first();
  await ta.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(content);
  await page.waitForTimeout(200);
}

/** Center of a node port located by its visible label (e.g. "Output", "Prompt"). */
export async function portCenter(page: Page, label: string): Promise<{ x: number; y: number }> {
  const c = await page.evaluate((lbl) => {
    for (const port of Array.from(document.querySelectorAll('.port'))) {
      if ((port.querySelector('.port-label')?.textContent?.trim() || '') === lbl) {
        const circle = port.querySelector('.port-circle');
        if (circle) {
          const r = circle.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }
      }
    }
    return null;
  }, label);
  if (!c) throw new Error(`port not found by label: ${label}`);
  return c;
}

/** Draw a wire from one port to another (both located by label). */
export async function wirePorts(page: Page, fromLabel: string, toLabel: string): Promise<void> {
  const from = await portCenter(page, fromLabel);
  const to = await portCenter(page, toLabel);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 25, from.y - 15, { steps: 5 }); // nudge to start the drag
  await page.mouse.move(to.x, to.y, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}
