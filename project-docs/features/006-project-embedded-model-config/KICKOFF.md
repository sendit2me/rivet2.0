# KICKOFF — Feature 006 (Project-Embedded Model-Config / Portability)

You are working in `~/project/rivet2.0` (the fork `sendit2me/rivet2.0`), on branch
`integration` (Features 001–004 merged; 005 Phase A may or may not have landed — see §coord).
This kicks off **Feature 006 — project-embedded model-config**, the core data-model +
serialization + execution work that lets a saved project run **without a browser** (published /
scheduled / downloaded-and-opened-elsewhere).

## Read first, in this order
1. `project-docs/features/006-project-embedded-model-config/SPEC.md` — the spec. §2 (locked
   decisions), §3 (verified anchors), §4 (the changes), §10 (this gate).
2. `project-docs/CLAUDE.md`, `project-docs/DECISIONS.md`, `project-docs/VERIFIED-FINDINGS.md`.
3. `project-docs/features/ROADMAP.md`.

## Rails (non-negotiable)
- **Gated.** Investigate → write a **pre-code report** → STOP and wait for sign-off → implement
  → STOP at the feature boundary. No feature code before the report is approved.
- **Additive / byte-identical is sacred.** A project with no `modelConfig` and nodes with no
  Profile/Skill/Preset selection must produce **exactly today's request**. Old `.rivet-project`
  files (and v1–v3) must round-trip to an absent/empty `modelConfig`. This extends the 001–004
  rail.
- **The reshape changes paths, not logic.** Folding `Settings`'s flat `llmProfiles/llmSkills/
  llmPresets` into `settings.modelConfig` is a field-path rename in the resolution helpers —
  their *logic* must not change, and the existing 001–004 resolution tests must stay green
  (updated only for the new field path).
- **No hardcoded domain knowledge** (Constraint #13). Core work — **no Rust**.

## Scope (the whole feature, one gated unit)
Per SPEC §4: define `ModelConfig = { profiles?; skills?; presets? }`; add `modelConfig?:
ModelConfig` to `Project`; reshape `Settings` to the same `modelConfig?`; rename the resolution
read-paths to `settings.modelConfig?.…`; serialize `modelConfig` in v4; add
`assembleModelConfig(global, project)` (project-wins merge) and wire it so the processor's
established settings carry the project's model-config, inherited by every node.

## Investigate, then REPORT (no code yet)
Most anchors below were checked against **upstream** base-Rivet earlier; confirm them on
**`integration`** (line numbers may have shifted) and report `file:line` + any divergence:

1. **Assembly seam** — confirm where the processor's `this.#context.settings` is established from
   the resolved global settings (the augment-once point), the per-node `InternalProcessContext`
   builder (expected ~L2186) that inherits it, and that `resolveProcessSettings(options)`
   (`api/processSettings.ts`, called from `coreCreateProcessor` in `api/createProcessor.ts`)
   builds the global settings. Quote the lines.
2. **Serializer is v4 + explicit** — confirm `serializeProject` → `projectV4Serializer`, and that
   `projectV4Serializer` / `projectV4Deserializer` map fields explicitly with `?? []` defaults.
   Quote the `plugins` / `references` lines as the precedent, and confirm an additive optional
   field needs **no version bump**.
3. **Resolution reads `context.settings`** — re-confirm (already established architecturally):
   `resolveNodeModelComposition(context.settings, …)` and the helpers read `settings =
   context.settings`. Quote the call site + the array reads.
4. **Subgraph — the open edge (no prior context; get certainty).** At the subprocessor branch
   (`subprocessorProject = project ?? this.#project`, expected ~L2306), determine whether a
   subprocessor **re-establishes its own `settings`** (so the assembly runs against *that*
   subprocessor's project, the cross-project-reference case) or inherits the parent's. Report
   what you find and where the assembly hook must go so subgraph execution resolves against the
   right project.
5. **Reshape read-site list** — every read of `settings.llmProfiles` / `.llmSkills` /
   `.llmPresets`, with exact lines: the three resolution files (`LlmProfileResolution.ts` /
   `LlmSkillResolution.ts` / `LlmPresetResolution.ts`), `api/processSettings.ts`
   (`resolveProcessSettings`), `model/Settings.ts` (the type), and the test files
   (`LlmProfileResolution.test.ts`, `LlmPresetResolution.test.ts`, `extraBodyComposition.test.ts`,
   `processSettings.test.ts`). **Also** any app-side read if 005 Phase A has merged (the
   `llmSelectorOptions` builder reading `settings.llmProfiles ?? []` → migrate to
   `settings.modelConfig?.profiles ?? []`).

Then also report:
6. **Decisions restated** — D1 (model-config in both `Project` and `Settings`), D2 (single
   `ModelConfig` shape, **shared** by `Project` and `Settings` — locked, nested, not flat),
   merge precedence (**project wins** by id), additive/byte-identical.
7. **File list** — every file you'll add/touch (per SPEC §9, adjusted to what you find).
8. **Test plan** — round-trip (populated `modelConfig` serializes/deserializes equal; old/v1–v3
   → empty); `assembleModelConfig` merge-by-id project-wins + no-mutate; the 001–004 resolution
   tests green after the path rename; the byte-identical baseline extended (a project *carrying*
   `modelConfig` but a node with no selection → unchanged request).
9. **Conflicts / surprises** — anything that contradicts the SPEC anchors, especially if the
   subgraph path (item 4) forces a different assembly hook than "augment once at settings
   establishment."

Then **STOP** and wait for sign-off.

## After sign-off (implementation discipline)
- Implement as **one cohesive unit**: `ModelConfig` type → `Project` + `Settings` shape →
  resolution path rename (logic unchanged) → v4 serialize/deserialize → `assembleModelConfig`
  (pure, no-mutate, project-wins) → processor wiring (augment once; subprocessor-aware per item
  4) → migrate the Phase A read if present.
- Prove additive/byte-identical with an extended baseline test; prove the serialization
  round-trip and the old-project→empty path; keep the 001–004 resolution tests green.
- Green: core build, lint, the full core test suite (resolution + serialization + processor).
- **One logical commit** on `feature/006-project-embedded-model-config`.
- **STOP at the feature boundary.** Do not push — leave the branch for diff review.

## §coord — sequencing
- **Land 006 before 005-B** (005-B's authoring writes entities into `project.modelConfig` + the
  global library — the location this feature defines).
- If 005 Phase A has merged, this feature migrates its single `llmSelectorOptions` read from the
  flat field to `settings.modelConfig?.profiles` (item 5). If it hasn't, there's no app-side read
  to migrate yet — note which case applies in the report.