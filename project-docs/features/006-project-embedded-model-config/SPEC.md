# SPEC 006 — Project-Embedded Model-Config (Portability)

> Target: fork of `valerypopoff/rivet2.0` (GitHub `sendit2me/rivet2.0`), `main` (001–006 merged).
> Core data-model + serialization + execution. **As-built** — shipped in commit `7cfbbb94` (27
> files); the assembly seam landed at `GraphProcessor.#initializeGraphRun` (§3/§5), subgraph
> behaviour resolved (§5).

| | |
|---|---|
| **Status** | **Shipped** (merged to `main`) — the release gate for publish/trigger; landed before 005-B |
| **Order** | Feature 6 (core) |
| **Depends on** | 001–004; informs 005-B (authoring writes to the location this defines) |
| **Blast radius** | `core`: a `ModelConfig` type + `Project`/`Settings` shape + `serialization_v4` + one `GraphProcessor` seam + a merge helper + a resolution read-path rename. **Resolution logic unchanged.** Additive — old projects unaffected. **No Rust.** |

## 1. Why this is the release gate

Today the model-config lives only in global `Settings` (browser-local — 005 D2). The moment a
workflow runs **without a browser** — a published endpoint, a scheduled trigger, a downloaded
project opened elsewhere — the server-side executor has no global `Settings`, so it can't
resolve profiles/skills/presets and can't choose a model. Nothing is releasable as a
self-contained or triggerable workflow until the model-config **travels with the project**.
This feature embeds it in the `Project` so a saved `.rivet-project` is self-contained and
server-runnable. It is purely additive: a project that uses one model everywhere — or none of
this — behaves exactly as today.

## 2. Decisions (locked) + design

- **D1:** model-config lives in **both** global `Settings` (a reusable library) and the
  **`Project`** (embedded, travels). Neither replaces the node's existing `model` field — it
  layers on.
- **D2:** the model-config is a **single cohesive `ModelConfig` object** —
  `{ profiles?, skills?, presets? }` — not three loose top-level fields. One findable object (you
  always know where "the model-config" is used), and the nesting is honest that these *compose*:
  Profile + Skill + Preset resolve into one model configuration. The **same `ModelConfig` shape**
  is used on both `Project` and `Settings`, so there is never a second representation to keep in
  sync. *(This reshaped 001–004's flat `Settings.llmProfiles/…` into `Settings.modelConfig` — a
  small, mechanical, test-covered change folded into this feature.)*
- **Runtime resolves from an effective set = `merge(project, global)`, project winning by id.**
  The **processor** — run by both the browser and the server/RSS executor — injects the project's
  model-config into each node's `settings`, so interactive and headless/triggered execution both
  work with **no caller changes**.
