# KICKOFF — Feature 005, Phase C1 (Object editors + Extends, behind the clean default)

Working in `~/project/rivet2.0` (fork `sendit2me/rivet2.0`), on `main` (001–004, 005A, 005B **and**
006 merged). This kicks off **Phase C1** — finishing the authoring forms with the object-valued
fields that B deliberately deferred, adding the `extends` pickers, and clearing two UI-correctness
findings from the Phase B UI test. The node override **badges** are a separate later unit (C2) — out
of scope here.

**Phase C is split.** SPEC 005 §3 "Phase C" bundles object editors + override badges + Show-overrides
+ the `extraBody` editor into one. That's too much for one gated commit, and there's a clean seam:
**authoring** (this unit, C1) vs **override visualization** (C2 — the node badges). Badges are also
more meaningful *after* `overrides` exists, so authoring goes first. Your report covers C1 only.

**Read this first — the data model is project-scoped now.** SPEC 005 §2/§3 predate 006 and describe
authoring into flat `Settings.llmProfiles/…`. 006 reshaped that: the entities live in a nested
`ModelConfig` (`{ profiles?, skills?, presets? }`) on **both** `Project.modelConfig` (travels, runs
headless) and `Settings.modelConfig` (library), and **B made authoring project-scoped** — the forms
edit `Project.modelConfig` via `projectState`, with explicit `flushHybridStorageGroup('project')`. So
everything here targets the **project's** modelConfig and the **B form components**, not `SettingsModal`.

## Read first
1. `project-docs/features/005-model-config-ui/SPEC.md` — §3 Phase C (the origin; this kickoff
   supersedes its data-model assumptions per the note above and splits it C1/C2).
2. `project-docs/VERIFIED-FINDINGS.md` — §J (Phase B: the project-scoped forms, `getEditorModelConfig`,
   the deferred fields) + §K (006) + the Phase A app anchors.
3. `project-docs/CLAUDE.md`, `DECISIONS.md`.

## Rails (non-negotiable)
- **Gated.** Investigate → pre-code report → STOP for sign-off → implement → STOP at the boundary.
- **Additive / byte-identical.** The node's clean default is sacred: a Chat node with no `extraBody`
  and Show-overrides **off** must be byte-identical to today. New object fields are advanced and
  hidden by default. Extend the existing no-selection baseline test to cover this.
- **Generic, not oMLX-specific.** `extraBody` is the generic escape hatch for server-specific params
  (`chat_template_kwargs`, etc.) — never present it as oMLX-shaped. Connection/behaviour stay generic
  OpenAI-compatible.
- **No hardcoded domain knowledge. No Rust** — app layer + the one core custom-editor def.

## Scope (C1 — confirm or refine in your report)
1. **A shared object/JSON editor** (the deferred 004 / SPEC D3 piece): edits an object value as JSON
   with **parse-on-edit + inline validation** (invalid JSON → inline error, value not committed). Not
   a string-backed shadow field (rejected in 004).
2. **Node `extraBody`** — a `custom` editor in `ChatNodeBase.getEditors`
   (`{ type:'custom', dataKey:'extraBody', customEditorId:'extraBodyJson' }`, using `CustomEditorDefinition`'s
   `any` dataKey), rendered by the shared editor, registered for that `customEditorId`. Placed in an
   **advanced `group`** that the Show-overrides pref CSS-hides by default.
3. **Show-overrides UI-pref** — an atom in `state/ui.ts` (mirror the existing prefs), default **off**.
   Off → the node's advanced group is CSS-hidden (clean node); on → visible. (Per-editor `hideIf` is
   data-based and can't read a UI pref — so this is an app-level CSS gate on the group, per SPEC.)
4. **Skill form `extraBody`** and **Preset form `overrides`** — the object fields B deferred, added to
   the existing **store-free B forms** (`LlmSkillForm`, `LlmPresetForm`). `extraBody` reuses the shared
   JSON editor. **`overrides` shape must be confirmed** (see report item 2): if it's a structured
   partial of the composable params, build a fields editor (optional versions of the skill fields); if
   freeform, reuse the JSON editor. Group these as an "Advanced" subsection of the form.
