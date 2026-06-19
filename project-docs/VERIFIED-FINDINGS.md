# VERIFIED FINDINGS

> Dated, empirically-checked facts about the codebases, captured so the
> implementing agent does **not** repeat this investigation. Each finding states how
> it was verified and a confidence tag. **Treat `CONFIRMED-rivet2.0` items as ground
> truth**; re-verify only `MUST-VERIFY` items.
>
> **Verified on:** 2026-06-17
> **Against:**
> - `valerypopoff/rivet2.0` @ `origin/main` HEAD `4820fcbc` (2026-06-15) — *the build target*
> - `Ironclad/rivet` @ HEAD `7cdd13a1` (2026-05-13) — *pre-divergence baseline, for the fork analysis only*
>
> Confidence tags: **[C2]** confirmed in rivet2.0 · **[CI]** confirmed in Ironclad,
> conceptually applies to rivet2.0 (same continuation) · **[MV]** must-verify in rivet2.0.

---

## A. Repository facts  *(rivet2.0)*

- **[C2]** Root package is `@valerypopoff/rivet` (core is `@valerypopoff/rivet2-core`;
  node `@valerypopoff/rivet2-node`; cli `@valerypopoff/rivet2-cli`; app
  `@valerypopoff/rivet-app`; executor `@valerypopoff/rivet-app-executor`).
- **[C2]** Monorepo, **Yarn 4.6.0** (`packageManager`), workspaces under `packages/*`.
  README states **Node 20.4.x**. Commands: `yarn install`, `yarn build`, `yarn test`,
  `yarn lint`; `yarn dev` runs the Tauri/Vite desktop flow.
- **[C2]** Both rivet2.0 and Rivet-Studio-Server are **MIT** (LICENSE, "Val P", 2026).

## B. Fork & maintenance facts  *(git history)*

- **[C2]** Fork point: **2025-10-06**, `merge-base(origin/main, Ironclad/main)` =
  `73c20b44`.
- **[C2]** `Ironclad/rivet` since fork = **6 commits, all Dependabot bumps**
  (openssl `0.10.73→0.10.79`, tar `0.4.40→0.4.45`, time `0.3.36→0.3.47`). No features.
- **[C2]** `rivet2.0` since fork = **666 commits**. Massive independent divergence.
- **[C2]** rivet2.0 has **not** merged upstream since the fork (merge-base is the fork
  point), and the 3 upstream bumps are absent (patch-id check). Immaterial.

## C. Model-config resolution — the change sites for Feature 001/002/003  *(rivet2.0)*

File: **`packages/core/src/model/nodes/ChatNodeBase.ts`** — verified line numbers:

- **[C2]** L948 — endpoint resolution:
  `const configuredEndpoint = endpoint || context.settings.openAiEndpoint || DEFAULT_CHAT_ENDPOINT;`
  → per-node `endpoint` already overrides global. (`DEFAULT_CHAT_ENDPOINT` imported
  from `../../utils/defaults.js`, L21.)
- **[C2]** L949–950 — the runtime hook is consulted:
  `context.getChatNodeEndpoint ? await context.getChatNodeEndpoint(configuredEndpoint, finalModel) : ...`
- **[C2]** L957 — header merge begins with `...context.settings.chatNodeHeaders`.
- **[C2]** L1034–1035 **and** L1067–1068 — the **two** auth blocks, both global-only:
  `apiKey: context.settings.openAiKey ?? ''`, `organization: context.settings.openAiOrganization`.
  **This is the real "one config to rule them all" bottleneck** the features remove.

File: **`packages/core/src/model/Settings.ts`** — verified:

- **[C2]** L19–26: `openAiKey?`, `openAiOrganization?`, `openAiEndpoint?`,
  `chatNodeHeaders?: Record<string,string>`. **No `llmProfiles`/`llmSkills`/`llmPresets`
  yet** — greenfield confirmed.

File: **`packages/core/src/model/ProcessContext.ts`** — verified:

- **[C2]** L62–68: `getChatNodeEndpoint?: (endpoint, model) => ChatNodeEndpointInfo |
  Promise<...>` and `export type ChatNodeEndpointInfo = { endpoint; headers }`. Leave
  intact; the profile layer sits above it.

