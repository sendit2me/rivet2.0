# SPEC 005 — Model-Config UI (Profiles/Skills/Presets in the editor)

> Target: fork of `valerypopoff/rivet2.0` (GitHub `sendit2me/rivet2.0`), `main` (001–004, 005A,
> 005B, 006 merged). App-side facts verified against `packages/app`. The Phase-2 UI promised in
> SPEC 004 §6, now its own feature.
>
> **As-built + forward.** Phases A and B shipped (project-scoped, post-006); Phase C is split into
> **C1 (next)** and **C2**. The pre-006 "Settings / `settingsState`" language has been reconciled to
> the project-scoped reality (006 + 005-B) and `integration` → `main` throughout.

| | |
|---|---|
| **Status** | A, B shipped to `main`; 006 shipped; **C split → C1 (next) + C2** |
| **Order** | Feature 5 (UI layer), after 006 |
| **Depends on** | 001–004 (engine), 006 (project-scoped storage + merge); rendered via the fork-vite browser editor and the Tauri shell |
| **Blast radius** | Mostly `packages/app` React + a few `core` editor-definition additions. **No Rust** — the same code renders in the browser editor *and* the Tauri shell. |

## 1. Problem

001–004 built the model-config engine but it was **UI-invisible**: a Chat node showed string-ID
fields where you *typed* a Profile/Skill/Preset id, and there was no UI to **define** those
entities (they were seeded headlessly). This feature makes it visible and usable — real pickers on
the node, a **project-scoped** authoring panel, and the override UX from SPEC 004 §6 — all as core
editor-definitions + React in `packages/app`, so it renders identically in the browser build and the
desktop app, with no per-shell or Rust work.

## 2. Verified app-side anchors (what this rests on)

- **Model-config storage (post-006)** — the entities live in a nested `ModelConfig`
  (`{ profiles?, skills?, presets? }`) on **`Project.modelConfig`** (travels with the project, runs
  headless — 006) and on `Settings.modelConfig` (a reusable global library — **deferred** here).
  Authoring is **project-scoped**: the panel reads/writes `Project.modelConfig` via `projectState`
  (jotai). The 'project' hybrid-storage group is **debounced**, so each edit calls
  `flushHybridStorageGroup('project')` (the `ProjectContextConfiguration` precedent). 006 serializes
  `modelConfig` into the project file.
- **Project-scoped authoring precedent = `ProjectInfoPanel`** (`components/ProjectInfoModal.tsx`) —
  the "Project settings" modal hosts foldable sections (Plugins / References / MCP / Context)
  authored over `projectState`. `ProjectReferencesConfiguration` (list + add/remove over
  `projectState`) is the CRUD precedent; `ProjectContextConfiguration` is the `flush` precedent.
  This is where project-scoped model-config authoring lives — **not** `SettingsModal` (that's the
  deferred global library).
- **Selector precedent = `graphSelector`** — core `GraphSelectorEditorDefinition` (just a `dataKey`),
  rendered by `components/editors/GraphSelectorEditor.tsx`, reading `projectState` via
  `utils/graphSelectorOptions`. Our selectors mirror it, reading the **project's** model-config via
  the single helper `utils/projectModelConfig.ts → getEditorModelConfig(project)` (re-pointed from
  the global `settingsState` in Phase B). When the global library lands, that helper becomes
  `merge(project, global)` in **one** place.
- **`getEditors()` is static** — on `ChatNodeBase` it is `getEditors: (): EditorDefinition<ChatNode>[]`
  with **no args**, so a plain `dropdown` can't read config. Selectors must be typed editors the app
  populates, exactly like `graphSelector`.
- **Editor-type dispatch** — a single editor is rendered by type in
  `components/editors/DefaultNodeEditorField.tsx` (the `.with(...).exhaustive()` ts-pattern). New
  selector/custom editors wire in there; the exhaustiveness guard forces core + app to compile
  together (one atomic commit).
