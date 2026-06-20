# CLAUDE.md — Operating Guide for this Rivet 2 Fork

> Place this file at the **repository root** of the rivet2.0 fork. It governs how you
> (the implementing agent) work here. Read it fully before touching code, then read
> `project-docs/PROJECT-CONTEXT.md`, `project-docs/DECISIONS.md`, `project-docs/VERIFIED-FINDINGS.md`, and the
> active `project-docs/features/00X-*/SPEC.md`.

## What this repo is

A fork of **`valerypopoff/rivet2.0`** (`@valerypopoff/rivet2-*`, MIT) — a TypeScript,
node-graph visual AI-agent tool, and the actively-maintained continuation of Rivet
(the original `Ironclad/rivet` is dormant; see `project-docs/DECISIONS.md` D1). We are adding a
**reusable model-configuration layer** (LLM Profiles → Skills → Presets) so any node
can use a different model, credential, and behavior.

**Do not investigate the architecture from scratch — `project-docs/VERIFIED-FINDINGS.md`
already contains dated, checked facts (file paths, line numbers, the resolution sites).
Use them.**

## Reading order (every session)

1. `CLAUDE.md` (this file) — how to work.
2. `project-docs/PROJECT-CONTEXT.md` — what/why/where.
3. `project-docs/DECISIONS.md` — the choices and their evidence.
4. `project-docs/VERIFIED-FINDINGS.md` — the code facts (ground truth; re-verify only `[MV]` items).
5. `project-docs/REPO-LAYOUT.md` — where things live; **do not edit Studio Server's vendored `rivet/`**.
6. `project-docs/features/ROADMAP.md`, then the **active** feature spec (001–007 are done; the
   active feature is **008 — engine reshape**; do not skip ahead).

## Repository orientation  *(verified — VERIFIED-FINDINGS §A, §C, §D)*

> **Re-targeted onto chat-v2 (DECISIONS D6).** The legacy `ChatNodeBase` cluster is
> **deleted** (commit 376b3710) — the model-resolution path now lives in
> `packages/core/src/model/chat-v2/` (the `llmChatV2` node). The `ChatNodeBase.ts` line
> references below are **historical**; do not follow them. The forward anchors are in
> Feature 008's SPEC (`resolveEffectiveLLMChatV2Data` + `LLMChatV2NodeData`).

Monorepo, **Yarn 4.6.0**, Node 20.4.x, workspaces under `packages/*`:

- **`core`** (`@valerypopoff/rivet2-core`) — engine + built-in nodes. **~All changes
  here**, in the model-resolution path:
  - `packages/core/src/model/Settings.ts` — global config (L19–26 hold the model fields).
  - ~~`packages/core/src/model/nodes/ChatNodeBase.ts`~~ *(deleted — see banner above; the
    chat-v2 equivalents live in `model/chat-v2/`)*.
  - `packages/core/src/model/ProcessContext.ts` — `Settings` + the `getChatNodeEndpoint`
    hook (L62–68). Layer above it; don't remove it.
  - `packages/core/src/api/createProcessor.ts` — **[MV]** how `Settings` reaches the
    processor differs from the Ironclad baseline; inspect before assuming a
    field-by-field thread-through is needed (it may pass the whole `Settings` object).
- **`node`** (`@valerypopoff/rivet2-node`) — headless runtime: `runGraph` (api.ts L275),
  `runGraphInFile` (L95), `loadProjectFromFile` (L85), `createProcessor` (L130). This is
  how you validate.
- **`cli`** (`@valerypopoff/rivet2-cli`) — `rivet run` and `rivet serve` (Hono REST;
  `--openai-endpoint`, `--stream`). Useful for manual checks.
- **`app`** (`@valerypopoff/rivet-app`) — desktop+browser editor (Vite + Tauri). **Touch
  only for the optional UI phases**, never for core logic.
- **`trivet`** — graph-level testing utilities.

## Build / test / validate

```bash
yarn install
yarn build            # tsc across packages — must succeed
yarn test             # suites must stay green
yarn lint             # must stay clean
```

**Headless validation (the primary proof):** load a `.rivet-project` and run it via
`@valerypopoff/rivet2-node`, seeding `Settings` (profiles/skills/presets) in code — no
GUI needed:

