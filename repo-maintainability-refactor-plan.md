# Repo Maintainability Refactor Plan

## Status

Planning document. Reviewed against `refactor-history.md`. No implementation
phases have started.

## Goal

Refactor the repo without changing functionality, public behavior, project file
format, or runtime semantics. The work should make the codebase easier to
change safely, reduce bug surface, remove unnecessary complexity, and delete
code where a proven replacement already exists.

## Audit Scope

This plan is based on a repo-wide pass over source size, package boundaries,
developer docs, GitHub workflow/build contracts, execution/runtime code, UI
editor code, test structure, and the durable lessons in `refactor-history.md`.

Useful baseline commands:

```powershell
git status --short
node scripts\checks\check-file-tree.mjs
rg "@valerypopoff/.*/src" packages scripts
rg "eslint-disable|ts-ignore|ts-expect-error|as any|TODO|FIXME" packages developer-docs scripts
```

## Lessons From `refactor-history.md`

The refactor history confirms the five problem areas below are still real, but
they are residual problems after several serious cleanup passes, not greenfield
refactors. That changes how this plan should be executed:

- `GraphProcessor` has already had multiple extractions, including
  `GraphPreprocessor`, cycle detection, recording playback, process-context
  building, planner/subprocessor helpers, node-exclusion policy, runtime policy
  selection, and execution-plan caching. Future work must extract one remaining
  execution policy at a time instead of doing another broad processor rewrite.
- Editor UI components have already been decomposed several times, with domain
  modules for graph editing and table-driven data-value rendering. Future work
  should target residual decision logic and duplicated policy calculations, not
  create thin presentation shims.
- The legacy `Chat` / `Chat Loop` path still uses `ChatNodeBase`, but new work
  should optimize the user-facing `LLM Chat` node powered by the Vercel AI SDK.
  Provider refactors should start under `packages/core/src/model/chat-v2` and
  touch legacy chat only when preserving compatibility requires it.
- The runtime-speed work recently added cached runner and graph-plan policy
  seams, then recovered broad benchmark regressions. Any runtime or CodeRunner
  refactor must preserve the final speed matrix and benchmark before/after
  rather than treating performance as incidental.
- Line-count reduction is useful only when it removes concepts. The history
  explicitly says "kept intentionally" can be a valid refactor result when a
  helper already pays rent.
- `LLM Chat` already has detailed developer-doc contracts. Refactor work in
  that area must start by mapping docs to tests, because many behaviors are
  deliberate compatibility or provider-workaround choices rather than incidental
  complexity.

## Refactor Guardrails

- No functionality changes.
- No serialized `.rivet-project` or YAML schema changes.
- No change to normal editor execution, Remote Debugger execution, recordings,
  CLI behavior, Trivet behavior, or wrapper-facing package contracts.
- Characterization tests come before structural changes in risky areas.
- Prefer moving code and extracting pure helpers over rewriting behavior.
- Keep compatibility exports until every internal consumer has moved.
- Preserve the recent execution-speed policy matrix. Any `GraphProcessor`,
  `createProcessor`, `runGraph`, scheduler, or CodeRunner change must run the
  relevant runtime compatibility and benchmark checks.
- Every phase must update developer docs when contracts, ownership, or
  verification commands become clearer.
- Delete code only after proving it is unused by local search, TypeScript,
  package builds, and CI workflow checks.

## The 5 Worst Problems

## 1. `GraphProcessor` Is Still A Runtime Monolith

Evidence:

- `packages/core/src/model/GraphProcessor.ts` is about 2100 lines.
- It owns graph preprocessing, scheduling, node readiness, subprocessor
  bridging, frozen output replay, split-run handling, exclusions, costs, graph
  outputs, global events, aborts, tokenizers, and error aggregation.
- Supporting collaborators already exist, but the main class still coordinates
  too many low-level details directly.

Why this is dangerous:

- Small runtime changes can accidentally affect unrelated execution modes.
- The difference between compatible scheduling, fast scheduling, subgraphs,
  run-from-here, frozen outputs, aborts, and recordings is hard to reason about
  in one file.