- **Custom editor binds objects** — `CustomEditorDefinition` is `{ type:'custom', customEditorId,
  dataKey?: DataOfType<T, any>, … }`. The `any` dataKey is what `code` lacked, so `extraBody` (an
  object) gets a clean custom editor (the C1 / 004-deferral piece).
- App imports core as **`@valerypopoff/rivet2-core`**.

## 3. Design — three phases (A, B shipped; C split C1 → C2)

### Phase A — Selectors on the node  *(SHIPPED)*
- **Core:** added `LlmProfileSelectorEditorDefinition` / `LlmSkillSelectorEditorDefinition` /
  `LlmPresetSelectorEditorDefinition` to the `EditorDefinition` union (each shaped like
  `GraphSelectorEditorDefinition` — `dataKey` + optional `useInputToggleDataKey`). In
  `ChatNodeBase.getEditors`, replaced the three **string** editors
  (`llmProfileId`/`llmSkillId`/`llmPresetId`) with these selectors.
- **App:** renderer components in `components/editors/LlmSelectorEditors.tsx`, building options
  `{ value:id, label:name }` via `getLlmSelectorOptions` (source-agnostic), wired into
  `DefaultNodeEditorField`. `None` option + a `Missing: <id>` row for a stale id (fixable, not
  blank). *Originally read `settingsState`; **re-pointed to the project's `modelConfig` in Phase B**
  via `getEditorModelConfig`.*
- **Result:** pick a Profile/Skill/Preset from a dropdown of the defined ones. No selection ⇒
  byte-identical to today (proven).

### Phase B — Authoring panel (project-scoped)  *(SHIPPED)*
> **Design shift (resolved):** SPEC Phase B originally said "a `ModelConfigSettingsPage` in
> `SettingsModal`." That predated 006, which made the model-config live in **`Project.modelConfig`**
> (the portability home — travels with the project, runs headless) merged over a global library. So
> v1 authors the **project**, not global settings. The global-library page in `SettingsModal` is
> **deferred** (see "Deferred" below).
- **App:** a `ProjectModelConfigConfiguration` panel, mounted as a `ProjectInfoFoldableSection`
  (title **"LLM model config"**) in `ProjectInfoPanel` (`components/ProjectInfoModal.tsx`) — the
  established project-scoped authoring home, beside Plugins / References / MCP / Context. CRUD over
  **`Project.modelConfig`** `profiles/skills/presets`, mirroring `ProjectReferencesConfiguration`
  (list + add/remove over `projectState`) and `OpenAiSettingsPage` (field layout).
- **Presentational forms:** `LlmProfileForm` / `LlmSkillForm` / `LlmPresetForm` are pure (`value` in,
  `onChange` out) and **store-decoupled** — the panel owns the `projectState` read/write. The
  deferred global-library panel reuses the same forms verbatim against a different store.
  - Profile: generic connection fields — **API endpoint / Model / API key / Organization / Headers /
    Extends** (never oMLX-shaped). Skill: systemPrompt + scalar/enum behavior fields. Preset: name +
    **Profile + Skill pickers (reusing the Phase-A `LlmSelectorField`)** + `isDefault`.
- **Selector re-point:** the Phase-A node selectors read the **project's** model-config (via the
  single helper `utils/projectModelConfig.ts → getEditorModelConfig(project)`), not the global
  `settingsState`. The no-selection byte-identical rail holds (empty config ⇒ only `None`).
- **Persistence:** `projectState` writes go through the **hybrid 'project' storage group, which is
  debounced** — each edit calls `flushHybridStorageGroup('project')` (the
  `ProjectContextConfiguration` precedent). *(Corrects the original "persistence is automatic" note.)*
  Authored entities serialize into the project file via 006.
- **Object-valued fields** (a Skill's `extraBody`, a Preset's `overrides`) and `responseFormat`-as-
  object are **deferred to Phase C** (their object/JSON editors). v1 = scalar + connection + enum
  fields. *(`responseFormat` confirmed a simple enum — it stays in v1.)*
- **Deferred — the global library:** authoring `Settings.modelConfig` (a `SettingsModal` page) +
  cross-project reuse + materialize-on-use. When it lands, `getEditorModelConfig` becomes
  `merge(project, global)` project-first (one spot) and the forms are reused as-is.
