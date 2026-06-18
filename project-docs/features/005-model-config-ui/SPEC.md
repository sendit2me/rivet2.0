# SPEC 005 — Model-Config UI (Profiles/Skills/Presets in the editor)

> Target: fork of `valerypopoff/rivet2.0` (GitHub `sendit2me/rivet2.0`), `integration`
> (001–004 merged). App-side facts verified against `packages/app` — see §2. This is the
> Phase-2 UI promised in SPEC 004 §6, now its own feature.

| | |
|---|---|
| **Status** | Ready — 001–004 merged to `integration` |
| **Order** | Feature 5 (UI layer) |
| **Depends on** | 001–004; rendered via Studio Server (browser) and/or the desktop app |
| **Blast radius** | Mostly `packages/app` React + a few `core` editor-definition additions. **No Rust** — the same code renders in the Studio Server browser editor *and* the Tauri shell. |

## 1. Problem

001–004 built the model-config engine but it is **UI-invisible**: a Chat node shows
string-ID fields where you *type* a Profile/Skill/Preset id, and there is no UI to **define**
those entities (they are seeded headlessly into `Settings`). So the layer can't be driven
from the editor. This feature makes it visible and usable — real pickers on the node, an
authoring panel in Settings, and the override UX from SPEC 004 §6 — all as core
editor-definitions + React in `packages/app`, so it renders identically in the browser build
and the desktop app, with no per-shell or Rust work.

## 2. Verified app-side anchors (what this rests on)

- **Settings storage** — `packages/app/src/state/settings.ts`:
  `settingsState = atomWithStorage<Settings>('settings', …)` (jotai), persisted to
  **localStorage** via `createHybridStorage`. `llmProfiles`/`llmSkills`/`llmPresets` are
  already on the core `Settings` type; the authoring UI reads/writes this atom and they
  persist **browser-local**. (Server-side/hosted persistence is a Studio-Server wrapper
  concern — out of scope; see D2.)
- **Selector precedent = `graphSelector`** — core type `GraphSelectorEditorDefinition` (just
  a `dataKey`), rendered by `components/editors/GraphSelectorEditor.tsx`, which reads
  `projectState` (jotai) via `utils/graphSelectorOptions` and populates a dropdown. Our
  selectors mirror this against `settingsState`.
- **`getEditors()` is static** — on `ChatNodeBase` it is `getEditors: (): EditorDefinition<
  ChatNode>[]` with **no args**, so a plain `dropdown` (static `options`) cannot read
  `Settings`. Selectors must be typed editors the app populates, exactly like `graphSelector`.
- **Editor-type dispatch** — `DefaultNodeEditor` lays out rows via `editorUtils`; a single
  editor is rendered by type in **`components/editors/DefaultNodeEditorField.tsx`**. New
  selector/custom editors wire in there.
- **Custom editor binds objects** — `CustomEditorDefinition` is `{ type:'custom',
  customEditorId, dataKey?: DataOfType<T, any>, … }`. The `any` dataKey is what `code` lacked,
  so `extraBody` (an object) gets a clean custom editor (resolves the 004 deferral).
- **Settings modal is paged** — `components/SettingsModal.tsx` switches pages from
  `settings/SettingsPages` (`General/Graphs/UI/OpenAI/Plugins/Updates`). `OpenAiSettingsPage`
  (LLM connection fields) and the Plugins pages (manage a configured list) are the authoring
  precedents.
- App imports core as **`@valerypopoff/rivet2-core`** (confirmed in these files).

## 3. Design — three phases (each a shippable, gated unit)

### Phase A — Selectors on the node
- **Core:** add `LlmProfileSelectorEditorDefinition`, `LlmSkillSelectorEditorDefinition`,
  `LlmPresetSelectorEditorDefinition` to the `EditorDefinition` union — each shaped like
  `GraphSelectorEditorDefinition` (`dataKey` + optional `useInputToggleDataKey`). In
  `ChatNodeBase.getEditors`, replace the three **string** editors
  (`llmProfileId`/`llmSkillId`/`llmPresetId`) with these selectors.
- **App:** renderer components (`DefaultLlmProfileSelectorEditor`, …) under
  `components/editors/`, each reading `settingsState` and building options
  `{ value: id, label: name }` from the relevant array via a `utils/llmSelectorOptions.ts`
  (mirror `graphSelectorOptions.ts`); wire into `DefaultNodeEditorField`'s dispatch. Show a
  `None` option (the no-selection default) and, for a stale id, the dangling id (so it's
  fixable, not silently blank).
- **Result:** pick a Profile/Skill/Preset from a dropdown of the defined ones. No selection ⇒
  byte-identical to today.

### Phase B — Authoring panel (project-scoped)  *(redesigned post-006; was "a page in SettingsModal")*
> **Design shift:** SPEC Phase B originally said "a `ModelConfigSettingsPage` in `SettingsModal`
> over `settingsState`." That predates 006, which made the model-config live in **`Project.modelConfig`**
> (the portability home — travels with the project, runs headless) merged over a global library. So
> v1 authors the **project**, not global settings. The global-library authoring page in `SettingsModal`
> is **deferred** (see "Deferred" below).
- **App:** a new `ProjectModelConfigConfiguration` panel, mounted as a `ProjectInfoFoldableSection`
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
  debounced** — each edit calls `flushHybridStorageGroup('project')` (the `ProjectContextConfiguration`
  precedent). *(Corrects the original "persistence is automatic" note.)* Authored entities serialize
  into the project file via 006.
- **Object-valued fields** (a Skill's `extraBody`, a Preset's `overrides`) and `responseFormat`-as-
  object are **deferred to Phase C** (their object/JSON editors). v1 = scalar + connection + enum fields.