- Bug fixes tend to add another branch to the central processor instead of
  shrinking the runtime surface.

Target state:

- `GraphProcessor` continues toward a thinner orchestration facade, but only by
  moving one remaining policy at a time.
- Scheduling, node execution, graph-boundary effects, frozen replay, and
  subprocessor wiring live in focused modules with explicit contracts.
- Existing tests still prove event ordering, output identity, error behavior,
  and side-effect semantics.

Plan:

1. Inventory the current extracted collaborators before adding new modules.
   Do not re-extract responsibilities already owned by the preprocessor,
   planner, subprocessor bridge, node-exclusion policy, or runtime policy.
2. Add characterization tests around the exact seam before moving code:
   scheduler choice, node start/finish ordering, graph output effects,
   subgraph inheritance, frozen replay, abort behavior, and missing-input
   exclusions.
3. Extract graph-boundary effects into a module that owns graph outputs,
   recoverable frozen effects, costs, and duration data.
4. If node execution is extracted, extract only the smallest policy-proven
   slice. Keep lifecycle emission order, callback visibility, recording
   serialization, and runtime-speed behavior compatible.
5. Remove dead forwarding helpers after all call sites are migrated and the
   runtime-speed matrix remains neutral or better.

Risks:

- Lifecycle event order can regress without obvious type errors.
- Subgraph and recording behavior can differ even when outputs look correct.
- Fast scheduling and compatible scheduling can drift.

Verification:

```powershell
yarn workspace @valerypopoff/rivet2-core test
yarn workspace @valerypopoff/rivet2-node test
yarn workspace @valerypopoff/rivet2-cli test
yarn workspace @valerypopoff/rivet2-core run build
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

## 2. Editor UI Components Mix View, State, And Runtime Decisions

Evidence:

- `packages/app/src/components/NodeCanvas.tsx` is about 716 lines and imports
  graph state, executor state, project refs, context-menu state, UI stores,
  canvas interactions, and frozen-node state.
- `packages/app/src/components/GraphList.tsx` is about 833 lines and owns graph
  tree rendering, drag/drop, filtering, folder/menu actions, dialogs, and
  project operations.
- `packages/app/src/components/NavigationBar.tsx` is about 908 lines and mixes
  layout CSS, history, search, project state, resize behavior, and settings UI.
- Prior history already split several major editor surfaces, so the current
  problem is residual coupling inside still-active components.

Why this is dangerous:

- UI fixes can accidentally alter editor state or runtime mode gating.
- Repeated context-menu and selection rules are easy to implement
  inconsistently.
- Large components are hard to test without rendering the whole editor.

Target state:

- Large editor surfaces delegate to pure view-model builders and small
  presentation components.
- Mode gating rules are centralized and testable.
- Component files are short enough that future UI polish does not require
  reading unrelated editor behavior.

Plan:

1. Inventory existing editor domain modules and selectors first, especially
   graph-editing, execution status, workspace transition, and data rendering
   helpers.
2. Identify pure decision logic still embedded in large components:
   context-menu item eligibility, graph-tree sort/filter, folder active state,
   selection labels, resize/collapse thresholds, and frozen-output affordances.
3. Move each decision cluster into an existing owner where one fits, or into a
   feature-local model file with unit tests when no owner exists.
4. Split presentation pieces only where the extracted model makes the boundary
   obvious. Avoid component shims that only forward props.
5. Move repeated styling constants into feature-local style helpers or existing
   shared style modules. Do not invent a new design system.
6. Remove duplicated menu/status calculations after all callers use the shared
   model.

Risks:

- Focus handling and keyboard shortcuts can regress during component splitting.
- Context-menu behavior depends on subtle current-mode state.
- Over-splitting can make the tree harder to navigate instead of easier.

Verification:

```powershell
yarn workspace @valerypopoff/rivet-app test
yarn workspace @valerypopoff/rivet-app run build
node scripts\checks\check-file-tree.mjs
```

## 3. Code Execution Has A Broad And Duplicated Security Boundary

Evidence:

- Code-like nodes route through capability flags for `require`, `process`,
  `fetch`, `console`, `Rivet`, `inputs`, `graphInputs`, and `context`.
- The Node runner and app-executor runner both assemble dynamic execution
  contexts.
- `packages/app-executor/bin/codeRunnerWorkerHost.mts` embeds worker source and
  uses an eval worker.
- `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts` has both worker
  and current-thread execution paths.
- Recent runtime-speed work intentionally added shared Node invocation helpers,
  cached CodeRunner behavior, and runtime policy gates. Those seams must be
  preserved.

Why this is dangerous:

- Capability behavior can drift between the browser/internal executor and
  headless Node execution.
- Security-sensitive defaults are spread across node data, runner invocation,
  worker host code, and fallback paths.
- Future optimizations can accidentally widen access to process, require, or
  network APIs.

Target state:

- One documented capability policy describes exactly what each code-like node
  can request and where that capability is injected.
- Runner implementations share invocation construction and validation helpers.
- Worker fallback behavior is explicit, tested, and documented as a
  compatibility path rather than hidden complexity.

Plan:

1. Document the current capability matrix before changing structure, including
   which capability defaults differ by runner and why.
2. Inventory existing shared invocation helpers and runtime policy tests so the
   refactor extends current seams instead of duplicating them.
3. Add cross-runner tests that execute the same code snippets through Node and
   app-executor paths and compare outputs/errors.
4. Extract or reuse shared invocation construction only where both runners can
   preserve the same source URL, error enrichment, and capability behavior.
5. Isolate worker-host message serialization and error normalization into a
   small module with tests.
6. Keep the existing capability defaults unchanged, then delete duplicated code
   only after equivalence tests pass.

Risks:

- Error names, messages, and stacks are user-visible in recordings and endpoint
  failures.
- Worker and current-thread execution may intentionally differ in a few edge
  cases.
- Over-tightening capabilities would be a behavior change.

Verification:

```powershell
yarn workspace @valerypopoff/rivet2-core test
yarn workspace @valerypopoff/rivet2-node test
yarn workspace @valerypopoff/rivet-app-executor test
yarn workspace @valerypopoff/rivet-app run build
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

