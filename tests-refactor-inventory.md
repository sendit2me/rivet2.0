# Tests Refactor Inventory

Phase 0 ownership map for [tests-refactor.md](./tests-refactor.md).

Snapshot date: 2026-05-21. Counts were refreshed after Phase 6.

This is intentionally a working inventory, not a permanent catalog of every assertion. It classifies the current test suite by owner, identifies the cleanup queues that should drive the next phases, and avoids marking tests for deletion until an owner-level replacement is verified.

## Suite Summary

| Package                 | Files | Approx lines | Primary purpose                                                                                    | Default decision                                                      |
| ----------------------- | ----: | -----------: | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/app`          |   153 |       20,253 | Editor/app behavior, graph editing, output surfaces, state, transport, UI policy helpers.          | Keep, simplify largest clusters, replace brittle source-shape guards. |
| `packages/core`         |    58 |       13,900 | Graph execution, built-in nodes, Chat v2, recording, serialization, utility behavior.              | Keep, split monster mixed-owner files, dedupe overlap.                |
| `packages/node`         |     8 |        2,927 | Programmatic runtime APIs, default-fast compatibility, remote debugger, graph runner, code runner. | Keep, split broad compatibility files only after helper reuse exists. |
| `packages/app-executor` |     3 |          745 | Desktop/hosted Node sidecar worker, code-runner require/config behavior.                           | Keep; covered by root `yarn test`.                                    |
| `packages/cli`          |     1 |           66 | CLI smoke behavior.                                                                                | Keep as small smoke coverage.                                         |

## Owner Map

This table covers the full test suite by owner bucket. File counts and line counts are approximate and generated from the current checkout.

| Owner bucket                        | Files | Approx lines | Path scope                                                                                                                                              | Purpose                                                                                              | Decision                                                                        |
| ----------------------------------- | ----: | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| app canvas interaction models       |     9 |          914 | `packages/app/src/components/nodeCanvas/*.test.ts`                                                                                                      | Canvas drag, context-menu, wire candidate, overlay, selection, and toolbar policy.                   | Keep; use as replacement target for JSX/source guards.                          |
| app commands                        |     5 |          961 | `packages/app/src/commands/*.test.ts`                                                                                                                   | Command merge behavior, node edits, undo/redo, connection recovery integration.                      | Shared graph-editing builders landed; split command concerns in Phase 3.        |
| app component/layout guardrails     |    18 |          729 | `packages/app/src/components/*.test.ts`                                                                                                                 | UI layout, static style, shortcut, and component-specific guardrails.                                | Review first; many source-shape tests should become helper tests or be deleted. |
| app DataValue rendering             |     6 |          343 | `packages/app/src/components/renderDataValue/*.test.ts`                                                                                                 | DataValue display, preview, chunking, render-type policy.                                            | Keep; use as behavior owner for output wrapping/display cleanup.                |
| app editor controls                 |     7 |          517 | `packages/app/src/components/editors/**/*.test.ts`                                                                                                      | Node settings editor controls, escape behavior, stats, custom editors.                               | Keep; simplify only local duplication.                                          |
| app node editor/prompt designer     |     2 |           88 | `packages/app/src/components/nodeEditor/*.test.ts`, `packages/app/src/components/promptDesigner/*.test.ts`                                              | Node editor width persistence and prompt designer validation.                                        | Keep; these are focused owner tests.                                            |
| app executor/remote transport hooks |    14 |        2,844 | `packages/app/src/hooks/executorSession*.test.ts`, `remoteExecutor*.test.ts`, `executorSidecarRuntime.test.ts`, `useExecutorSessionCoordinator.test.ts` | Executor sessions, websocket lifecycle, uploads, run requests, sidecar/runtime coordination.         | Executor session runtime split is done; keep remaining focused tests.           |
| app file IO                         |     1 |          502 | `packages/app/src/io/browserFileInput.test.ts`                                                                                                          | Browser file load/save edge behavior.                                                                | Keep; review line count for table-driving only.                                 |
| app graph editing domain            |    15 |        3,416 | `packages/app/src/domain/graphEditing/*.test.ts`                                                                                                        | Pure graph editing policies, rename propagation, connection validation/recovery, graph list actions. | Keep; shared builders now cover common graph/project fixtures.                  |
| app graph list UI models            |     3 |          365 | `packages/app/src/components/graphList/*.test.ts`                                                                                                       | Graph tree presentation and context-menu models.                                                     | Keep; use as behavior owner for graph-tree source guards.                       |
| app hooks                           |     7 |        1,256 | Other `packages/app/src/hooks/*.test.ts`                                                                                                                | Graph search, canvas visibility, context menu, graph execution events, AI helper behavior.           | Keep; review only large `graphSearch.test.ts`.                                  |
| app host/static contracts           |     1 |           98 | `packages/app/src/hostStyleEntrypoint.test.ts`                                                                                                          | Hosted/standalone style entrypoint contract.                                                         | Keep temporarily; source-shape guard with no render-free replacement yet.       |
| app Monaco utilities                |     1 |           61 | `packages/app/src/utils/monaco/*.test.ts`                                                                                                               | Monaco interpolation diagnostic suppression.                                                         | Keep.                                                                           |
| app node output surface             |     5 |          510 | `packages/app/src/components/nodeOutput/*.test.ts`                                                                                                      | Output visibility, view-model, split entries, search, preview mode.                                  | Keep; behavior owner for output-source cleanup.                                 |
| app node-specific output previews   |     6 |          417 | `packages/app/src/components/nodes/*.test.ts`                                                                                                           | Code/Expression/JS-list/extract preview source and parsed output helpers.                            | Keep; dedupe with output view-model only if overlap is exact.                   |
| app platform utilities              |     3 |          163 | `packages/app/src/utils/platform/*.test.ts`                                                                                                             | Path, updater, window abstractions.                                                                  | Keep.                                                                           |
| app state/selectors/storage         |     7 |        1,112 | `packages/app/src/state/**/*.test.ts`                                                                                                                   | Jotai state, storage, selectors, user input actions.                                                 | Keep; review `executionSelectors.test.ts` for split if needed.                  |
| app utilities/data policies         |    43 |        5,957 | `packages/app/src/utils/*.test.ts`                                                                                                                      | Execution data, copy policy, graph reachability, project/workspace utilities, plugin usage, sizing.  | Keep; split/dedupe execution-data cluster after owner map is stable.            |
| app-executor sidecar                |     3 |          745 | `packages/app-executor/bin/*.test.mts`                                                                                                                  | Worker code runner, require root, executor config.                                                   | Keep; covered by root `yarn test`.                                              |
| cli                                 |     1 |           66 | `packages/cli/test/*.test.ts`                                                                                                                           | CLI smoke.                                                                                           | Keep.                                                                           |
| core built-in nodes                 |    31 |        7,264 | `packages/core/test/model/nodes/*.test.ts`                                                                                                              | Built-in node runtime/editor behavior.                                                               | Keep; split `LLMChatV2Node` and table-drive repeated node cases.                |
| core Chat v2 runtime                |     7 |        2,478 | `packages/core/test/model/chat-v2/*.test.ts`                                                                                                            | Chat v2 pipeline, outputs, errors, response format, provider options, tool continuation.             | Keep; split `chatV2Pipeline.test.ts` and remove overlap with focused owners.    |
| core execution model helpers        |     6 |          505 | Other `packages/core/test/model/*.test.ts`                                                                                                              | Registry assembly, cycle/preprocess, node exclusion, loop policy, folding definitions.               | Keep; source-read folding guard has been replaced by runtime editor assertions. |
| core GraphProcessor                 |     2 |        1,962 | `GraphProcessor.test.ts`, `GraphProcessor.characterization.test.ts`                                                                                     | Execution and refactor characterization.                                                             | Keep; reduce duplication only after owner helper tests exist.                   |
| core legacy chat helpers            |     4 |          575 | `packages/core/test/model/chat/*.test.ts`                                                                                                               | Legacy chat conversion/streaming/cost helpers.                                                       | Keep unless legacy support is explicitly retired.                               |
| core plugin nodes                   |     1 |           18 | `packages/core/test/plugins/**/*.test.ts`                                                                                                               | Plugin node smoke.                                                                                   | Keep.                                                                           |
| core public API helpers             |     1 |           59 | `packages/core/test/api/*.test.ts`                                                                                                                      | Process settings/default resolution.                                                                 | Keep.                                                                           |
| core recording                      |     1 |          229 | `packages/core/test/recording/*.test.ts`                                                                                                                | ExecutionRecorder serialization/replay parity.                                                       | Keep.                                                                           |
| core utilities                      |     5 |          810 | `packages/core/test/utils/*.test.ts`                                                                                                                    | Serialization, interpolation, runtime logging, stream parsing, stable port IDs.                      | Keep; review serialization file only for local split if it grows.               |
| node runtime/public APIs            |     8 |        2,927 | `packages/node/test/*.test.ts`                                                                                                                          | `createProcessor`, `runGraph`, graph runner, runtime profiles, debugger, code runner.                | Keep; split broad compatibility only after shared assertions are extracted.     |

## Immediate Cleanup Queues

### Source-Shape Guardrails

This is the Phase 1 source-shape queue. Active entries still read production source text directly; entries marked replaced or simplified record the cleanup result so future passes do not re-open already migrated coverage.

| File                                                                 | Owner                           | Decision          | Replacement direction                                                                        |
| -------------------------------------------------------------------- | ------------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `packages/app/src/hostStyleEntrypoint.test.ts`                       | app host/static contracts       | Keep temporarily. | Keep until hosted/standalone style import contract has a better render/static analyzer seam. |
| `packages/app/src/components/actionBarRunButtons.test.ts`            | app component/layout guardrails | Replaced.         | Now uses the ActionBar run-button view model for labels/variants/visibility.                 |
| `packages/app/src/components/commentNodeHeaderControls.test.ts`      | app component/layout guardrails | Replace/simplify. | Move hover/drag/header-control visibility policy into a helper if still needed.              |
| `packages/app/src/components/fullscreenOutputModalPlacement.test.ts` | app component/layout guardrails | Replace/simplify. | Prefer a modal bounds/placement helper test.                                                 |
| `packages/app/src/components/GraphListLayout.test.ts`                | app component/layout guardrails | Simplified.       | Retains layout/static CSS guard only; helper tests own context menu and folder policy.       |
| `packages/app/src/components/NavigationBarGraphHistory.test.ts`      | app component/layout guardrails | Replace/simplify. | Extract graph-history button state/shortcut labels if not already available.                 |
| `packages/app/src/components/NavigationBarGraphSearch.test.ts`       | app component/layout guardrails | Partly replaced.  | Search stats formatting moved to graph-search helpers; mini-node color guard remains.        |
| `packages/app/src/components/nodeBodyPreviewLayout.test.ts`          | app component/layout guardrails | Replace/simplify. | Prefer node body preview layout/view-model helpers.                                          |
| `packages/app/src/components/NodeEditorMetadataLayout.test.ts`       | app component/layout guardrails | Replace/simplify. | Keep field spacing/metadata order in editor helper tests when possible.                      |
| `packages/app/src/components/nodeHeaderDescriptionStyles.test.ts`    | app component/layout guardrails | Keep or replace.  | Keep one style guard unless typography class/token can be tested through a helper.           |
| `packages/app/src/components/nodeOutputDragPreview.test.ts`          | app component/layout guardrails | Replace/simplify. | Use node-output preview mode and canvas hover/drag helpers.                                  |
| `packages/app/src/components/nodeOutputWrapping.test.ts`             | app component/layout guardrails | Replace/simplify. | Move wrapping policy to render-data-value/output view-model tests.                           |
| `packages/app/src/components/ProjectSelector.test.ts`                | app component/layout guardrails | Replace/simplify. | Extract sidebar toggle label/icon state if the exact SVG shape is still a contract.          |
| `packages/app/src/components/ScalableToggle.test.ts`                 | app component/layout guardrails | Keep small.       | Source guard is acceptable while SVG mark shape is inline and no render test exists.         |
| `packages/app/src/components/settingsModalLayout.test.ts`            | app component/layout guardrails | Replace/simplify. | Prefer modal layout constants/helpers for scroll ownership.                                  |
| `packages/app/src/components/wireLayerLayout.test.ts`                | app component/layout guardrails | Replace/simplify. | Test wire-layer layout policy through geometry/helper seams if available.                    |
| `packages/core/test/model/nodeEditorFoldingDefinitions.test.ts`      | core execution model helpers    | Replaced.         | Uses runtime `getEditors()` output; no core source-read guard remains.                       |

### Large Mixed-Ownership Files

These are the first split/simplification targets after source-shape cleanup.

| File                                                                      | Lines | Decision              | First action                                                                                                         |
| ------------------------------------------------------------------------- | ----: | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/core/test/model/nodes/LLMChatV2Node.test.ts`                    | 1,500 | Split.                | Move tests into defaults/editors/runtime-config/cache-key/provider-options groups without changing assertions first. |
| `packages/core/test/model/GraphProcessor.test.ts`                         | 1,277 | Keep, then trim.      | Move pure policy cases only when focused owner tests already exist.                                                  |
| `packages/core/test/model/chat-v2/chatV2Pipeline.test.ts`                 | 1,251 | Split and dedupe.     | Request-shaping overlap was deduped; split stream adapter, retry/status, provider failure, and output assembly next. |
| `packages/node/test/defaultFastCompatibility.test.ts`                     | 1,038 | Keep, then split.     | Extract shared compatibility assertions before splitting observable surfaces.                                        |
| `packages/app/src/domain/graphEditing/editNodeConnectionRecovery.test.ts` |   980 | Simplify.             | Table-drive repeated interpolation recovery scenarios.                                                               |
| `packages/app/src/commands/editNodeCommand*.test.ts`                      |   914 | Split.                | Command recovery, graph input rename, graph output rename, and merge-policy tests now live in focused files.         |
| `packages/app/src/utils/executionDataStorage.test.ts`                     |   772 | Split or table-drive. | Separate readers/writers/process selection if duplicated setup stays high.                                           |
| `packages/core/test/model/nodes/HttpCallNode.*.test.ts`                   |   722 | Split.                | Editor, response output, retry policy, and failure-output ownership now live in focused files with local test utils. |
| `packages/core/test/model/GraphProcessor.characterization.test.ts`        |   685 | Keep.                 | Preserve as safety net; only trim local helper duplication.                                                          |
| `packages/app-executor/bin/AppExecutorWorkerCodeRunner.test.mts`          |   680 | Keep.                 | Worker/code-runner setup stays together unless splitting proves neutral.                                             |

### Fixture Duplication Clusters

| Cluster                            | Files                                                                                                                                                                                                     | Decision             | Replacement                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app graph/project/node builders    | `editNodeCommand.test.ts`, `editNodeConnectionRecovery.test.ts`, `graphInputRenamePropagation.test.ts`, `graphOutputRenamePropagation.test.ts`, `graphInputUsage.test.ts`, `connectionValidation.test.ts` | Centralized.         | `packages/app/src/domain/graphEditing/testGraphBuilders.ts` now owns common fresh node/graph/project builders; local wrappers remain only for scenario-specific defaults. |
| node runtime speed fixtures        | `runtimeSpeedFixtures.ts`, `runtimeSpeedEquivalence.test.ts`, `defaultFastCompatibility.test.ts`, `graphRunner.test.ts`, `api.test.ts`                                                                    | Keep centralized.    | Reuse existing runtime-speed fixture owner; do not copy into app/core tests.                                                                                              |
| executor session fake socket setup | `executorSession*.test.ts`, `useExecutorSessionCoordinator.test.ts`                                                                                                                                       | Simplify cautiously. | Share only fake socket/request helpers that are already repeated.                                                                                                         |
| Chat v2 mock stream/provider setup | `chatV2Pipeline.test.ts`, `toolContinuation.test.ts`, `LLMChatV2Node.test.ts`                                                                                                                             | Dedupe after split.  | Create local `chat-v2` test helpers only for repeated stream/provider scaffolding.                                                                                        |

## Phase 0 Decisions

- No test file is marked for immediate deletion yet. Phase 0 found cleanup targets, but deletion needs owner-level replacement checks in later phases.
- The highest-confidence first implementation slice is the source-shape guardrail queue, because it is small, brittle, and mostly covered by newer helper/view-model tests.
- The highest-payoff structural slice is app graph-editing builder consolidation, because several large tests repeat the same project/graph/node setup.
- The highest-risk slice is GraphProcessor/default-fast compatibility cleanup; preserve those tests until smaller owner-level assertions have already absorbed duplicate details.

## Phase 1 Decisions

- Source-reading test files were reduced from 17 to 15.
- The app retained 15 source-reading guardrails because they protect visual/static CSS contracts that do not yet have a render-free owner seam.
- The core source-reading guard was removed entirely by asserting the runtime editor definitions directly.
- ActionBar and graph-search assertions moved to helper-owned behavior tests.
- GraphList source coverage was narrowed to layout-only checks; helper tests now carry more of the folder/drop-target behavior.
- The touched source-shape test files dropped by a net 33 lines; replacement helper tests added 53 focused behavior lines, leaving the touched test set at a net 20-line increase.

## Phase 2 Decisions

- Common app graph-editing builders now live in `packages/app/src/domain/graphEditing/testGraphBuilders.ts`.
- The first migration covered the six largest repeated-builder consumers: edit-node command, edit-node connection recovery, graph input/output rename propagation, graph input usage, and subgraph connection validation.
- Scenario-specific wrappers remain local where a test needs custom graph names, caller labels, or subgraph input/output port defaults.
- After formatting, migrated test files dropped by 351 net lines. The shared builder module is now 160 lines after later helper additions, so this still saves about 191 app test/support lines.

## Phase 3 Decisions

- `editNodeCommand.test.ts`, `executorSession.test.ts`, and `HttpCallNode.test.ts` were split because their ownership boundaries were clear and the split could be mechanical.
- Existing narrower owner files, such as `executorSessionPendingExecutions.test.ts`, were preserved instead of overwritten; runtime-level pending execution tests use `executorSessionRuntimePendingExecutions.test.ts`.
- Chat v2, GraphProcessor, and default-fast compatibility suites remain intentionally broad until the Phase 4 overlap audit identifies smaller owner-level replacements.
- The three splits increased touched test/support code by 109 lines, trading a small line-count increase for clearer ownership and easier future review.

## Phase 4 Decisions

- Chat v2 request-shaping assertions were the first high-confidence overlap target. Detailed forwarding coverage now lives in the `streamChatV2` owner test, while `runChatV2Pipeline` keeps one composed-path wiring smoke.
- `chatV2Pipeline.test.ts` dropped from 1,226 to 1,143 lines, saving 83 core test lines without changing production behavior.
- Output copy/rendering, graph editing, and default-fast/runtime-speed overlaps were kept because they protect different observable contracts rather than exact duplicates.

## Phase 5 Decisions

- Root `yarn test` now includes app-executor coverage through explicit focused scripts for core, node, app, app-executor, and cli.
- `yarn test:all` remains an alias, and `yarn test:docs` exists as a separate non-emitting docs typecheck target.
- The develop build workflow now runs `yarn test:docs` after `yarn test` so docs validation is visible without mixing it into the runtime/package test command.

## Phase 6 Decisions

- `yarn test:style` runs a repository-level guardrail script that fails on focused tests in tracked and untracked non-ignored test files.
- Source-reading tests are reported but not blocked because the remaining source-shape guards are known temporary coverage.
- Skipped tests are reported but not blocked so temporary skips remain visible without making the cleanup gate too strict.
- The develop build workflow runs `yarn test:style` after docs typecheck and before lint.
