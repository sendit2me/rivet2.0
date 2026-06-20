# KICKOFF — Feature 005, Phase B (Model-Config Authoring)

Working in `~/project/rivet2.0` (fork `sendit2me/rivet2.0`), on `main` (001–005A **and** 006
merged). This kicks off **Feature 005 Phase B** — the UI to author model-config entities, so they
no longer have to be hand-seeded into storage.

**The design shifted under 006 — read this first.** SPEC 005 Phase B was written *before* 006 and
assumed authoring into global `Settings` via the `SettingsModal`. 006 made the model-config live in
**both** the Project (`Project.modelConfig` — travels with the project and runs headless, the
portability home) and global `Settings` (`Settings.modelConfig` — a reusable library). So the
authoring target needs rethinking, and **your pre-code report is a design proposal we align on
before any implementation**.

## Read first
1. `project-docs/features/005-model-config-ui/SPEC.md` — Phase B (note it predates 006; your report
   updates it).
2. `project-docs/features/006-project-embedded-model-config/SPEC.md` — what 006 built
   (`Project.modelConfig` + the global library + the `#initializeGraphRun` assembly).
3. `project-docs/VERIFIED-FINDINGS.md` — §K (006 anchors) + the Phase A app-side anchors.
4. `project-docs/CLAUDE.md`, `DECISIONS.md`.

## Rails (non-negotiable)
- **Gated.** Investigate → pre-code report (a design proposal) → STOP and wait for sign-off →
  implement → STOP at the boundary.
- **Additive / byte-identical.** Authoring is opt-in; a project with no `modelConfig` and nodes
  with no selection behaves exactly as today. The Phase A no-selection rail holds.
- **Generic, not oMLX-specific.** A Profile is a generic OpenAI-compatible connection — present its
  fields as "API endpoint", "Model", "API key", "Headers", never oMLX-shaped. `extraBody` (Phase C)
  is the catch-all for server-specific params (`chat_template_kwargs`, etc.). Any OpenAI-compatible
  server (oMLX, llama-server, Ollama, vLLM, OpenAI) must work the same.
- **No hardcoded domain knowledge.** App-layer — **no Rust**.

## Proposed scope (005-B v1 — confirm or refine in your report)
- **Author the Project's model-config** (`Project.modelConfig`) — CRUD on profiles/skills/presets —
  so what you author travels with the project and runs headless (006). This is the primary,
  portability-correct flow.
- **Re-point the Phase A node selectors** to read the project's `modelConfig` (so what you author +
  select is what travels/runs), instead of the global `settings.modelConfig` they read today.
- **Reuse the Phase A selectors** inside the preset editor (a preset references a profile + a skill —
  render those as the selectors).
- **Defer the global library** (authoring `Settings.modelConfig` + cross-project reuse +
  materialize-on-use) — **not** in v1. Note where it would slot in; don't build it.

## The design question your report must resolve
SPEC Phase B said "a page in `SettingsModal`" — but that's the **global** settings surface, and we're
now authoring **project-scoped** config. So: **where does project-scoped model-config authoring live
in the Rivet app?** Investigate how Rivet authors other project-scoped config (project plugins,
project metadata/settings, the project sidebar) and propose the home — a project-scoped panel, or a
project-aware page. And confirm the selector re-point site.

## Investigate, then REPORT (design proposal; no code yet)
1. **Understanding** — Phase B in your words, accounting for 006 (project-primary authoring + the
   selector re-point).
2. **Authoring location (the key question)** — how Rivet authors project-scoped config today
   (`file:line` for the project-plugins UI / project settings / sidebar patterns), and your proposed
   home for the authoring panel. Quote the precedent.
3. **Selector re-point** — confirm where Phase A's selectors read model-config (`LlmSelectorEditors.tsx`
   + `llmSelectorOptions`, reading `settings.modelConfig` post-006), confirm `projectState` carries
   `modelConfig` (it's `Omit<Project,'data'>`, so it should), and how to re-point the options source
   to the project's `modelConfig`. The byte-identical no-selection rail must hold.
4. **Panel design** — the CRUD structure: list + add/edit/remove for profiles, skills, presets; the
   entity field forms (generic connection fields for a profile; the preset editor reusing the
   selectors). Mirror an existing list-authoring precedent (the plugins page, or the OpenAI settings
   page).
5. **Decisions** — restate: project-primary authoring (`Project.modelConfig`); selectors read the
   project; global library deferred; generic connection (not oMLX); additive/byte-identical.
6. **File list** — every file you'll add/touch.
7. **Test plan** — source-contract / pure tests per the Phase A precedent (no DOM renderer in
   `packages/app`); byte-identical no-selection; the authoring round-trips through `projectState`
   (define a profile → it lands in `Project.modelConfig` → appears in the selector). Playwright E2E
   flagged as post-merge.
8. **Conflicts / surprises** — anything that contradicts the SPEC or 006, especially if Rivet has no
   clean project-scoped authoring home (which would change the design).

Then **STOP** for alignment — this report is where we lock the authoring design before implementation.

## After sign-off
- Implement the agreed design as one gated unit. Prove byte-identical no-selection; prove the
  authoring round-trips through `projectState`.
- Green: app build (`tsc` + `vite build`), lint, the app + core test suites, new tests.
- **One logical commit** on `feature/005b-model-config-authoring`. **STOP at the boundary** — don't
  start Phase C (override badges, Show-overrides toggle, the `extraBody` editor). Don't push — leave
  for diff review → merge to `main`.