- **Portability invariant:** a headless run sees only the project's model-config (global may be
  absent server-side), so a portable project must **carry the entities its nodes reference**. The
  global library is materialized into the project on use (005-B's authoring); 006 provides the
  data model + merge.
- **Resolution (001–004) does not change** — `resolveNodeModelComposition` already takes a
  `Settings`-shaped object; only the field path moves (`settings.llmProfiles` →
  `settings.modelConfig?.profiles`). The effective settings it reads now include the project's.

## 3. Core anchors (verified; as-built sites in **bold**)

- **`Project` type** (`model/Project.ts`): `Project = { metadata; plugins?: PluginLoadSpec[];
  graphs; references?; … }`. `plugins?` / `references?` are the optional, project-scoped
  precedent mirrored by `modelConfig?`.
- **Serialization** (`utils/serialization/serialization_v4.ts`): `serializeProject` →
  `projectV4Serializer`; `deserializeProject` dispatches by version (v1–v4) for backward-compat.
  V4 maps fields explicitly with `?? []` defaults — **`plugins ?? []` / `references ?? []` at
  serializer ~L102–103, the same on deserialize ~L112–113**. `modelConfig` follows those lines
  with **`?? {}`**; old / v1–v3 / field-less projects deserialize to an absent/empty object.
  **No version bump.**
- **Assembly seam** (`model/GraphProcessor.ts` + `api/processSettings.ts`): the top-level process
  settings is established by `resolveProcessSettings(options)` (`api/processSettings.ts`, called
  from `coreCreateProcessor`). 001–004's `resolveNodeModelComposition` reads the model-config off
  `context.settings`, and each per-node `InternalProcessContext` inherits the processor's
  `settings`. **The as-built hook augments the processor's context once, inside
  `GraphProcessor.#initializeGraphRun` (~L1088–1095): `this.#context = { ...context, settings:
  assembleModelConfig(context.settings, this.#project) }`** — before `#prepareNodeProcessContextBase`
  spreads it to per-node contexts. It runs once per processor (top-level **and** every
  subprocessor), each against its own `this.#project`, covering headless/triggered (the processor
  is shared by browser and server executor).
- **Global model-config on `Settings`** was three flat fields (`llmProfiles?` / `llmSkills?` /
  `llmPresets?`, plus `extraBody` on skills/preset-overrides) from 001–004; this feature folded
  them into the single `ModelConfig` object (D2) shared by `Project` and `Settings`.

## 4. The changes (as shipped)

1. **Canonical type + schema**: `ModelConfig = { profiles?: LlmProfile[]; skills?: LlmSkill[];
   presets?: LlmPreset[] }` (core, co-located in `model/Settings.ts` with the entity types). Added
   optional `modelConfig?: ModelConfig` to `Project` (`model/Project.ts`), beside `plugins?` /
   `references?`. **Reshaped `Settings`** from the three flat fields to the same `modelConfig?`.
2. **Resolution read-path** (`LlmProfileResolution` / `LlmSkillResolution` /
   `LlmPresetResolution`): reads moved `settings.llmProfiles` → `settings.modelConfig?.profiles`,
   etc. **Logic unchanged.** `resolveProcessSettings` is typed `Required<Settings>` in
   `api/processSettings.ts` — a compile-time guardrail forcing `modelConfig` to be emitted.
3. **Serialization (v4)**: `modelConfig` added to `SerializedProject`, to `projectV4Serializer`
   (`modelConfig: project.modelConfig ?? {}`), and to the deserializer (undefined-safe). Old /
   v1–v3 / field-less projects → absent/empty — additive, no version bump.
4. **Assembly helper (core)** — `assembleModelConfig(global: Settings, project: Project): Settings`
   → returns `settings` whose `modelConfig` = `{ profiles: mergeById(project…, global…), skills: …,
   presets: … }` (**project wins** by id); every other settings field untouched. Pure, no-mutate —
   symmetric `modelConfig`→`modelConfig` merge (both sides share the shape). (`model/Settings.ts`
   neighbourhood / beside `LlmPresetResolution.ts`.)
5. **Processor wiring** — assembled **once** in `#initializeGraphRun` (§3), so every per-node
   `InternalProcessContext` inherits the merged settings (cheaper than per-node). **Subgraph
   (resolved):** because the assembly runs per-processor against `this.#project`, each subprocessor
   assembles against its *own* project. Verified: top-level = `merge(top, global)`; same-project
   subgraph is idempotent (project wins both layers); cross-project `ReferencedGraphAliasNode`
   (`subprocessorProject = project ?? this.#project`, ~L2306) merges the referenced project over the
   inherited parent chain (referenced → parent → global). *Noted non-blocker:* cross-project
   inherits the parent as a fallback layer — forgiving, not strict isolation.

## 5. Additive / byte-identical (the rail)

- A project with no `modelConfig` + nodes with no Profile/Skill/Preset selection ⇒ effective
  settings carry no entities, no selections ⇒ **exactly today's request**. Proven by
  `modelConfig006Baseline.test.ts`.
- A node selecting a project preset uses that profile's endpoint/key/model; a node with **no**
  selection is byte-identical **regardless of what the project carries**.
- **plan=Claude / execute=Qwen:** two presets in `project.modelConfig.presets` (one Profile=Claude,
  one Profile=Qwen), each selected on its node; both travel; download/publish runs headless with
  both models. A project that uses none of it is untouched. (Proven by
  `feature-006-portable-modelconfig-harness.ts` — both presets in `project.modelConfig`, no global
  settings, portability demonstrated.)

## 6. Edge cases

1. Old `.rivet-project` (pre-006, or v1–v3) → `modelConfig` absent/empty → behaves as today.
2. Node references a project entity present in the project → resolves from project (portable).
   References a global-only id (in the editor) → resolves via global-fallback but is **not
   portable** until materialized into the project (005-B). Never a silent failure — falls back
   per 001–004 unknown-id handling.
3. Id collision between a project and a global entity → **project wins**.
4. Round-trip: serialize → deserialize → identical `modelConfig`.

## 7. Testing (as shipped — core 700 green)

- **Round-trip:** a project with a populated `modelConfig` serializes and deserializes equal; a
  field-less / old project deserializes to absent/empty.
- **Assembly:** `assembleModelConfig` merges by id with project winning, leaves other settings
  untouched, no-mutate.
- **Reshape regression:** the 001–004 resolution tests stay green after the field-path rename.
- **Byte-identical execution:** `modelConfig006Baseline.test.ts` — a project *carrying* `modelConfig`
  but a node with no selection produces the unchanged request.
- **End-to-end (the payoff):** `feature-006-portable-modelconfig-harness.ts` — a Claude preset and a
  Qwen preset both in `project.modelConfig`, run with no global settings, proving portability.

## 8. Acceptance (met)

- `ModelConfig` defined; `Project` + `Settings` both carry `modelConfig?`; resolution reads the
  new path with logic unchanged.
- v4 serializes/deserializes `modelConfig`; old projects unaffected.
- The processor injects project model-config into node settings; merge is project-first.
- Byte-identical no-selection proven; the two-model project runs both interactively and headless.

## 9. Files (as shipped)

- `ModelConfig` type (co-located in `model/Settings.ts`).
- `model/Project.ts` (+`modelConfig?`), `model/Settings.ts` (flat fields → `modelConfig?`).
- `model/LlmProfileResolution.ts` / `LlmSkillResolution.ts` / `LlmPresetResolution.ts`
  (read-path `settings.modelConfig?.…`; logic unchanged), and `api/processSettings.ts`
  (`resolveProcessSettings: Required<Settings>` → `modelConfig`).
- the resolution + `processSettings` **test files** migrated from the flat fields to `modelConfig`.
- `utils/serialization/serialization_v4.ts` (`SerializedProject` + serializer + deserializer).
- `model/GraphProcessor.ts` (assemble in `#initializeGraphRun`; subgraph branch).
- the `assembleModelConfig` helper.
- VERIFIED-FINDINGS §K (the §3 anchors + the reshape read-site list).
- *(005 Phase A's `llmSelectorOptions` migrated to read `settings.modelConfig?.profiles ?? []`;
  Phase B then re-pointed it to the **project's** modelConfig via `getEditorModelConfig`. 005-B
  authoring writes into `project.modelConfig`.)*

## 10. Gate (closed)

Same discipline as 001–005: a pre-code report confirmed the §3 anchors — the exact
`#initializeGraphRun` seam, that v4 is the live serializer with explicit `?? []` field mapping, that
001–004's resolution reads `context.settings`, and the subgraph/subprocessor behaviour — plus the
merge precedence (project wins), the reshape read-site list, the file list, and the
additive/byte-identical proof. D2's `ModelConfig` shape is locked (nested, shared by `Project` and
`Settings`). Implemented as one gated unit, reviewed, **merged to `main`** (commit `7cfbbb94`).
Landed **before** 005-B, since 005-B's authoring writes entities to the location 006 defines.