**Implication:** Feature 001's change sites are `ChatNodeBase.ts` L948 (endpoint),
L957 (headers), **L1034 and L1067** (both auth blocks), plus the new `Settings`
fields and the `resolveProfile` helper. The structure is identical to Ironclad; only
the line numbers moved (Ironclad had these near ~1011 / ~1142 / ~1255).

### C.1 Message-assembly map — for Feature 002 (Skills) pre-prompt injection  *(rivet2.0)*

Pinned 2026-06-17 during Feature 002 (line numbers vs the 001 working tree; they shift
once 001/002 edits land — re-grep for the named symbols rather than trusting the number).

- **[C2]** Messages are assembled **once per `process()`** at `ChatNodeBase.ts` ~L927 via
  `getChatNodeMessages(inputs)` (helper at ~L1152–1157): it runs
  `coercePromptToChatMessages(inputs.prompt)` then `prependSystemPrompt(messages, inputs.systemPrompt)`.
  The array is rebuilt from `inputs` every call, so the node itself never accumulates across
  loop iterations — **but** ChatLoop feeds `all-messages` (`[...messages, response]`) back into
  `prompt`, so a prior-iteration system message *can* re-enter via the input. Injection must be
  idempotent (de-dupe by exact text).
- **[C2]** Role is assigned **downstream**, not at assembly: ~L949–951
  `chatMessageToOpenAIChatCompletionMessage(msg, { useDeveloperPrompts })`. `useDeveloperPrompts`
  is derived at ~L942–947 from `data.systemPromptMode` (`'developer'|'system'`) and `isModernModel`.
  So injecting a plain `{ type: 'system', message }` ChatMessage honors `systemPromptMode`
  automatically — do **not** hand-roll a role.
- **[C2]** `prependSystemPrompt` (in `model/chat/chatMessages.ts`) already de-dupes a *leading*
  system message (splices it, then prepends the `systemPrompt` input). Feature 002 adds the
  sibling `prependSkillSystemPrompt` there: drop any prior copy of the exact skill prompt, then
  put it once at the front → composed order **skill-system → node's own system → user turns**.
- **[C2]** Behavior-param reads (the Skill-affected ones): `temperature` ~L883, `top_p` ~L885,
  `useTopP` ~L887, `stop` ~L888–893 (all via `getInputOrData`/inline), `toolChoice` (~L901,
  `resolveChatToolChoice`), `responseFormat` (~L902, `resolveOpenAIResponseFormat`), `maxTokens`
  (`let { maxTokens } = data` ~L953 — **ignores its input port**, a pre-existing quirk),
  `reasoningEffort` (~L1008, `getInputOrData`). Feature 002 routes these through a
  Skill-patched copy of `data` (Option C), leaving every other `data` read untouched.

## D. Headless execution surfaces  *(rivet2.0)*

- **[C2]** **CLI** (`packages/cli/src/commands/`): `run.ts` (run a graph) and
  `serve.ts`. `serve.ts` is a **Hono** server (`@hono/node-server` L1, `new Hono()`
  L113) with options incl. **`--openai-endpoint` (L73)**, **`--stream` / `--stream-node`**
  (SSE; L90–97), and `--port`. So
  `rivet serve <project> --openai-endpoint <oMLX-url> --stream` exposes a streaming
  REST API — the editor app is **not** required to run graphs.
- **[C2]** **Headless library** (`packages/node/src/api.ts`):
  `loadProjectFromFile()` (L85), `runGraphInFile(path, options)` (L95),
  `createProcessor()` (L130), `runGraph(project, options)` (L275). Options type is
  `NodeRunGraphOptions`. This is the embed-in-your-own-service path.

## E. Plugin system — for custom nodes (e.g. a future "Coding Agent" node)  *(rivet2.0/Ironclad)*

- **[C2]** `packages/core/src/model/RivetPlugin.ts` exposes the plugin contract:
  `register(...)` for custom nodes, `configSpec` (L15), `contextMenuGroups` (L20).
- **[CI]** A plugin is a function `(rivet) => RivetPlugin`; the built-in HuggingFace
  plugin is a ~40-line template (config + context-menu group + node registration).
  Verified in Ironclad; rivet2.0 is a continuation, so the pattern holds — confirm the
  exact HuggingFace example path in rivet2.0 if used as a template.