5. **`extends` pickers (finding 1)** — Profile and Skill forms are missing the `extends` control the
   B design specified. Add it to `LlmProfileForm` / `LlmSkillForm`, reusing the **selector field** the
   preset form already uses (`LlmSelectorField`), pointed at the **same-entity list** in the project's
   modelConfig (profiles for a profile's `extends`, skills for a skill's), **excluding self** so an
   entity can't extend itself. Resolution already honours `extends`; this only exposes it.
6. **A11y region names (finding 3)** — the "LLM model config" section in `ProjectInfoPanel` shares an
   `aria` label/`aria-controls` id with the Plugins / Context-values sections, so those report the
   wrong region name (visible headings are fine; only the programmatic name collides). Give the new
   section a **unique id** so each region reports its own name. Pure hygiene; also de-flakes the test
   suite's region locators.
7. **Verify finding 2 clears** — the Chat node's Preset help text / precedence line already names
   "Preset overrides" ("Node > Preset overrides > Skill > Profile > Global"). Shipping `overrides`
   here makes that copy **true** — confirm the copy now matches what's implemented; no trim needed if
   it does.

## Investigate, then REPORT (no code yet)
1. **Understanding** — C1 in your words: finish the deferred object fields + `extends`, keep the node
   clean by default, fix the a11y ids. Note what stays for C2 (the override badges).
2. **Entity field types (confirm — the load-bearing anchors)** — from `model/Settings.ts` (or wherever
   `LlmProfile`/`LlmSkill`/`LlmPreset` are defined): the exact type of `extends` (on profile + skill),
   `overrides` (on preset — **structured partial vs freeform**, which decides its editor), and which
   entities carry `extraBody`. Quote them `file:line`.
3. **The B form components** — `file:line` for `LlmProfileForm` / `LlmSkillForm` / `LlmPresetForm`
   (the store-free presentational forms) and how they take value/onChange, so the new fields wire in
   cleanly. Confirm `LlmSelectorField` is reusable for the `extends` pickers and how to scope its
   options to a same-entity list minus self.
4. **Node custom editor** — confirm `CustomEditorDefinition` (`dataKey?: any`, `customEditorId`), the
   `customEditorId` registration site (the dispatch in `DefaultNodeEditorField.tsx` / the custom-editor
   registry), and that ChatNode data has an `extraBody` key. Confirm the `group` editor + the CSS-gate
   approach for Show-overrides against `state/ui.ts` prefs.
5. **A11y site** — `file:line` in `ProjectInfoPanel` where the shared `aria-controls`/label id causes
   the collision, and the unique-id fix.
6. **Decisions** — restate: project-scoped (forms edit `Project.modelConfig`); object editors are
   advanced + gated (node clean default holds); `extraBody` generic; `extends` excludes self; the
   `overrides` editor matches the confirmed type; a11y ids unique.
7. **File list** — every file added/touched.
8. **Test plan** — source-contract / pure tests per the A/B precedent (no DOM renderer in
   `packages/app`): the node-clean baseline extended (no `extraBody` + Show-overrides off → unchanged);
   JSON editor parse/validate (invalid → not committed); `extends` excludes self; the forms round-trip
   the new fields through `projectState`. Note which of the **Playwright suite**'s flows in
   `~/project/ui-testing` should grow to cover the new fields (extraBody/overrides/extends authoring),
   and that the region-name fix should let those locators simplify.
9. **Conflicts / surprises** — anything contradicting the SPEC, 006, or the B forms — especially if
   `overrides` turns out to be a shape that doesn't fit a clean editor.

Then **STOP** for alignment.

## After sign-off
- Implement as one gated unit. Prove the node clean default holds; prove the forms round-trip the new
  fields through `projectState`.
- Green: app build (`tsc` + `vite build`), lint, app + core test suites, new tests.
- **One logical commit** on `feature/005c1-object-editors-extends`. **STOP at the boundary** — do not
  start C2 (the override badges / `describeNodeComposition`). Don't push — leave for diff review →
  merge to `main`.