import { test, expect } from '@playwright/test';
import { createProject, addChatNode, addNode, ensureExpanded } from './helpers';

/**
 * Feature 005 C1 — the node-side "Show overrides" gate. CANVAS-DEPENDENT (drops nodes via the
 * right-click menu), so it is isolated from the project-settings authoring tests: a canvas break
 * can only fail this file.
 *
 * The node's extraBody lives in an `advanced` group ("Model config overrides"). With Show-overrides
 * OFF (default) the whole advanced group row is CSS-hidden (display:none) → clean node. Turning the
 * pref ON reveals it; the group is then expandable to reach the extraBody field.
 */

test.describe('model-config C1 — node Show-overrides', () => {
  test('C1 — Show-overrides hides the extraBody group by default and toggles it on/off', async ({ page }) => {
    await createProject(page);
    await addChatNode(page);

    // The collapsible group renders both a role=button trigger span and an inner button with the
    // same name; .first() picks the outer trigger (both share visibility), avoiding strict-mode.
    const overridesGroup = page.getByRole('button', { name: 'Model config overrides' }).first();
    const showOverrides = page.getByText('Show overrides', { exact: true });

    // Default: the advanced group (and its extraBody field) is hidden.
    await expect(showOverrides).toBeVisible(); // node HAS an advanced editor → the toggle exists
    await expect(overridesGroup).toBeHidden();

    // Toggle ON → the advanced group appears; expand it to reveal the extraBody field.
    await showOverrides.click();
    await expect(overridesGroup).toBeVisible();
    await ensureExpanded(page, 'Model config overrides');
    await expect(page.getByPlaceholder(/Generic per-request body params merged into the request/)).toBeVisible();

    // Toggle OFF → hidden again.
    await showOverrides.click();
    await expect(overridesGroup).toBeHidden();
  });

  test('C1 — a node with no advanced editor shows no Show-overrides toggle', async ({ page }) => {
    await createProject(page);
    // A Text node has only a plain text editor — no advanced model-config group.
    await addNode(page, 'Text', 'Text');
    // Its editor panel renders, but the Show-overrides toggle does not.
    await expect(page.getByText('Show overrides', { exact: true })).toHaveCount(0);
  });
});