## F. Settings thread-through for headless runs — RESOLVED  *(was MUST-VERIFY)*

- **[C2]** *(resolved 2026-06-17, Feature 001)* The original `[MV]` hypothesis — that
  rivet2.0 passes `Settings` as a whole object so new fields propagate automatically — is
  **WRONG**. `createProcessor.ts` (`coreCreateProcessor`) itself never names the model
  fields, but it builds settings via **`resolveProcessSettings(options)`**
  (`packages/core/src/api/processSettings.ts`), which **reconstructs a `Required<Settings>`
  from an explicit field allowlist with no `...settings` spread**. Two consequences, both
  confirmed by building:
  1. A new `Settings` field does **not** propagate to the processor unless it is added to
     `resolveProcessSettings`.
  2. Because the return type is **`Required<Settings>`**, adding an optional field to
     `Settings` *forces* a matching addition in `resolveProcessSettings` — omitting it is a
     compile error, not a silent drop. This is a useful guardrail: the type makes the
     thread-through mandatory.
  - **The thread-through is therefore a one-liner in `processSettings.ts`**
    (`llmProfiles: settings.llmProfiles ?? []`); `createProcessor.ts` needs no edit, and
    `RunGraphOptions` being `& Settings` means callers can already seed `llmProfiles` via
    `runGraph` options. Two existing assertions in `test/api/processSettings.test.ts` snapshot
    the resolved object shape and must include the new field.

## G. Rivet Studio Server facts  *(from its docs, raw @ branch `main-rivet2`)*

- **[C2]** Consumes Rivet via `RIVET_REPO_URL` / `RIVET_REPO_REF` (default
  `https://github.com/valerypopoff/rivet2.0.git` @ `main`); `rivet/` is read-only
  input. → point this at our fork.
- **[C2]** Route map (nginx-fronted): `/` dashboard · `/?editor` browser Rivet editor
  (iframe) · `/api/*` control plane · `/workflows/:name` published-endpoint execution ·
  `/workflows-latest/:name` latest-draft execution · `/ws/latest-debugger` · 
  `/ws/executor/internal` (hosted-editor executor) · `/ws/executor` (compat).
- **[C2]** Ports: dashboard default **8080** (`RIVET_PORT`); executor websocket is a
  separate internal service on **21889** (does not follow the API `PORT`). API has
  `combined | control | execution` profiles (`RIVET_API_PROFILE`).
- **[C2]** Deploy: `npm run prod` pulls **prebuilt `ghcr.io` images** (we choose
  build-from-source instead — see DECISIONS D2). Helm chart + K8s topology documented
  (control-plane singleton; execution plane scales).
- **[C2]** Features: browser editor, project manager, one-click endpoint publishing,
  run-recordings browser (filter/replay), remote debugger, runtime-libraries manager,
  built-in auth (+ optional external UI gate).

## H. How these findings were obtained (method, for auditability)

- Repo/paths/line numbers: shallow + blobless `git clone`, `git ls-tree`,
  `git show origin/main:<path> | grep -n` against rivet2.0.
- Fork analysis: blobless clone of rivet2.0, added Ironclad as `upstream`, computed
  `git merge-base`, `git log <mb>..upstream/main`, `git rev-list --count`, `git cherry`.
- Licenses & Studio Server docs: `raw.githubusercontent.com` fetches.
- Re-run any of the above to refresh; update the "Verified on" date if you do.

## I. Feature 004 anchors — reasoning output + extraBody  *(rivet2.0, verified 2026-06-18)*

> SPEC 004 §234 calls this "§G", but §G/§H were already taken — it lives here as §I. Verified
> against the `integration` working tree (001–003 merged). Line numbers shift as edits land —
> re-grep for the named symbols. These correct two anchors SPEC 004 §5/§10 got slightly off.

- **[C2]** `reasoning_content` was **never read** anywhere in `packages/core/src` before 004
  (grep clean). E1 is purely additive.
