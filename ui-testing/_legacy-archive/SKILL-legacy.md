---
name: rivet-ui-testing
description: Write and run Playwright CLI specs (@playwright/test) to regression-test the Rivet fork's model-config UI — profiles, skills, presets, node selectors, persistence. Use for durable, repeatable browser tests run via `npx playwright test`. For one-off exploration of UI not yet mapped, use the Playwright MCP instead, then codify what you learn into specs with this skill.
---

# Rivet model-config UI testing (Playwright CLI)

Durable regression of the editor's model-config UI. Specs live in `ui-testing/` (a `@playwright/test`
project) and run headless via the CLI — **not** via live MCP tool-calls. The MCP is for *discovering*
unmapped UI; once mapped, the truth lives in spec files here. Brief and expected results: `A-B-test-plan.md`.

## Setup (already in place)
- `ui-testing/` is a `@playwright/test` project (`@playwright/test` installed, `npx playwright install
  chromium`, system libs via apt).
- The editor is served by the fork's vite preview (`yarn workspace @valerypopoff/rivet-app build` then
  `... exec vite preview --host`, ~`http://localhost:4173`). Set this as `baseURL` in `playwright.config.ts`.
- **Use the bundled chromium (the default) — do NOT set `channel: 'chrome'`.** On ARM64 there is no
  Chrome channel; `@playwright/test` references the chromium it installed, which sidesteps the
  symlink hack the MCP needed.
- Headless. `npx playwright test` runs the suite. `--headed`, `--debug`, and `npx playwright codegen
  <baseURL>` are for locator discovery when a selector is fighting you. Set `trace: 'on-first-retry'`
  and `screenshot: 'only-on-failure'` so failures are diagnosable.

## Locators — the load-bearing discipline
- **Prefer `getByRole` / `getByLabel` / accessible names. Never CSS classes** (Atlaskit churns them).
- Stable anchors in this UI:
  - "Project settings" button → the project modal.
  - The "LLM model config" foldable section, with Presets / Profiles / Skills subsections + Add buttons.
  - Entity forms — Profile: Name / API endpoint / Model / API key / Organization / Headers. Skill:
    Name / System prompt / Temperature / … Preset: Name / Profile picker / Skill picker / Default-preset.
  - The three node selectors live in the Chat node's **Advanced** section: LLM Profile, Skill, Preset —
    each a custom combobox listing `None` + the defined entities, plus a `Missing: <id>` row for a
    dangling reference.
- **Three quirks to code around (all learned the hard way):**
  - *Collapsed-but-present.* The "LLM model config" section and the node "Advanced" section render their
    inner controls in the DOM while visually collapsed (zero height). Clicking an inner button before
    expanding hits pointer-interception — **expand the section trigger first, then click inside.**
  - *Canvas is opaque to a11y.* Rivet's node graph is not in the accessibility tree. Placing/selecting a
    node needs canvas coordinates or screenshot-anchored clicks (right-click canvas → Add-node menu,
    which *is* in the tree). This is the brittle part — **isolate canvas/node-placement steps** so a
    canvas break doesn't take down the authoring tests.
  - *Wrong region names (known bug, may be fixed).* The Plugins / Context-values regions report their
    `aria` region name as "LLM model config". Until fixed, prefer the visible heading/trigger text over
    `getByRole('region', { name: … })` for those sections.

## Test structure
- One `test()` per flow.
- Self-contained: each test creates the profile/skill/preset it needs; rely on Playwright's
  fresh-context-per-test isolation so localStorage doesn't bleed between tests.
- Assert what the manual plan asserts: selector populated with `None` + the entity; survives
  `page.reload()`; the `Missing: <id>` row on a dangling reference; an unselected node structurally
  identical to a plain Chat node (UI-level — the true byte-diff is a core test, not a browser test).
- **Flow 7 (execution against oMLX) goes in a separate spec gated behind `RUN_EXEC=1`** so the default
  suite is model-free and needs no oMLX/CORS (runbook Step 6 covers the endpoint + CORS when you run it).

## Discipline
- **Tests only — never touch app code.** A failing test is a finding, not a license to edit the app.
- End by reporting: flows covered, anything you couldn't automate (and why), and the exact re-run
  command. Then stop.

## Flows (see A-B-test-plan.md for full detail)
1. Author a Profile → persists across reload.
2. Profile appears in the node's LLM Profile selector (+ None).
3. Author a Skill → appears in the node's Skill selector.
4. Author a Preset whose Profile/Skill pickers reuse the same selector → appears in the node's Preset selector.
5. `None` clears to default; a deleted-but-referenced entity shows `Missing: <id>`, no crash.
6. A no-selection node is structurally identical to a plain Chat node.
7. *(gated `RUN_EXEC=1`)* The preset runs against oMLX; assert model + reasoning port.

## Operational runbook + artifacts → see `ui-testing/CLAUDE.md`
That file is the source of truth for: serving the editor, the suite layout, the **oMLX execution
prerequisites** (the gate is now OPEN — CORS allows the browser; endpoint must be the FULL
`…/v1/chat/completions`; use real model ids; set the node Custom Model), the **canvas
graph-building** helpers, and the **proof-of-work artifacts** procedure. Every E2E run should capture
artifacts via `tests/artifacts.ts` (`createRun` → `shot`/`note`/`writeManifest`) into
`artifacts/<runId>/` — numbered step screenshots + the saved `.rivet-project` + `manifest.json` — as
durable evidence to explain the UI or cite when reporting a bug. Saving the project needs the legacy
download path forced (delete `window.showSaveFilePicker` before load); see `e2e-artifacts.spec.ts`.
Known open issue: the C2 behavior-axis override badge does not render (captured as a `test.fixme`).