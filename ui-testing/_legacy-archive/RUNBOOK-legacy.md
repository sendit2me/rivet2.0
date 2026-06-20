# ui-testing — Rivet model-config UI test suite (Playwright CLI)

Durable, repeatable regression + E2E for the Rivet fork's model-config UI (Features 004–006).
Specs are `@playwright/test`, run headless via `npx playwright test`. Use the `rivet-ui-testing`
skill for conventions; this file is the operational runbook + the **proof-of-work artifacts**
procedure. Tests only — never edit app code; a failing test is a finding.

## Run it
```bash
# 0. Serve the editor (build uses core from ../core/src via vite alias; rebuild core if it's stale).
cd ~/project/rivet2.0
yarn workspace @valerypopoff/rivet2-core build          # only if core/dist is stale vs source
yarn workspace @valerypopoff/rivet-app build
yarn workspace @valerypopoff/rivet-app exec vite preview --host   # → http://localhost:4173

# 1. Default suite — model-free (Flows 1–6 + C1/C2). baseURL defaults to localhost:4173.
cd ~/project/ui-testing && npx playwright test

# 2. Gated execution E2E against oMLX (needs oMLX up + open CORS — see below).
RUN_EXEC=1 npx playwright test tests/model-config-exec.spec.ts          # lean assertion (returns 43)
RUN_EXEC=1 npx playwright test tests/e2e-artifacts.spec.ts              # same flow + saves artifacts
```
`EDITOR_URL` overrides baseURL. Debug a fighting locator with `--headed`, `--debug`, or
`npx playwright codegen http://localhost:4173`.

## Suite layout
- `model-config-ui.spec.ts` — Flows 1–6 (author Profile/Skill/Preset, node selectors, persistence,
  None/Missing, inert node). Model-free.
- `model-config-c1-authoring.spec.ts` — C1 forms (extraBody valid/invalid, preset overrides toggle,
  Extends always-present, a11y unique region names). No canvas.
- `model-config-c1-node.spec.ts` — C1 node Show-overrides toggle. Canvas.
- `model-config-c2-badges.spec.ts` — C2 override badges (model badge, read-only, input-wired). Canvas.
  Contains a `test.fixme` for the behavior-axis badge gap (see Known issues).
- `model-config-exec.spec.ts` — gated `RUN_EXEC=1` E2E against oMLX (author → build graph → run → 43).
- `e2e-artifacts.spec.ts` — gated `RUN_EXEC=1` E2E that also writes proof-of-work artifacts.
- `helpers.ts` — accessibility-first locators + the isolated canvas graph-building helpers.
- `artifacts.ts` — the per-run artifact capture utility.

## Proof-of-work artifacts (capture evidence every E2E run)
**Why:** screenshots + the saved project are durable evidence — feed them to a user/agent to explain
the UI, or cite them when reporting a bug/error that needs looking into.

**What `e2e-artifacts.spec.ts` produces, per run**, under `ui-testing/artifacts/<runId>/`
(`<runId>` = `YYYYMMDD-HHMMSS_<label>`):
- `NN-<step>.png` — numbered screenshots at each meaningful action (project created, each entity
  authored, graph built/wired, run result, save).
- `e2e-modelconfig.rivet-project` — the actual saved project file (also copied to
  `artifacts/e2e-modelconfig.rivet-project` as the convenient "latest").
- `manifest.json` — runId, ordered steps↔screenshots, and result notes (run output, save path,
  `embedsModelConfig`, byte size, endpoint/model).

**How to capture in a new spec:** use `createRun(label)` from `artifacts.ts` →
`await run.shot(page, 'name')` at each step, `run.note(k, v)` for results, `run.writeManifest({...})`
at the end. Keep it append-only; one dir per run so history is preserved.

**Saving the project requires forcing the download path.** Rivet's browser build picks
`BrowserIOProvider` (the FS-Access `showSaveFilePicker` picker — a native dialog Playwright CANNOT
drive) when `'showSaveFilePicker' in window`, else `LegacyBrowserIOProvider` (a blob **download**,
which Playwright captures). So before load, delete `showSaveFilePicker` down the prototype chain via
`page.addInitScript(...)`; then Menu → "Save project as..." emits a download captured with
`page.waitForEvent('download')` → `download.saveAs(...)`. The spec detects if the picker is still
present and skips the save safely (reported in the manifest) rather than hanging.

## Key UI facts & gotchas (learned the hard way)
- **Locators:** `getByRole`/`getByLabel`/visible-text only; never Atlaskit CSS classes. Several
  model-config controls do NOT wire Atlaskit `fieldProps`, so their accessible name is NOT the label
  — locate the JSON/extraBody editors by **placeholder**, override value inputs by
  label→`following::input`, override presence toggles by `aria-label` ("Override <label>"), and node
  ports by **`.port-label` text** (port `id`s only populate on the selected node).
- **Collapsed-but-present:** expand the "LLM model config" section and the node "Advanced"/"Parameters"
  groups before clicking inside (idempotent `ensureExpanded`).
- **Canvas is a11y-opaque (isolated in helpers.ts):** place nodes by right-clicking an EMPTY LEFT-region
  canvas spot (the editor panel covers the right ~third); retry until the add-node search opens. Edit a
  Text node via its hidden `.monaco-editor textarea` (focus + Ctrl+A + type) — clicking the wrapper
  doesn't take. Wire by dragging between port centers located by label.
- **Atlaskit toggles:** the `<input>` is visually covered — toggle with `dispatchEvent('click')`.
- **Node field-edit propagation:** node number/text `.fill()` does NOT commit to node.data under
  automation; dropdowns/selectors/plug-toggles DO. Drive a field that must take effect via a dropdown.

## oMLX execution prerequisites (all verified 2026-06-19 — the gate is OPEN)
- oMLX up at `host.lima.internal:9090`; **CORS open** (`access-control-allow-origin: *`) → browser→oMLX
  is not blocked.
- Profile **endpoint = the FULL** `http://host.lima.internal:9090/v1/chat/completions` (a bare `…/v1`
  → 404).
- **Model id** must be real (`Qwen3.6-35B-A3B-nvfp4`, …); `qwen3.6` → 404. From `/v1/models`.
- The Chat node's own default model `gpt-5` wins over the Preset/Profile model at runtime → set the
  node's **Custom Model** to the oMLX id (or the request goes out with `gpt-5` → 404).
- Feature 004's reasoning output port is gated behind the node's **"Output Reasoning"** toggle
  (default off) — turn it on to wire/read `reasoning_content`.
- Env overrides: `OMLX_ENDPOINT`, `OMLX_MODEL`.

## Known issue to surface (not a test bug)
**C2 behavior-axis override badge does not render** in the running editor. A node behavior field
(temperature, reasoningEffort, responseFormat) whose value is set and differs from the composed
Skill value shows NO "overridden" badge, while the connection-axis (model) badge works. Confirmed
un-confounded (the field value propagates and persists; the pure C2 functions pass their unit tests),
so it's an integration-layer gap in `DefaultNodeEditor`'s `overriddenDataKeys` memo. Captured as the
`test.fixme` in `model-config-c2-badges.spec.ts`; un-fixme when fixed.