- **[C2] Streaming delta type is in `utils/openai.ts`, not local to the runtime.** The streaming
  chunk delta is `ChatCompletionChunkChoice.delta` (`utils/openai.ts`, `content?: string`) — the
  typed home for the new `reasoning_content?: string | null`. (SPEC §5's "runtime.ts L17" actually
  points at the **non-streaming** `message` type inside `applyOpenAINonStreamingResponse`, which also
  gains `reasoning_content?`.) So 004 touches `openai.ts` (one field) beyond SPEC §10's list.
- **[C2] Runtime return shape.** `applyOpenAINonStreamingResponse` / `applyOpenAIStreamingResponse`
  (`model/chat/openAIChatRuntime.ts`) mutated `output` and returned `void`; called **only** from
  `ChatNodeBase` (non-streaming + streaming branches). 004 changes both to return
  `{ reasoning: string }` (non-streaming: `message.reasoning_content`; streaming: a parallel
  `reasoningChoicesParts[0]` buffer joined). `ChatNodeBase` writes `output['reasoning']` only when
  `data.outputReasoning`, **before** the existing `Object.freeze(output)` in each branch.
- **[C2] Reasoning port declaration** mirrors `outputUsage`: a conditional push in
  `getOutputDefinitions` beside the `usage` block. Default off ⇒ port-list is the hardcoded set
  `['response','in-messages','all-messages','responseTokens']`.