## 4. LLM Chat Vercel SDK Pipeline Still Has Broad Provider Seams

Evidence:

- `LLM Chat` is the recommended user-facing chat node for new graphs and keeps
  the compatibility node type `llmChatV2`.
- The active implementation is centered on
  `packages/core/src/model/nodes/LLMChatV2Node.ts` and
  `packages/core/src/model/chat-v2/*`.
- The Vercel SDK path already has good seams, including `aiSdkBridge.ts`,
  `chatV2Pipeline.ts`, `toolContinuation.ts`, `chatV2Errors.ts`,
  `chatV2RuntimeOptions.ts`, and provider-option helpers.
- The legacy `Chat` / `Chat Loop` path still uses `ChatNodeBase.ts`, but it is
  not the target for new maintainability investment.
- Related tests are large, including LLM Chat V2 and chat pipeline tests.
- The history already reduced chat/provider duplication; the remaining issue is
  making future LLM Chat provider work land in the Vercel SDK pipeline instead
  of improving only the legacy Chat path.

Why this is dangerous:

- LLM Chat owns a large feature surface: Vercel SDK provider options, tool
  continuation, structured outputs, retries, request-status outputs, reasoning,
  model catalog behavior, custom providers, and secret-safe cache keys.
- A refactor aimed at legacy `ChatNodeBase` can consume time without improving
  the node users should choose for new workflows.
- Fixes for one Vercel provider can miss equivalent behavior in another
  provider if provider-neutral contracts are not tested directly.
- Tests can become scenario dumps instead of focused LLM Chat provider-contract
  checks.

Target state:

- LLM Chat's Vercel SDK pipeline keeps a small set of clear owner modules for
  provider option resolution, request construction, stream consumption, tool
  continuation, structured-output handling, retries, and error normalization.
- Provider-specific behavior stays visible in the Vercel provider option/adaptor
  layer instead of spreading into the node shell or tests.