- **Deferred — the global library:** authoring `Settings.modelConfig` (a `SettingsModal` page) +
  cross-project reuse + materialize-on-use. When it lands, `getEditorModelConfig` becomes
  `merge(project, global)` project-first (one spot) and the forms are reused as-is.
- **Result:** define everything in the project UI; it appears in the Phase-A selectors, travels with
  the project, and drives headless execution.

### Phase C — Override UX + `extraBody` editor
- **Override indicators:** in the node editor, when a field's node value differs from the
  value composed from its Preset/Skill/Profile, show an "overridden" badge. Compute via a
  `describeNodeComposition(settings, selectors)` helper (built on `resolveNodeModelComposition`)
  returning the composed per-field value; compare to node `data`. A field that is **input-wired**
  is driven by the wire — don't badge it.
- **Show-overrides toggle:** a UI-pref atom (mirror the prefs in `state/ui.ts`). Off (default)
  → advanced/override fields are **CSS-hidden** so everyday users see a clean node; on →
  power-users see and tweak everything. (Per-editor `hideIf` is data-based and can't read a UI
  pref, so this is an app-level CSS gate; group the advanced fields with a `group` editor.)
- **`extraBody` editor (the deferred 004 piece):** a `custom` editor —
  `{ type:'custom', dataKey:'extraBody', customEditorId:'extraBodyJson' }` in
  `ChatNodeBase.getEditors`, plus an app component registered for that `customEditorId` that
  edits the object as JSON with parse-on-edit + inline validation. Marked advanced (hidden
  unless Show-overrides). **Not** a string-backed shadow field (rejected in 004).

## 4. Decisions to pin

- **D1 — Selectors are typed editors (the `graphSelector` pattern), three of them** — not a
  plain dropdown, not one generic settings-selector. *(Idiomatic; each is trivial. Alt: a
  single generic `settingsListSelector(key)` — note, don't default to it.)*
- **D2 — Persistence stays browser-local** (`settingsState` `atomWithStorage`); no server-side
  persistence here. *(Hosted persistence is RSS's job.)*
- **D3 — `extraBody` is a `custom` editor** (object-as-JSON, parse-on-edit), using the `any`
  dataKey. *(Resolves 004's deferral without a dual representation.)*
- **D4 — Byte-identical defaults hold** — swapping string editors for selectors must not change
  a node with nothing selected; badges/Show-overrides default to the clean view. *(The 001–004
  rail extends into the UI.)*
- **D5 — Build in phases A→B→C**, each a gated unit merged to `integration` before the next.

## 5. Edge cases

1. Node references a deleted Profile/Skill/Preset id → selector shows the dangling id (fixable);
   execution falls back per 001–004 unknown-id handling.
2. Empty Settings (nothing defined) → selectors show only `None`; node behaves as today.
3. `extraBody` custom editor with invalid JSON → inline error, value not committed.
4. A field that is input-wired → not badged as overridden (the wire drives it).
5. Studio Server (browser) vs desktop → identical; localStorage scopes per browser/profile.

## 6. Testing

App-layer, so the test mix shifts from core unit tests to React + browser:
- **Core:** the new editor-definition types compile; `ChatNodeBase.getEditors` returns the
  selectors + the `extraBody` custom editor; the no-selection node is unchanged (extend the
  004 baseline test).
- **App:** component tests where the package supports them (`tsx --test`), and **Playwright**
  per RSS's `AGENTS.md` for browser-visible behaviour — selectors populate from `settingsState`;
  the authoring page round-trips through the atom and survives reload; override badges
  appear/clear; Show-overrides hides/reveals.
- **End-to-end (Studio Server):** define a Profile + Skill + Preset, pick the Preset on a Chat
  node, run against oMLX, see the right model and the reasoning port — the visible payoff of
  001–005.

## 7. Acceptance (per phase)

- **A** — selectors render populated from Settings, replace the string fields, no-selection
  byte-identical, wired in `DefaultNodeEditorField`.
- **B** — a Settings page authors profiles/skills/presets into `settingsState`; they appear in
  the selectors and persist across reload.
- **C** — override badges + Show-overrides toggle + the `extraBody` custom editor, all behind
  the clean default.
- All: app/Studio-Server build green; Playwright green for the touched UI.

## 8. Files (expected; agent verifies exact sites)

- **Core:** `model/EditorDefinition.ts` (+3 selector types into the union),
  `model/nodes/ChatNodeBase.ts` (`getEditors`: selectors + `extraBody` custom editor),
  a `describeNodeComposition` helper (`model/LlmPresetResolution.ts` or app `utils/`).
- **App:** `components/editors/` (3 selector components + the `extraBody` custom editor +
  dispatch in `DefaultNodeEditorField.tsx` + the custom-editor registration),
  `utils/llmSelectorOptions.ts` (mirror `graphSelectorOptions.ts`),
  `components/settings/SettingsPages.tsx` + `SettingsModal.tsx` (authoring page + nav),
  `state/ui.ts` (Show-overrides pref).
- **Docs:** VERIFIED-FINDINGS — add the app-side anchors from §2.

## 9. Gate

Per phase, same discipline as 001–004: a **pre-code report** (understanding; the §2
anchor-site confirmations — especially the `DefaultNodeEditorField` dispatch and the
`settingsState` shape; the file list; D1–D5 restated) → **wait**. Then implement as small
units; **app + Studio-Server build green**, app/component tests + **Playwright** (RSS
`AGENTS.md`) green, the byte-identical no-selection default proven; **one commit, stop at the
phase boundary** for diff review → merge to `integration`. The desktop Tauri shell need not be
built here — the browser build is the proof surface.