- **Result:** define everything in the project UI; it appears in the Phase-A selectors, travels with
  the project, and drives headless execution.

### Phase C — Object editors + Override UX (split C1 → C2)

> **Project-scoped + split.** The object-field editors below live in the B forms / the node, not
> `SettingsModal`. Phase C is too large for one gated commit and splits along a clean seam: **C1 =
> authoring completion** (object editors + `extends` + a11y), **C2 = override visualization** (the
> node badges). C1 first — badges are only meaningful once `overrides` exists. C1 also clears the
> three Phase-B UI-test findings (Extends, overrides-copy, region names). See `KICKOFF-phase-c1.md`.

**Phase C1 — finish authoring (behind the clean default):**
- **Shared object/JSON editor (the deferred 004 piece):** edits an object value as JSON with
  parse-on-edit + inline validation (invalid → inline error, not committed). **Not** a string-backed
  shadow field (rejected in 004).
- **Node `extraBody`:** a `custom` editor — `{ type:'custom', dataKey:'extraBody',
  customEditorId:'extraBodyJson' }` in `ChatNodeBase.getEditors` (using `CustomEditorDefinition`'s
  `any` dataKey) + the app component registered for that id. In an advanced `group`, CSS-hidden by
  Show-overrides.
- **Show-overrides toggle:** a UI-pref atom (mirror `state/ui.ts`). Off (default) → the node's
  advanced group is **CSS-hidden** (clean node); on → power-users see/tweak everything. (Per-editor
  `hideIf` is data-based and can't read a UI pref, so it's an app-level CSS gate on the group.)
- **Skill `extraBody` + Preset `overrides`** added to the B forms (the deferred object fields). The
  `overrides` editor matches its confirmed type (structured partial → a fields editor; freeform →
  the JSON editor).
- **`extends` pickers (finding 1):** Profile + Skill forms gain the `extends` control B specified but
  omitted — reuse `LlmSelectorField` over the same-entity list, excluding self.
- **A11y region names (finding 3):** give the `ProjectInfoPanel` "LLM model config" section a unique
  `aria` id so the Plugins / Context-values regions stop reporting the wrong name.
- *(finding 2 clears for free: shipping `overrides` makes the node's existing "Preset overrides"
  copy true.)*

**Phase C2 — override indicators:** in the node editor, when a field's node value differs from the
value composed from its Preset/Skill/Profile (incl. `overrides`), show an "overridden" badge. Compute
via a `describeNodeComposition(modelConfig, selectors)` helper (built on `resolveNodeModelComposition`)
returning the composed per-field value; compare to node `data`. A field that is **input-wired** is
driven by the wire — don't badge it.

## 4. Decisions to pin

- **D1 — Selectors are typed editors (the `graphSelector` pattern), three of them** — not a plain
  dropdown, not one generic selector. They read the **project's** model-config via
  `getEditorModelConfig`. *(Alt: a single generic `settingsListSelector(key)` — rejected.)*
- **D2 — Authoring is project-scoped** (`Project.modelConfig`, persisted via the 'project' storage
  group with explicit `flush`, traveling with the project per 006). The global library
  (`Settings.modelConfig` authoring + cross-project reuse + materialize-on-use) is **deferred**.
  *(Supersedes the original "persistence stays browser-local in `settingsState`" — that predated 006.)*