```ts
import { runGraph, loadProjectFromFile } from '@valerypopoff/rivet2-node';
const project = await loadProjectFromFile('examples/two-model.rivet-project');
const outputs = await runGraph(project, { graph: 'main', inputs: { /* ... */ } /*, settings with profiles */ });
```

To prove credential/endpoint routing without real providers, point profiles at two
local endpoints or a tiny mock HTTP server that echoes which key/endpoint it received.

## The rails — non-negotiable invariants

1. **Sacred rail (chat-v2).** The byte-identical-when-unset invariant now applies to the
   chat-v2 (`llmChatV2`) node: with no Preset/Profile/Skill selected and no node-level
   model-config, the resolution pre-pass returns the node's `LLMChatV2NodeData` unchanged —
   a model-config-unset LLM Chat node behaves request-identically to a vanilla one. Cover
   with a regression test. The old legacy-request-shape rail is retired with the legacy node
   (deleted, commit 376b3710). See DECISIONS D11.
2. **Implement the precedence exactly:**
   `Node > Preset.overrides > Skill.providers[provider] > Skill.base > Profile > Global`,
   with the Skill fanning generic → provider-specific internally. See DECISIONS D7/D11.
3. **Composition over inheritance across axes.** `extends` only within an axis
   (Profile→Profile, Skill→Skill), **cycle-guarded and depth-capped**.
4. **One feature at a time, in order** (see `project-docs/features/ROADMAP.md`). Finish a
   feature's acceptance criteria before starting the next; no combining.
5. **Minimal blast radius.** Stay within the files each spec lists (plus new
   helper/test/harness files). Do **not** modify unrelated node types, restructure the
   monorepo, or add heavy dependencies.
6. **Typed, no `any`.** Export new types from `core/src/index.ts` where appropriate.

## Where you have latitude (use your judgment)

You are running with strong reasoning; you own implementation details, naming within
conventions, file layout for new helpers, test design, and small refactors that *reduce*
blast radius. **When the spec conflicts with the actual code, stop and ask a crisp
question rather than guessing or making a large speculative change.** Line numbers come
from VERIFIED-FINDINGS (rivet2.0 @ `4820fcbc`, 2026-06-17); if the file has moved since,
re-read and note it.

## Working rhythm (per feature)

1. Read the spec + the code it names (paths/lines in VERIFIED-FINDINGS).
2. **Before coding**, report: (a) understanding in 5–8 bullets, (b) exact files you'll
   change and why, (c) any ambiguities/conflicts. **Wait for go-ahead.**
3. Implement the smallest correct change.
4. Write the unit tests + headless harness named in the spec.
5. `yarn build && yarn test && yarn lint` green; run the harness; confirm the
   no-selection regression test passes.
6. Summarize the diff against the acceptance checklist. Commit as one logical unit with
   a clear message. Stop — do not roll into the next feature without instruction.

## Explicitly out of scope (do not do)

- The visual multi-agent harness and its primitives (separate, later project).
- Native Anthropic/Google plugin nodes honouring profiles (follow-up).
- Cloud sync, secrets-vault/keychain, import/export formats.
- Tracking/merging `Ironclad/rivet` upstream — it is dormant (DECISIONS D1).
- Monorepo restructuring, unrelated dependency upgrades, or drive-by reformatting.

## Development & headless access (how this runs on the VM)

You do **not** need the GUI to build these — edit TypeScript, run `yarn test`, validate
with headless `runGraph` harnesses.

**Hosting is Rivet Studio Server, built from source** (see DECISIONS D2). For the human
to author/inspect graphs against the VM, the port-exposable surfaces are:

- **Studio Server browser editor** — served at `RIVET_PORT` (default 8080), `/?editor`.
  One-click endpoint publishing exposes a graph at `/workflows/:name`. This is the
  intended workflow; it replaces syncing `.rivet-project` files by hand.
- **Plain `rivet serve <project> --port 3000`** — Hono REST to run a graph headlessly,
  without Studio Server.
- **Browser editor + remote executor** — the Vite app can run in a browser and execute
  graphs on this VM's Node runtime via the executor websocket (port 21889 in Studio
  Server's stack).

Expose any VM port over an **SSH local forward** (`ssh -L 8080:localhost:8080 vm`) rather
than binding `0.0.0.0`. Build Studio Server from source; do **not** pull the prebuilt
`ghcr.io` images.