- Legacy `ChatNodeBase` remains compatibility-maintained only. Do not refactor
  it for polish unless the change directly unblocks or protects LLM Chat.
- Shared concerns are factored once in the LLM Chat path: message
  normalization, tool-call normalization, token/cost accounting, structured
  output parsing, request-status output mapping, and common error handling.

Functionality preservation contract:

- Keep `LLMChatV2Node.ts` as the thin shell for registration, IO definitions,
  body preview, editor lookup, runtime invocation, and editor-cache writeback.
- Keep persisted node type/data compatibility: internal type `llmChatV2`,
  existing data keys, existing port ids, and existing labels such as
  `maxTokens` as the persisted field/input id for `Max output tokens`.
- Preserve the ownership seams documented in `developer-docs/CORE-ENGINE.md`
  and `developer-docs/APP-ARCHITECTURE.md`: data defaults, editors, runtime
  options, editor cache, runtime coordinator, error normalization, retry,
  outputs, pipeline, tool continuation, response format, provider options,
  model catalog, and SDK bridge stay in their current owner modules unless a
  move has a clear narrower owner.
- Preserve credential behavior: configured-key versus input-port source,
  custom-provider env-var lookup through `settings.pluginEnv` then
  `process.env`, optional `API Key` scheduling with clear runtime failure when
  input mode has no key, and no raw API keys in previews, cache keys, logs, or
  errors.
- Preserve editor-only model catalog behavior, including no arbitrary custom
  provider discovery, input-key static resolution before refresh, no silent
  fallback to configured credentials in input-key mode, and visible option
  updates through the custom editor options cache.
- Preserve SDK request-shape semantics: optional Vercel arguments are omitted
  when Rivet has no value instead of passed as explicit `undefined`; empty
  provider-specific option objects are omitted; custom-provider JSON-schema
  response format writes the raw OpenAI-compatible `providerOptions.custom`
  override and wins over conflicting extra provider options.
- Preserve `Tool use` and structured output mutual exclusion in both app edits
  and runtime-created/API-created graphs.
- Preserve structured-output behavior: JSON/JSON schema can emit typed parsed
  values on `Response`, `All Messages` keeps assistant text, SDK parsed-output
  failures fall back to response text, duplicate structured JSON stream blocks
  are collapsed before partial outputs and fallback parsing, and invalid
  non-JSON-compatible response schemas fail locally.
- Preserve tool behavior: Vercel SDK tool conversion ignores the legacy Tool
  node `strict` flag, `Function Calls` remains provider-neutral `object[]`,
  missing function calls emit `control-flow-excluded` when the port exists,
  auto-continuation delegates only known Rivet function names, preserves
  already-delegated records, passes functions into every model round, and uses
  the same retry behavior on each round.
- Preserve output contracts: `Response`, `Messages Sent`, `All Messages`,
  `Response Tokens`, optional `Usage`, optional `Reasoning`, optional
  `Response Status` / `Response Error`, control-flow exclusions for absent
  optional outputs, retry scalar-versus-array output shapes, and provider
  failure behavior when request-status outputs are enabled.
- Preserve error behavior: provider/API/fetch errors are normalized with
  provider/model/endpoint/status guidance and recoverable status codes, unknown
  runtime errors and aborts remain diagnosable, and raw request bodies, headers,
  API keys, endpoint query-string secrets, prompts, and whole provider data
  objects are not dumped into user-facing errors.
- Preserve editor cache semantics: editor-only cache, project/node-scoped keys,
  secret and provider-option fingerprinting, stable serialization, cloned
  cached outputs on read/write, inactive custom/built-in URL fields ignored by
  cache identity, and no effect on public programmatic runs unless a caller
  deliberately supplies an editor cache.
- Preserve UI placement contracts documented in app architecture: model catalog
  one-line model row, provider-specific groups near provider/model selection,
  `Provider Advanced`, `Technical details`, `Stream response`, `Output
reasoning`, and `Output usage details` labels and grouping.
- Preserve legacy Chat behavior while keeping it out of scope. Compatibility
  fixes are allowed; polish/refactor work whose only benefit is
  `ChatNodeBase.ts`, `ChatNode.ts`, or `ChatLoopNode.ts` is not part of this
  phase.