- **D3 — `extraBody` is a `custom` editor** (object-as-JSON, parse-on-edit), using the `any` dataKey
  — the C1 piece. *(Resolves 004's deferral without a dual representation.)*
- **D4 — Byte-identical defaults hold** — a node with nothing selected and Show-overrides off is
  unchanged; badges/Show-overrides default to the clean view. *(The 001–004 rail extends into the UI.)*
- **D5 — Build in phases A → B → C, C split C1 → C2**, each a gated unit merged to **`main`** before
  the next. A, B, 006 done; C1 next.

## 5. Edge cases

1. Node references a deleted Profile/Skill/Preset id → selector shows the `Missing: <id>` row
   (fixable); execution falls back per 001–004 unknown-id handling.
2. Empty config (nothing defined) → selectors show only `None`; node behaves as today.
3. `extraBody` custom editor with invalid JSON → inline error, value not committed.
4. A field that is input-wired → not badged as overridden (the wire drives it).
5. Browser editor vs desktop → identical; project-scoped config travels with the project file.

## 6. Testing

App-layer, so the test mix shifts from core unit tests to source-contract + browser:
- **Core:** the new editor-definition types compile; `ChatNodeBase.getEditors` returns the selectors
  (+ the `extraBody` custom editor in C1); the no-selection node is unchanged (extend the 004
  baseline test).
- **App:** `packages/app` has no DOM renderer in its test setup, so app-layer coverage is
  **source-contract + pure-helper** tests (the A/B precedent): selectors build options from the
  project's `modelConfig`; the authoring panel round-trips through `projectState`; the store-free
  forms are test-enforced free of state imports.
- **Browser E2E:** the **`ui-testing` Playwright CLI suite** (`~/project/ui-testing`, skill-guided —
  not RSS) drives the fork-vite editor headless: authoring + persistence across reload, the node
  selectors, `None`/`Missing` rows, byte-identical no-selection. (Flows 1–6 green; execution gated
  behind `RUN_EXEC=1`.)
- **End-to-end:** define a Profile + Skill + Preset, pick the Preset on a Chat node, run against
  oMLX, see the right model + the reasoning port — the visible payoff of 001–006.

## 7. Acceptance (per phase)

- **A** *(met)* — selectors render populated, replace the string fields, no-selection byte-identical,
  wired in `DefaultNodeEditorField`.
- **B** *(met)* — the `ProjectInfoPanel` panel authors profiles/skills/presets into
  `Project.modelConfig`; they appear in the selectors, persist across reload, and travel with the
  project.
- **C1** — the object editors (node + skill `extraBody`, preset `overrides`) + the `extends` pickers
  + the Show-overrides gate + the a11y fix, all behind the clean default.
- **C2** — override badges on the node, input-wired fields excluded.
- All: app/browser build green; the `ui-testing` suite green for the touched UI.

## 8. Files

- **Core:** `model/EditorDefinition.ts` (the 3 selector types — done), `model/nodes/ChatNodeBase.ts`
  (`getEditors`: selectors done; `extraBody` custom editor in C1), a `describeNodeComposition` helper
  (C2 — `model/LlmPresetResolution.ts` or app `utils/`).
- **App (shipped A/B):** `components/editors/LlmSelectorEditors.tsx` + dispatch in
  `DefaultNodeEditorField.tsx`; `getLlmSelectorOptions`; `utils/projectModelConfig.ts`
  (`getEditorModelConfig`); `components/ProjectInfoModal.tsx` (the `ProjectModelConfigConfiguration`
  foldable section); the store-free `LlmProfileForm` / `LlmSkillForm` / `LlmPresetForm`.
- **App (C1):** the shared object/JSON editor + its custom-editor registration; the `extends` pickers
  in the profile/skill forms; the skill `extraBody` + preset `overrides` editors; `state/ui.ts`
  (Show-overrides pref); the `ProjectInfoPanel` a11y id fix.
- **App (C2):** the override-badge rendering + `describeNodeComposition`.
- **Docs:** VERIFIED-FINDINGS §J (Phase B) + §K (006) + the Phase A app anchors.

## 9. Gate

Per phase, same discipline as 001–006: a **pre-code report** (understanding; the §2 anchor-site
confirmations — especially the `DefaultNodeEditorField` dispatch, the project-scoped storage, and the
entity field types; the file list; the decisions restated) → **wait**. Then implement as small
units; **app + browser build green**, source-contract/pure tests + the **`ui-testing` Playwright
suite** green, the byte-identical no-selection default proven; **one commit, stop at the phase
boundary** for diff review → merge to **`main`**. The desktop Tauri shell need not be built here —
the browser build is the proof surface.