- **[C2] Body-assembly / extraBody application point.** The request body is the `options` object
  (`Omit<ChatCompletionOptions,'auth'|'signal'>`); `auth` (apiKey/org) and `headers` are **separate
  args**, out of `extraBody`'s reach. `endpoint` **is** in `options`. 004 deep-merges the effective
  `extraBody` over `options` **after** the `max_completion_tokens`/`temperature` block and **before**
  the `cacheKey` (so two extraBody values don't cache-collide), then re-asserts essentials.
  **D2 sharpened:** extraBody contributes body params only — protected keys are `model`, `messages`,
  `endpoint` (re-asserted from the node) and `stream` (dropped; not a real `options` key).
  Implemented as pure `applyExtraBody` in `model/chat/openAIChatRequest.ts`; returns the **same
  `options` reference** when extraBody is empty (byte-identical rail).
- **[C2] extraBody composition** lives in `resolveNodeModelComposition` (`LlmPresetResolution.ts`):
  `deepMerge(deepMerge(skill.extraBody, preset.overrides.extraBody), node.extraBody)` (Node wins).
  Within a Skill `extends` chain, `extraBody` deep-merges in `mergeSkillInto` (not replace). Shared
  pure helper `utils/deepMerge.ts` (nested objects recurse; arrays/scalars replace).
- **[C2] Editor note.** `extraBody` is a typed object (`Record<string,unknown>`) used directly by the
  merge and headless seeding. The `code`/JSON editor binds only **string** dataKeys
  (`DataOfType<T,string>`; cf. ObjectNode/HttpCallNode), so an object-bound inline JSON editor is not
  type-possible without app-layer parse-on-edit machinery (out of scope: "No app UI in this feature").
  004 ships the `outputReasoning` toggle; the node-level `extraBody` JSON editor is deferred to the
  Phase-2 override-aware UI. (No §9 acceptance criterion covers the editor.)

## J. Feature 005 app-side anchors — Model-Config UI  *(packages/app, verified 2026-06-18)*

Verified on `feature/005-model-config-ui` (off 001–004). Confirms SPEC 005 §2.

- **[C2] Settings atom** — `packages/app/src/state/settings.ts:10` `settingsState =
  atomWithStorage<Settings>('settings', {…}, storage)` (jotai, localStorage via
  `createHybridStorage` L8). The default object (L12–24) does **not** list
  `llmProfiles`/`llmSkills`/`llmPresets` — they're optional on `Settings` and default to
  **`undefined`** until authored, so selector option-builders must read `settings.llmProfiles ?? []`.
  *(Phase A reads this **flat** path; Feature 006 migrates the single read to
  `settings.modelConfig?.profiles`.)*
- **[C2] Editor-type dispatch is the one exhaustive switch.** `components/editors/
  DefaultNodeEditorField.tsx` builds the rendered editor via `match(editor)…` ending in
  **`.exhaustive()`** (L51–73 pre-005). It is the *only* exhaustive switch over
  `EditorDefinition['type']` — every other `match({type:…})` in the app is over **DataValue** types,
  and graph search (`hooks/graphSearch.ts:468`) is a non-exhaustive `type==='code' ||
  includeInGraphSearch` check that safely skips selectors. So adding union members **forces** the
  matching `.with()` cases here at compile time — core + app land as one atomic commit.
- **[C2] Selector precedent = `graphSelector`** — `utils/graphSelectorOptions.ts`
  (`getProjectGraphSelectorOptions`, sorted `{label,value}` + a "Missing graph: <id>" row) +
  `components/editors/GraphSelectorEditor.tsx` (reads `useAtomValue(projectState)`). Feature 005
  mirrors both against `settingsState`: `utils/llmSelectorOptions.ts` (`getLlmSelectorOptions`, with a
  leading `None` and a `Missing: <id>` dangling row) + `components/editors/LlmSelectorEditors.tsx`.
- **[C2] No DOM/React test renderer in `packages/app`** (no testing-library/jsdom). The suite is
  `tsx --test`: pure-helper unit tests + **source-contract** tests that read a component's `.tsx` text
  and assert its imports/usage (cf. `GraphSelectorEditor.test.ts`). Actual rendering is Playwright's
  job (post-merge, against served Studio Server).
- **[C2] Pre-existing duplicate** — the `EditorDefinition` union lists `GraphSelectorEditorDefinition`
  twice (`EditorDefinition.ts` ~L262 & ~L264). Harmless; left as-is (minimal blast radius).

### J.1 Feature 005 Phase B anchors — project-scoped model-config authoring  *(verified 2026-06-18, implemented)*

- **[C2] Project-scoped authoring home = the "Project settings" modal.** Opened from
  `components/GraphList.tsx:935` (label "Project settings") → `ProjectInfoModal` → `ProjectInfoPanel`
  (`components/ProjectInfoModal.tsx:206`), which hosts the project-scoped panels: `ProjectMCPConfiguration`,
  `ProjectReferencesConfiguration`, and foldable `ProjectPluginsConfiguration` / `ProjectContextConfiguration`
  via `ProjectInfoFoldableSection` (`:429`). Phase B adds a `ProjectInfoFoldableSection sectionKey="model-config"`
  hosting the new `ProjectModelConfigConfiguration`.
- **[C2] CRUD precedent = `ProjectReferencesConfiguration.tsx`** — `const [project, setProject] = useAtom(projectState)`
  (`:28`), and writes via `setProject(prev => ({ ...prev, references: [...] }))` (`:62-67`). The model-config panel
  mirrors this over `project.modelConfig.{profiles,skills,presets}`.
- **[C2] `projectState` carries `modelConfig`** — `state/savedGraphs.ts:29`
  `atomWithStorage<Omit<Project,'data'>>('projectState', …)`; it's `Omit<Project,'data'>` so the 006 `modelConfig`
  field rides along.
- **[C2] Project edits need an explicit flush.** The 'project' hybrid storage group is debounced —
  `ProjectContextConfiguration.tsx` calls `flushHybridStorageGroup('project')` after each edit
  (`:12` import, `:91-92`), pinned by its test. The model-config panel does the same (corrects SPEC Phase B's
  "persistence is automatic"). Authored entities then serialize into the project file via 006.
- **[C2] Selector re-point is one spot.** `getLlmSelectorOptions(items, …)` (`utils/llmSelectorOptions.ts`) is
  source-agnostic. Phase B routes the three renderers in `components/editors/LlmSelectorEditors.tsx` through a single
  helper `utils/projectModelConfig.ts → getEditorModelConfig(project)` reading `projectState` (was `settingsState`).
  When the global library lands, `getEditorModelConfig` becomes `merge(project, global)` project-first — one change,
  not three. `LlmSelectorField` is now **exported** for reuse in the preset form.
- **[C2] Forms are presentational/store-decoupled** (`components/modelConfig/Llm{Profile,Skill,Preset}Form.tsx`):
  `value` in / `onChange` out, no store imports/hooks — so the deferred global-library panel reuses them verbatim.
  `extraBody` (Skill) and `overrides` (Preset) object editors are deferred to Phase C (drop-in fields, no restructure).
- **[C2] Field primitives** — `@atlaskit/textfield`, `@atlaskit/textarea`, `@atlaskit/select`, `@atlaskit/toggle`,
  and `KeyValuePairs` (`components/editors/KeyValuePairEditor.tsx`, for profile headers) are all available/used.
- **[C2] Validation** — app `tsc` + `vite build` green; app suite 1127 / core 700 green incl. the updated selector
  contract test and the new `ProjectModelConfigConfiguration.test.ts` (asserts: authors into `projectState`, writes
  `Project.modelConfig`, flushes 'project', forms store-free, generic profile fields, Phase C deferrals). Playwright
  E2E flagged post-merge.

### J.2 Feature 005 Phase C1 anchors — object editors + extends + a11y  *(verified 2026-06-19, implemented)*

- **[C1] `advanced?: boolean` on `SharedEditorDefinitionProps`** (`model/EditorDefinition.ts`) — a UI hint like
  `hideIf`/`helperMessage`; never affects resolution. `ChatNodeBase.getEditors` adds a **separate** advanced `group`
  (`advanced: true`) holding the `extraBody` custom editor (`customEditorId: 'extraBodyJson'`, `dataKey: 'extraBody'`),
  distinct from the pre-existing always-visible "Advanced" group (gating that would hide shipped controls).
- **[C1] Show-overrides gate** — `showModelConfigOverridesState` (`state/ui.ts`, `atomWithStorage`, default **off**).
  `DefaultNodeEditorField` adds `advanced-editor` to a row when `editor.advanced`; `DefaultNodeEditor` reads the pref,
  adds `hide-advanced-editors` to the container when off (CSS `&.hide-advanced-editors > .row.advanced-editor { display:none }`
  — CSS-hide, not unmount), and renders a "Show overrides" toggle **only when** `editors.some(e => e.advanced)` (no chrome
  on other nodes). Clean-node default byte-identical (covered by extended `chatNode004Baseline.test.ts`).
- **[C1] Shared JSON object editor** — `components/modelConfig/JsonObjectField.tsx`, pure (`value`/`onChange`), with an
  exported pure `parseJsonObjectInput` (empty ⇒ clear; valid object ⇒ commit; invalid/non-object ⇒ error, **not**
  committed). Bound on the node via the `custom`-editor adapter `components/editors/custom/ExtraBodyJsonEditor.tsx`,
  registered in `CustomEditor.tsx` (`.with('extraBodyJson', …)`, non-exhaustive `.otherwise`).
- **[C1] Shared field groups** — `components/modelConfig/modelConfigFields.tsx` exports `ConnectionFields` /
  `BehaviorFields` with `mode: 'direct' | 'override'`. **Pure extraction**: `LlmProfileForm`/`LlmSkillForm` now compose
  them (the B round-trip tests stayed green untouched — the extraction proof). **Override mode keys by PRESENCE** —
  `present = mode === 'override' ? key in value : true`; each scalar gets a per-field toggle that writes/removes the key,
  so "inherit" vs "set to empty/zero/false" is distinguishable (the load-bearing `overrides` requirement). Enums with an
  "Inherit" option and `headers`/`extraBody` express inherit by their own empty state.
- **[C1] `overrides` editor** — `components/modelConfig/LlmOverridesForm.tsx` runs both groups in override mode plus the
  JSON editor for `overrides.extraBody`; emits `undefined` when nothing is overridden. Wired into `LlmPresetForm` as an
  "Overrides (advanced)" subsection. `extraBody` added to `LlmSkillForm`.
- **[C1] Extends pickers (finding 1)** — `LlmProfileForm`/`LlmSkillForm` render `LlmSelectorField` for `extends`,
  **always present** (the `.length > 0` guard is gone), self-excluded (`filter(e => e.id !== value.id)`).
- **[C1] A11y (finding 6)** — `ProjectInfoFoldableSection` (`components/ProjectInfoModal.tsx`) now passes
  `contentElementId` + `triggerElementProps.id` derived from `sectionKey`. react-collapsible otherwise falls back to a
  `Date.now()`-based id (verified in `src/Collapsible.js:13`) shared across sections mounting in the same tick, so each
  region's `aria-labelledby` resolved to the wrong trigger. Now each region reports its own name (de-flakes the
  Playwright region locators).