Plan:

1. Audit the existing `chat-v2` helper modules before touching
   `ChatNodeBase`. Identify which LLM Chat behavior is already centralized and
   which duplicated behavior still lives in tests, the node shell, or provider
   option resolution.
2. Build an LLM Chat docs-to-code contract matrix from the current developer
   docs and source files listed above. Each behavior in the functionality
   preservation contract must be marked as already tested, needs focused test,
   or intentionally covered by a broader integration test.
3. Add missing provider-contract tests around LLM Chat outputs and
   request-shaping without live network calls. These tests should exercise the
   `chat-v2` pipeline and Vercel SDK bridge, not the legacy Chat node.
4. Only after contract tests exist, extract pure LLM Chat normalization helpers
   one at a time, starting with the smallest repeated seam that benefits the
   Vercel SDK path, such as tool-call accumulation, structured-output
   normalization, request-status mapping, or provider-option assembly.
5. Keep `LLMChatV2Node.ts` as a thin shell. Move behavior into the existing
   `chat-v2` owner modules before inventing a new abstraction.
6. Treat legacy `ChatNodeBase.ts`, `ChatNode.ts`, and `ChatLoopNode.ts` as
   compatibility surfaces. Touch them only for shared bug fixes, type cleanup,
   or docs alignment that preserves old behavior.
7. Delete duplicated LLM Chat helper code after provider-contract tests prove
   unchanged outputs.

Risks:

- Vercel provider APIs have intentional differences that should not be
  flattened.
- Legacy Chat and LLM Chat share user-facing concepts but not the same runtime
  pipeline; mixing them can produce a cleanup that helps the wrong node.
- Snapshot-like tests can become brittle if they capture too much payload.
- Cost/token accounting, request-status outputs, and secret redaction
  regressions are easy to miss without focused checks.

Verification:

```powershell
yarn workspace @valerypopoff/rivet2-core test
yarn workspace @valerypopoff/rivet2-node test
yarn workspace @valerypopoff/rivet2-core exec tsx --test test/model/nodes/LLMChatV2Node.test.ts test/model/chat-v2/*.test.ts
```

## 5. Repo Guardrails Are Still Too Report-Oriented

Evidence:

- `node scripts\checks\check-file-tree.mjs` reports 207 import-boundary review
  candidates, mostly long relative imports and app feature crossings.
- App and app-executor still alias some package imports directly to sibling
  `src/index.ts` entrypoints during builds.
- The repo uses targeted formatting checks because historical formatting drift
  makes repo-wide checks noisy.
- Searches show `as any`, `ts-ignore`, `ts-expect-error`, disabled lint rules,
  and user-doc TODOs spread through source, tests, and docs.

Why this is dangerous:

- Architectural boundaries can keep eroding because some checks only report.
- Formatting and type-safety exceptions become permanent without ownership.
- Deleted or moved docs/plans can leave broken maintenance scripts and indexes.

Target state:

- Repo guardrails are strict where the contract is settled and report-only only
  where active migration is underway.
- Dependency metadata, package boundaries, docs indexes, and plan files are
  checked consistently.
- Type escapes and lint disables are owned by a named migration or removed.

Plan:

1. Cross-check current guardrail output against previous package-boundary and
   file-tree refactors so solved areas are not reopened.
2. Classify the 207 import-boundary candidates into accepted, fix-now, and
   defer-with-owner groups.
3. Convert settled package-boundary rules from report-only to failing checks.
4. Add a small docs/index integrity check for root plans and developer-doc
   links before expanding the guardrail surface.
5. Replace repeated `as any` test setup with typed builders in the largest test
   files first.
6. Remove or resolve stale TODOs in developer and user docs as part of the
   relevant refactor phases.

Risks:

- Making checks strict too early can block unrelated work.
- Import cleanup can create thin barrel files that hide real dependencies.
- Formatting changes can swamp functional diffs if not isolated.

Verification:

```powershell
node scripts\checks\check-file-tree.mjs
yarn prettier:check
yarn workspace @valerypopoff/rivet2-core test
yarn workspace @valerypopoff/rivet-app test
git diff --check
```

## Recommended Implementation Order

## Phase 0 - Baseline And Safety Net

Status: NOT STARTED

Actions:

- Record current file-size, import-boundary, formatting, test, and build
  baselines.
- Summarize applicable `refactor-history.md` entries beside each chosen work
  item so implementation starts from the existing seam, not from an old mental
  model.
- Add missing characterization tests only where a planned extraction lacks
  coverage.
- Create a temporary refactor checklist with exact verification commands.

Exit criteria:

- Every risky phase has an agreed test command.
- Every phase explicitly says what prior refactor it is extending or avoiding.
- No production code has changed yet.

## Phase 1 - Runtime Core Extraction

Status: NOT STARTED

Actions:

- Start with one `GraphProcessor` policy that can be moved with minimal
  behavior risk.
- Keep public APIs compatible.
- Update `developer-docs/CORE-ENGINE.md` after each stable boundary emerges.

Exit criteria:

- `GraphProcessor.ts` has fewer direct responsibilities.
- Core and node package tests pass.
- Runtime-speed rows touched by the change are neutral or better.

## Phase 2 - Code Runner Boundary Cleanup

Status: NOT STARTED

Actions:

- Document the capability matrix.
- Reuse or extend existing invocation construction and error normalization
  seams between runners.
- Add cross-runner equivalence tests.

Exit criteria:

- No capability behavior changes.
- Duplicate runner setup code is reduced.
- Runtime policy behavior remains compatible with the documented default-safe,
  compatible, and explicit fast paths.

## Phase 3 - Editor UI Decomposition

Status: NOT STARTED

Actions:

- Extract pure models from `NodeCanvas`, `GraphList`, and `NavigationBar`.
- Split presentation only after model extraction proves a clean boundary.
- Update `developer-docs/APP-ARCHITECTURE.md`.

Exit criteria:

- Component files are smaller and easier to test.
- Keyboard, focus, selection, context-menu, and resize tests remain green.

## Phase 4 - LLM Chat Vercel Pipeline Consolidation

Status: NOT STARTED

Actions:

- Build the LLM Chat Vercel provider capability matrix.
- Build the LLM Chat docs-to-code contract matrix before moving code.
- Extract shared LLM Chat normalization helpers behind tests.
- Keep provider-specific quirks visible in `chat-v2` provider-option/adaptor
  modules.
- Avoid spending refactor effort on legacy `ChatNodeBase` except for
  compatibility-maintenance work.

Exit criteria:

- Duplicated LLM Chat provider/pipeline logic is reduced.
- LLM Chat provider contract tests prove unchanged normalized outputs.
- The docs-to-code matrix shows every preserved behavior is tested or
  explicitly covered by an existing broader test.
- Legacy Chat behavior remains unchanged.

## Phase 5 - Guardrails, Tests, And Docs

Status: NOT STARTED

Actions:

- Promote settled architecture checks from report-only to failing.
- Add docs/index integrity checks.
- Reduce test `any` casts with typed builders.
- Resolve stale docs TODOs touched by the refactor.

Exit criteria:

- Maintenance scripts match the actual repo tree.
- Docs and developer guides point to current ownership and checks.

## Final Verification Matrix

Run at the end of each major phase, expanding as needed:

```powershell
node scripts\checks\check-file-tree.mjs
yarn prettier:check
yarn workspace @valerypopoff/rivet2-core test
yarn workspace @valerypopoff/rivet2-node test
yarn workspace @valerypopoff/rivet-app test
yarn workspace @valerypopoff/rivet-app run build
yarn workspace @valerypopoff/rivet2-cli test
git diff --check
```

## Definition Of Done

- The five problem areas have explicit owners in code and docs.
- Large files were reduced by extracting real responsibilities, not by creating
  empty forwarding layers.
- Public behavior and project serialization are unchanged.
- Developer docs describe the new ownership boundaries.
- Guardrails catch the same class of drift that made the refactor necessary.
