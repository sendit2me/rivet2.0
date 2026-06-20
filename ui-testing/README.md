# ui-testing — chat-v2 model-config UI tests (Playwright)

In-repo Playwright suite for the fork's **chat-v2** model-config UI (Profiles / Skills / Presets,
node selectors, persistence). Relocated into the repo (Tidy Phase 2) so specs version in lockstep
with the UI they test. This is a **clean chat-v2 seed** — the legacy Feature 001–006 specs (deleted
nodes / old forms) are quarantined in `_legacy-archive/` for rebuild reference and are **not run**
(`testDir: ./tests`).

## Run

```bash
# 1. Serve the editor (from the repo root):
cd ..                                                   # rivet2.0/
yarn workspace @valerypopoff/rivet2-core build          # if core/dist is stale vs source
yarn workspace @valerypopoff/rivet-app build
yarn workspace @valerypopoff/rivet-app exec vite preview --host --port 4173   # → http://localhost:4173

# 2. Run the suite:
cd ui-testing
npm install            # first time (installs @playwright/test)
npx playwright install chromium   # first time
npx playwright test
```

`EDITOR_URL` overrides the baseURL (default `http://localhost:4173`). Debug a fighting locator with
`--headed`, `--debug`, or `npx playwright codegen http://localhost:4173`.

## Specs

- `tests/tidy1-modelconfig-usability.spec.ts` — the chat-v2 usability baseline (Tidy-01): authors a
  custom + hosted Profile, a Skill (base + per-provider block), a Preset; checks the node "Model
  config" selector group, the no-config rail, and reload persistence. Captures screenshots to
  `artifacts/tidy1/` (gitignored).
- `tests/helpers.ts` — accessibility-first locators + the isolated canvas/node helpers. Authoring is
  currently inline in the spec; extract shared chat-v2 helpers here as the suite grows.
- `tests/artifacts.ts` — per-run artifact capture (`createRun` → `shot`/`note`/`writeManifest`).

## Locator discipline (carried from the legacy runbook)

- `getByRole` / `getByLabel` / visible text only — **never Atlaskit CSS classes** (they churn).
- **Collapsed-but-present:** expand a section trigger before clicking inside (idempotent `ensureExpanded`).
- **Canvas is a11y-opaque:** place nodes by right-clicking an empty left-region canvas spot (retry until
  the add-node search opens); the editor panel covers the right ~third. Isolated in `helpers.ts`.
- **Saving to a file** (for a save→reopen round-trip) needs the FS-Access picker forced off — delete
  `window.showSaveFilePicker` via `addInitScript` before load, then capture the blob download. The full
  pattern is preserved in `_legacy-archive/e2e-artifacts.spec.ts`.

`artifacts/`, `node_modules/`, `test-results/`, `.playwright-mcp/` are gitignored.