- **[C1] Finding 2 cleared** — shipping `overrides` makes the Chat node Preset precedence copy ("Node > Preset overrides
  > Skill > Profile > Global", `ChatNodeBase.ts`) true; no trim needed.
- **[C1] Validation** — app `tsc` + `vite build` + lint green; core build + lint green; **app 1136 / core 703** green
  (new: `JsonObjectField.test.ts`, `modelConfigGate.test.ts`, extended panel + baseline tests). Playwright deltas
  (`~/project/ui-testing/tests/model-config-ui.spec.ts`: author extraBody/overrides/extends, toggle Show-overrides) are
  noted for the post-merge ui-testing run, not run here.

### J.3 Feature 005 Phase C2 anchors — override badges (read-only)  *(verified 2026-06-19, implemented)*

- **[C2] Composition anchor — `describeNodeComposition` is a thin wrapper.** `resolveNodeModelComposition`
  (`model/LlmPresetResolution.ts`) composes `Preset.overrides > Skill > Profile` and does **not** fold in the node's
  own per-field values (those apply downstream in `process()` via `applySkillParams` + `resolveChatNodeConnection`), so
  its output is the **composed-sans-node** baseline. `describeNodeComposition(settings, {llmPresetId,llmProfileId,llmSkillId})`
  re-keys it to a per-field map and **omits the node's own `extraBody`** (so composed `extraBody` = Skill < Preset.override).
  Each value is `undefined` when the composition has no opinion → nothing to override → no badge.
- **[C2] Override rule mirrors the runtime** (`computeOverriddenModelConfigFields(composed, data, defaults)` → `Set<dataKey>`):
  behavior fields (`SKILL_PARAM_FIELDS`) badge iff composed defined AND node value ≠ its **default** (the `applySkillParams`
  fill rule) AND ≠ composed; `undefined`/unset inherits. Connection (`model` = `overrideModel||model`, `endpoint`) badge iff
  composed defined AND node **truthy** AND ≠ composed. `headers` badge iff a node key **shadows** a composed key with a
  different value (additive/same = no badge). `extraBody` badge iff composed non-empty AND node non-empty AND not deep-equal
  (`lodash isEqual`). Pure; lives in core beside the resolution (reuses the chain, no merge re-impl).
- **[C2] App wiring (read-only).** `DefaultNodeEditor` computes the composed map from `getEditorModelConfig(project)` (the
  **same project-scoped source** the selectors use — global excluded by design, matching "overriding your preset/skill/profile"),
  the node defaults from `projectNodeRegistry.createDynamic(node.type).data`, the overridden `Set` once via the core helper,
  then **excludes input-wired fields** (`data[editor.useInputToggleDataKey]`) and threads `overriddenDataKeys` down.
  `DefaultNodeEditorField` renders a read-only `.override-badge` span (no handlers) when its `dataKey` is in the set. No node
  data / composition / request is touched — the byte-identical baselines stay green (the read-only proof).
- **[C2] Dual keys** — `model` badges via the effective value (`overrideModel || model`) on the primary row; the override-* row
  isn't double-badged.
- **[C2] Validation** — app `tsc` + `vite build` + lint green; core build + lint green; **app 1139 / core 720** green
  (new: core `describeNodeComposition.test.ts`, app `overrideBadge.test.ts`). Playwright deltas (badge appears when a node
  field overrides its preset; clears when matched / unset / wired) noted for the post-merge ui-testing run. **Feature 005 complete.**

## K. Feature 006 anchors — project-embedded model-config / portability  *(verified 2026-06-18, implemented)*

> Verified against the working tree on `feature/006-project-embedded-model-config` (off `main` —
> the `integration` branch is gone; 001–005A all landed on `main`, HEAD `932167cc`). Line numbers
> shift as edits land; re-grep the named symbols.

- **[C2] Reshape, not a new field.** 001–004's three flat `Settings` fields became one nested,
  shared object: `Settings.modelConfig?: ModelConfig` with `ModelConfig = { profiles?: LlmProfile[];
  skills?: LlmSkill[]; presets?: LlmPreset[] }` (`model/Settings.ts`, both defined there alongside the
  entity types; exported via `exports.ts` `export type * from './model/Settings.js'`). The **same**
  `ModelConfig` is added to `Project` (`model/Project.ts`, beside `plugins?`/`references?`).
- **[C2] Resolution read-path renamed, logic unchanged.** The helpers now take
  `Pick<Settings, 'modelConfig'>` and read `settings.modelConfig?.{profiles,skills,presets} ?? []`:
  `LlmProfileResolution.ts` (`resolveProfile`), `LlmSkillResolution.ts` (`resolveSkill`),
  `LlmPresetResolution.ts` (`resolvePreset`, `findDefaultPreset`, `resolveNodeModelComposition`).
  `api/processSettings.ts` `resolveProcessSettings` returns `modelConfig: settings.modelConfig ?? {}`
  (one line; the `Required<Settings>` return type forces it — the same compile-time guardrail noted in §F).
- **[C2] Serialization is additive, no version bump.** `serialization_v4.ts`: `SerializedProject`
  gains `modelConfig?: ModelConfig`; `toSerializedProject` writes `modelConfig: project.modelConfig ?? {}`
  and `fromSerializedProject` reads `serializedProject.modelConfig ?? {}` (mirrors the `plugins`/
  `references` `?? []` precedent). Old/v1–v3 projects deserialize to **absent** (`undefined`, the v1–v3
  deserializers never set it); a field-less v4 to **empty** (`{}`). Both resolution-safe.
- **[C2] Assembly seam = `GraphProcessor.#initializeGraphRun`** (not a two-site augment). Right after
  `this.#context = context`, it sets
  `this.#context = { ...context, settings: assembleModelConfig(context.settings, this.#project) }`.
  `#initializeGraphRun` runs once per processor (top-level *and* every subprocessor) against that
  processor's own `#project`, so the single hook covers all subgraph cases — confirmed by tracing:
  `#prepareNodeProcessContextBase` spreads `...this.#context`, and `#createNodeProcessContext`
  inherits via `base: this.#nodeProcessContextBase`. Ordering proof: `processGraph` calls
  `#initializeGraphRun` **before** `#prepareNodeProcessContextBase`.
- **[C2] Subgraph cases (the open edge, resolved).** Subprocessors are run via
  `subprocessor.processGraph(context, …)` with the **parent's** context (`CallGraphNode`,
  `SubGraphNode`, `LoopUntilNode`, `CronNode`, `ReferencedGraphAliasNode`); `#createSubProcessor`
  sets `subprocessorProject = project ?? this.#project` and builds a new `GraphProcessor` for it.
  Because the augment re-runs in each subprocessor's `#initializeGraphRun`: same-project subgraph is
  idempotent (project wins both merges); a cross-project `ReferencedGraphAliasNode` (passes
  `{ project }`) resolves referenced → parent → global. (Forgiving inheritance, not strict isolation;
  noted as a possible future reset-instead-of-inherit refinement.)
- **[C2] `assembleModelConfig`** (`model/assembleModelConfig.ts`): pure, no-mutate; returns a fresh
  `Settings` whose `modelConfig` merges by id with **project winning**, every other field carried
  through. An absent axis stays absent (no synthesized empty arrays).
- **[C2] App migration (005 Phase A merged).** `components/editors/LlmSelectorEditors.tsx` reads
  `settings.modelConfig?.{profiles,skills,presets} ?? []` (was the flat path); the source-contract
  test `LlmSelectorEditors.test.ts` regex updated to match. `utils/llmSelectorOptions.ts` takes
  `items`, unchanged.
- **[C2] Validation.** Core build/lint/test green (700 core tests incl. new `assembleModelConfig`,
  `modelConfig006Baseline`, serialization round-trip); app (1123) and node (104) green; the headless
  `feature-006-portable-modelconfig-harness.ts` proves two embedded presets route to two
  endpoints/keys/models with **no global model-config**, survive serialize→deserialize, and leave an
  unselecting node byte-identical. Harness option-seeding for 001–004 migrated from the flat keys to
  `modelConfig` (caller-side rename; the node `RunGraphOptions & Settings` now carries `modelConfig`).