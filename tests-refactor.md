# Tests Refactor Plan

## Goal

Make Rivet's tests leaner, clearer, and more maintainable without weakening the behavior guarantees that keep graph execution, editor workflows, remote execution, recordings, output rendering, and packaging safe.

This is a test-quality refactor plan, not a functionality refactor. Production code changes should happen only when they make existing behavior testable through a cleaner public or internal seam.

## Current Inventory

Snapshot from the current checkout on 2026-05-21:

| Area                    | Test files | Approx test lines | Main script                                                |
| ----------------------- | ---------: | ----------------: | ---------------------------------------------------------- |
| `packages/app`          |        146 |            18,093 | `yarn workspace @valerypopoff/rivet-app run test`          |
| `packages/core`         |         55 |            12,477 | `yarn workspace @valerypopoff/rivet2-core run test`        |
| `packages/node`         |          8 |             2,603 | `yarn workspace @valerypopoff/rivet2-node run test`        |
| `packages/app-executor` |          3 |               662 | `yarn workspace @valerypopoff/rivet-app-executor run test` |
| `packages/cli`          |          1 |                55 | `yarn workspace @valerypopoff/rivet2-cli run test`         |

There are about 1,586 declared `test(...)` / `it(...)` / `describe(...)` entries across the suite.

Important inventory notes:

- Root `yarn test` currently runs core, node, app, and cli tests, but not app-executor tests.
- CI uses `.github/workflows/build.yml`, which runs `yarn build`, `yarn test`, `yarn lint`, and `yarn prettier --check` on `develop` pushes and PRs.
- `packages/docs` has a `typecheck` script but no test script.
- `packages/core/src/model/NodeBodySpec.ts` and `PluginLoadSpec.ts` are source files, not tests, despite the `Spec` suffix.
- 16 app tests and 1 core test read production source files directly with `readFileSync`. These are useful as temporary guardrails, but many are brittle string-shape tests rather than behavior tests.
- 37 test files use `readFileSync` or broad `assert.match` / `assert.doesNotMatch` assertions. Some are legitimate parser or error-message checks; the cleanup target is source-code-shape assertions, not all regex assertions.
- Node package tests have a `pretest` that rebuilds core ESM output. Focused node runtime checks should either run the package `test` script when the full node suite is acceptable, or explicitly build core ESM before direct `tsx --test` runs.

Largest current test files:

| File                                                                      | Approx lines | Cleanup angle                                                                                     |
| ------------------------------------------------------------------------- | -----------: | ------------------------------------------------------------------------------------------------- |
| `packages/core/test/model/nodes/LLMChatV2Node.test.ts`                    |        1,383 | Split node metadata/editor/runtime-config/cache-key concerns.                                     |
| `packages/core/test/model/chat-v2/chatV2Pipeline.test.ts`                 |        1,226 | Split stream adapter, retry/status, output assembly, provider-failure concerns.                   |
| `packages/core/test/model/GraphProcessor.test.ts`                         |        1,135 | Keep behavior coverage, but move policy-only cases to focused helper tests where owners exist.    |
| `packages/node/test/defaultFastCompatibility.test.ts`                     |          954 | Keep compatibility coverage, split by observable surface and reduce repeated fixture boilerplate. |
| `packages/app/src/commands/editNodeCommand.test.ts`                       |          936 | Split command merge, interpolation recovery integration, graph input/output rename snapshots.     |
| `packages/app/src/domain/graphEditing/editNodeConnectionRecovery.test.ts` |          911 | Table-drive duplicated interpolation recovery scenarios.                                          |
| `packages/app/src/hooks/executorSession.test.ts`                          |          737 | Split transport lifecycle, pending requests, state derivation, and websocket edge cases.          |
| `packages/core/test/model/nodes/HttpCallNode.test.ts`                     |          702 | Split request construction, response handling, retry/failure policy.                              |
| `packages/app/src/utils/executionDataStorage.test.ts`                     |          698 | Split storage readers/writers/process selection or consolidate repetitive fixture assertions.     |
| `packages/core/test/model/GraphProcessor.characterization.test.ts`        |          615 | Preserve as a high-value refactor safety net; reduce only local duplication.                      |

## Quality Bar

Every retained test should satisfy at least one of these purposes:

- Pins public runtime behavior or app-visible behavior.
- Protects a compatibility surface used by wrappers, published packages, recordings, or remote debugger sessions.
- Covers a tricky regression that is hard to notice manually.
- Guards a pure policy helper that would otherwise be easy to break.
- Characterizes a high-risk area before or during a refactor.

Tests should usually be deleted or rewritten when they only:

- Assert exact source-code strings for implementation that has a cleaner testable seam.
- Duplicate the same behavior already covered closer to the owner module.
- Assert incidental styling/string layout without being tied to an explicit product contract.
- Preserve obsolete migration behavior after the migration path has been retired and documented as unsupported.
- Require large setup just to assert one small branch that can be tested through a pure helper.

## Non-Goals

- Do not reduce confidence just to reduce line count.
- Do not replace focused unit tests with only broad integration tests.
- Do not remove `GraphProcessor.characterization`, runtime-speed equivalence, recording, remote debugger, or default-fast compatibility coverage without a direct replacement.
- Do not introduce a browser/UI test framework in this pass unless a phase explicitly proves the payoff is worth the tooling cost.
- Do not change runtime semantics, graph schema, editor behavior, output semantics, or public APIs as part of test cleanup.

## Phase 0: Build A Test Ownership Map (DONE)

### What To Change

Create a lightweight inventory that classifies the test suite by owner and purpose, with individual file paths for files that need concrete cleanup decisions:

- core execution engine
- built-in node behavior
- Chat v2 provider/runtime behavior
- Node public API and runtime profiles
- app graph editing/domain policies
- app output rendering/data storage
- app executor/worker transport
- packaging/build/static contracts
- source-shape guardrails

Recommended artifact:

- Phase 0 is implemented in [tests-refactor-inventory.md](./tests-refactor-inventory.md). It uses a companion file because a useful ownership map needs more detail than belongs in the main plan.
- Cover every test file through owner buckets, and list individual file paths only for files queued for concrete action. This keeps the inventory useful without turning it into a 213-row maintenance burden.

### Why

The current suite grew feature-by-feature. A refactor should not start by deleting files; it should first identify which behavior each file protects and where the real owner is.

### How

Use these searches as the starting checklist:

```powershell
Get-ChildItem -Path packages -Recurse -File | Where-Object { $_.Name -match 'test\.(ts|tsx|mts|js|mjs)$' }
rg -n "readFileSync|assert\.match|assert\.doesNotMatch" packages -g "*test.*"
rg -n "test\.skip|it\.skip|describe\.skip|test\.only|it\.only|describe\.only" packages -g "*test.*"
```

Then audit the largest files first, because they are the likeliest to contain mixed ownership. Stop the inventory once it is sufficient to drive the next cleanup slice; do not block useful cleanup on cataloging every small file upfront.

### Result

Phase 0 produced a complete owner-bucket map covering all 213 current test files, plus the first cleanup queues:

- source-shape guardrails to review in Phase 1
- large mixed-owner files to split in Phase 3
- fixture duplication clusters for Phase 2
- high-risk compatibility suites that should be preserved until focused replacements exist

The inventory intentionally does not mark any test file for immediate deletion. It identifies cleanup targets and replacement directions; deletion decisions belong in the implementation slice that verifies the owner-level replacement.

### Risks

- Classification work can turn into documentation busywork. Keep each entry short and decision-oriented.
- A file may look duplicate but protect a different observable surface. Mark suspected duplicates as "verify before delete" until the paired owner test is inspected.
- Some brittle tests exist because no better seam exists yet. Do not delete them until either a better seam is introduced or the product contract is intentionally dropped.

## Phase 1: Replace Or Delete Brittle Source-Shape Tests (DONE)

### What To Change

Audit and reduce tests that read production `.tsx` / `.ts` source text directly, especially:

- `packages/app/src/components/GraphListLayout.test.ts`
- `packages/app/src/components/nodeBodyPreviewLayout.test.ts`
- `packages/app/src/components/nodeOutputDragPreview.test.ts`
- `packages/app/src/hostStyleEntrypoint.test.ts`
- `packages/app/src/components/NodeEditorMetadataLayout.test.ts`
- `packages/app/src/components/ProjectSelector.test.ts`
- `packages/app/src/components/fullscreenOutputModalPlacement.test.ts`
- `packages/app/src/components/commentNodeHeaderControls.test.ts`
- `packages/app/src/components/NavigationBarGraphHistory.test.ts`
- `packages/app/src/components/nodeOutputWrapping.test.ts`
- `packages/app/src/components/ScalableToggle.test.ts`
- `packages/app/src/components/settingsModalLayout.test.ts`
- `packages/app/src/components/NavigationBarGraphSearch.test.ts`
- `packages/app/src/components/nodeHeaderDescriptionStyles.test.ts`
- `packages/app/src/components/wireLayerLayout.test.ts`
- `packages/app/src/components/actionBarRunButtons.test.ts`
- `packages/core/test/model/nodeEditorFoldingDefinitions.test.ts`

For each file:

1. Identify the product contract it is trying to protect.
2. If the contract is already covered by a pure helper test, delete the source-shape assertion.
3. If the contract is real but buried inside JSX/CSS, extract only the decision into a small helper or constant and test that helper.
4. If the contract is purely visual and not testable without rendering, keep at most one source guard with a comment explaining why it exists.
5. Delete guards that only verify the exact implementation shape of a recent fix.

### Why

Source-string tests are cheap to add but expensive to maintain. They break during harmless refactors, encourage implementation coupling, and can create false confidence because matching a string does not prove the UI works.

### How

Good replacement targets:

- graph list row presentation helpers in `packages/app/src/components/graphList/`
- node output view-model helpers in `packages/app/src/components/nodeOutput/`
- canvas interaction models in `packages/app/src/components/nodeCanvas/`
- navigation/action-bar helper functions when labels, disabled states, and shortcut behavior are the real contract
- render-data-value utilities for wrapping/copy/display semantics
- exported core folding-definition data, if that can replace the core source-read guard without widening runtime API unnecessarily

Keep source-shape tests temporarily only for global CSS import/reset contracts where a render-free unit test cannot observe the behavior.

### Result

Phase 1 replaced the highest-confidence source-shape guards without weakening behavior coverage:

- `packages/core/test/model/nodeEditorFoldingDefinitions.test.ts` no longer parses source text. It now asserts real `getEditors()` output for built-in and plugin node editor folding behavior.
- `packages/app/src/components/actionBarRunButtons.test.ts` no longer reads `ActionBar.tsx`. The selected-graph secondary-run-button policy now lives in the ActionBar run-button view model and is tested there.
- `packages/app/src/hooks/graphSearch.ts` now owns graph-search summary formatting, with direct helper coverage in `graphSearch.test.ts`. The NavigationBar source guard no longer checks that formatting implementation.
- `packages/app/src/components/GraphListLayout.test.ts` was narrowed to layout/static CSS contracts only. Context-menu and folder drop-target behavior stay covered by graph-list helper tests.

Phase 1 reduced source-reading test files from 17 to 15: the app source-shape queue went from 16 files to 15, and the core source-shape queue went from 1 file to 0. The touched source-shape test files dropped by a net 33 lines; replacement owner-level helper tests added 53 focused behavior lines, leaving the touched test set at a net 20-line increase. The production changes are intentionally small: one ActionBar view-model field and one reusable graph-search formatting helper.

The remaining 15 source-reading app tests are intentionally retained as temporary visual/static guardrails. They should be removed or replaced only when a render-level test, CSS-token helper, or clearer owner seam can observe the same contract.

### Risks

- Removing visual guards can allow regressions that unit tests cannot see. Keep a short list of intentionally retained source guards until a real render/screenshot strategy exists.
- Extracting helpers just for tests can make production code worse. Only extract a helper when it names real policy, not when it merely mirrors JSX.
- CSS and layout bugs are often product-visible. Deleting layout guards should be paired with a clearer owner test or manual verification checklist.

## Phase 2: Centralize Small Graph And Project Test Builders (DONE)

### What To Change

Create small test-only builder modules for repeated graph/project/node fixtures:

- App graph editing/domain fixtures:
  - target: `packages/app/src/domain/graphEditing/testGraphBuilders.ts` or `packages/app/src/test/graphBuilders.ts`
  - consolidate repeated `makeProject`, `makeGraph`, `makeTextNode`, `makeGraphInput`, `makeGraphOutput`, `makeSubGraphNode`, `makeConnection`
  - primary consumers: `editNodeCommand.test.ts`, `editNodeConnectionRecovery.test.ts`, `graphInputRenamePropagation.test.ts`, `graphOutputRenamePropagation.test.ts`, `graphInputUsage.test.ts`, `connectionValidation.test.ts`
- Core execution fixtures:
  - target: extend `packages/core/test/testUtils.ts` only for truly shared process-context and graph-fixture helpers
  - keep node-specific fixtures local when they make the test more readable
- Node runtime fixtures:
  - keep `packages/node/test/runtimeSpeedFixtures.ts` as the owner of runtime-speed and compatibility fixture graphs
  - avoid copying those builders into core or app tests unless a public behavior needs the same graph shape

### Why

Many app graph-editing tests duplicate near-identical builders. Duplication makes tests longer and increases the chance that two tests accidentally model the same node differently.

### How

Builder design rules:

- Keep builders explicit and boring.
- Return real `ChartNode`, `NodeGraph`, and `Project` objects with minimal valid defaults.
- Accept small overrides rather than deep magic configuration.
- Keep IDs deterministic.
- Do not create broad "scenario factories" that hide the shape being tested.

After moving builders, delete local duplicates in the largest consumers first:

1. graph input/output rename tests
2. `editNodeCommand.test.ts`
3. `editNodeConnectionRecovery.test.ts`
4. `graphInputUsage.test.ts`
5. `connectionValidation.test.ts`

### Result

Phase 2 added the app graph-editing test builder module at
`packages/app/src/domain/graphEditing/testGraphBuilders.ts` and migrated the
largest repeated fixture users:

- `editNodeCommand.test.ts`
- `editNodeConnectionRecovery.test.ts`
- `graphInputRenamePropagation.test.ts`
- `graphOutputRenamePropagation.test.ts`
- `graphInputUsage.test.ts`
- `connectionValidation.test.ts`

The shared builders return fresh registry-created nodes, graphs, projects, and
connections. Tests that need special caller labels, graph names, or port defaults
keep thin local wrappers so the scenario remains visible.

Measured after formatting, the six migrated test files dropped by 351 net
lines. The new shared builder module added 137 lines, for a net reduction of
214 app test/support lines while preserving the same focused behavior coverage.
This phase removed or collapsed the repeated local graph/project/node fixture
implementations without changing production behavior.

### Risks

- Over-abstracted fixtures can make tests harder to read than local setup. Keep the builders small and allow local setup for unusual cases.
- Shared fixtures can accidentally couple unrelated tests. Avoid mutable singleton project/node objects; return fresh objects every time.
- Moving fixtures can create circular imports if helpers live too close to production modules. Put them in test-only files and import production code in one direction only.

## Phase 3: Split Monster Test Files By Ownership

### What To Change

Split very large mixed-owner test files into focused files with clear names.

Recommended splits:

- `packages/core/test/model/nodes/LLMChatV2Node.test.ts`
  - `LLMChatV2Node.defaults.test.ts`
  - `LLMChatV2Node.editors.test.ts`
  - `LLMChatV2Node.runtimeConfig.test.ts`
  - `LLMChatV2Node.cacheKey.test.ts`
  - `LLMChatV2Node.providerOptions.test.ts`
- `packages/core/test/model/chat-v2/chatV2Pipeline.test.ts`
  - stream adapter
  - retry/request-status policy
  - provider failure normalization
  - final output assembly
- `packages/core/test/model/GraphProcessor.test.ts`
  - keep end-to-end scheduling/event behavior here
  - move pure exclusion or planning policy checks to focused helper tests when an owner exists
- `packages/core/test/model/nodes/HttpCallNode.test.ts`
  - request construction
  - response body/header/status output
  - failure and retry policy
  - editor/input-definition behavior
- `packages/app/src/commands/editNodeCommand.test.ts`
  - command merge behavior
  - undo/redo external graph snapshots
  - interpolation recovery integration
  - graph input/output rename integration
- `packages/app/src/hooks/executorSession.test.ts`
  - websocket lifecycle
  - pending execution request resolution/rejection
  - derived session state
  - reconnect/stale event handling
- `packages/node/test/defaultFastCompatibility.test.ts`
  - eligible default-fast equivalence
  - error/abort equivalence
  - recorder/debugger compatibility fallback
  - project-reference loader behavior

### Why

Large mixed files are hard to review and invite duplicate coverage. Splitting by owner makes future changes faster because a failing test points to the right policy area.

### How

- Move tests without changing assertions first.
- After the split is green, table-drive repeated cases within each new file.
- Delete helper functions that become single-use after the split.
- Keep one compatibility or characterization file when the point is cross-surface parity.

### Risks

- Splitting can increase runtime if expensive setup is repeated. For app-executor worker tests, keep shared expensive setup in the same file unless splitting proves neutral.
- Test history can become harder to read in Git. Move tests in mechanical commits before simplifying their content.
- Cross-surface compatibility tests are intentionally broad. Do not over-split them until the shared fixture and assertion helpers are stable.

## Phase 4: De-Duplicate Overlapping Coverage

### What To Change

Audit behavior that is currently pinned in multiple places and keep the test closest to the owner.

High-value overlap checks:

- Chat v2:
  - `LLMChatV2Node.test.ts`
  - `chatV2Pipeline.test.ts`
  - `chatV2Outputs.test.ts`
  - `chatV2Errors.test.ts`
  - `providerOptions.test.ts`
  - `toolContinuation.test.ts`
- Output rendering/copy policy:
  - `executionDataCopyValue.test.ts`
  - `nodeOutputCopyValueProjectors.test.ts`
  - `nodeOutputViewModel.test.ts`
  - render-data-value tests
- Graph editing:
  - `editNodeCommand.test.ts`
  - `editNodeConnectionRecovery.test.ts`
  - graph input/output rename propagation tests
  - connection validation tests
- Runtime speed/default-fast:
  - `runtimeSpeedEquivalence.test.ts`
  - `defaultFastCompatibility.test.ts`
  - `graphRunner.test.ts`
  - `api.test.ts`
  - `GraphProcessor.characterization.test.ts`

Keep one owner-level unit test and one cross-surface integration/compatibility test only when both catch meaningfully different failures.

### Why

Duplicate assertions make the suite noisy and slow to update. They also create ambiguity about where behavior is really owned.

### How

For each overlap:

1. Identify the owner module.
2. Keep detailed edge-case coverage at the owner.
3. Keep one broad integration smoke for the composed path.
4. Remove duplicated edge assertions from the non-owner file.
5. If deleting an assertion feels risky, first prove the owner test fails when the production branch is intentionally broken locally.

### Risks

- Some apparent duplicates protect different contracts: public API, app replay, debugger events, and internal helper output may look similar but fail differently.
- Runtime speed tests double as compatibility gates. Do not delete them just because core tests already cover the same final output.
- Removing integration tests can hide wiring failures. Keep at least one wiring test per composed feature.

## Phase 5: Normalize Root Test Scripts And CI Coverage

### What To Change

Make the test command matrix honest and easy to run:

- Decide whether root `yarn test` should include `@valerypopoff/rivet-app-executor` tests.
- Add explicit focused scripts if helpful:
  - `test:core`
  - `test:node`
  - `test:app`
  - `test:app-executor`
  - `test:cli`
  - `test:docs`
- If docs typecheck/build is part of the normal pre-commit expectation, document it clearly rather than implying `yarn test` covers docs.
- Update `.github/workflows/build.yml` only after deciding the desired CI runtime/cost.
- Update `developer-docs/BUILD-AND-CI.md` to match the actual scripts exactly.
- While touching this area, reconcile stale build/test command references in developer docs against the live root `package.json`; do not preserve commands that no longer exist just because older docs mention them.

### Why

The current root `yarn test` omits app-executor tests even though app-executor has important worker/code-runner coverage. Developers need one accurate default command and clear focused commands.

### How

- First measure runtime of the current root test and app-executor test.
- If app-executor is stable and not too slow, include it in root `yarn test`.
- If it is too costly or flaky on CI, keep it as a named focused script and document when to run it.
- Do not add docs build to root `yarn test` unless CI cost is acceptable.
- Preserve the current root `test` / `test:all` names as aliases even if focused scripts are added, because CI and developer muscle memory already use them.

### Risks

- Adding app-executor tests to root CI may increase wall-clock time or expose platform-specific worker behavior.
- Renaming scripts can break developer habits and CI workflows. Keep existing script names as aliases when possible.
- Docs build/typecheck can pull in different failure modes than runtime tests. It may be better as a separate CI step.

## Phase 6: Add Test Style Guardrails

### What To Change

Document a small testing style guide in developer docs after the cleanup starts:

- Prefer behavior tests over source-text tests.
- Prefer table-driven edge cases when many inputs share the same setup.
- Keep fixtures local unless at least three nearby tests need the same builder.
- Keep characterization tests broad but few.
- Avoid asserting entire large objects when a minimal observable subset is enough.
- Avoid `as any` in tests unless the test is intentionally modeling malformed caller input.
- Do not use `.only`; skipped tests need a comment with a removal condition.
- Test names should describe behavior, not implementation.

Optional static guardrails:

- Add a simple script that fails on committed `.only`.
- Add a grep-based report for source-reading tests so they stay visible.

### Why

Without style rules, the suite will drift back toward source guards and copy-pasted fixtures after every UI fix.

### How

- Add the guide to `developer-docs/BUILD-AND-CI.md` or a dedicated `developer-docs/TESTING.md`.
- Link it from `developer-docs/OVERVIEW.md` if a new doc is created.
- Mention the allowed exceptions for source-reading tests.

### Risks

- Too many rules make tests slower to write. Keep the guide short and practical.
- Static guards can block legitimate exceptional tests. Start with reporting before failing if the signal is noisy.

## Implementation Rules

### What To Change

Implement the cleanup in small, reviewable slices instead of one giant suite rewrite.

Recommended order:

1. Source-shape app test cleanup for one UI area.
2. Shared app graph-editing test builders.
3. Graph input/output rename and edit-node command test dedupe.
4. Chat v2 large-file split.
5. GraphProcessor/HttpCall large-file split.
6. Executor session and app-executor test organization.
7. Root script/CI cleanup.
8. Developer testing guide.

Each slice should include:

- before/after file and line counts
- tests removed, rewritten, and retained
- reason each deleted test was safe to delete
- focused verification command
- broader verification command when the slice touches shared behavior

### Why

Test cleanup is easy to overdo. Thin slices keep behavior confidence high and make regressions easy to locate.

### Risks

- Many small commits can leave temporary duplication. Track remaining duplication in this plan after each slice.
- Repeated full-suite runs can be expensive. Use focused tests during a slice, then run full package/root tests before final cleanup commits.
- If source-shape tests are removed before helper tests are in place, visual regressions can slip through.

## Verification Matrix

Use this matrix while implementing the plan:

For focused direct checks, prefer the checked-in Yarn entrypoint:

```powershell
node .yarn/releases/yarn-4.6.0.cjs workspace <workspace-name> exec tsx --test <test-files>
```

| Change area                     | Focused check                                                                                                                                                  | Broader check                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Core node tests                 | `node .yarn/releases/yarn-4.6.0.cjs workspace @valerypopoff/rivet2-core exec tsx --test test/model/nodes/<file>.test.ts`                                       | `yarn workspace @valerypopoff/rivet2-core run test`        |
| Core processor tests            | direct `tsx --test` against the affected `GraphProcessor*.test.ts` file                                                                                        | core test + node runtime equivalence tests                 |
| Node runtime/default-fast tests | build core ESM, then run direct `tsx --test` from the node workspace against affected `test/*.test.ts`; use the package `test` script when the full suite fits | `yarn workspace @valerypopoff/rivet2-node run test`        |
| App graph editing tests         | direct `tsx --test` against affected app domain/command tests                                                                                                  | `yarn workspace @valerypopoff/rivet-app run test`          |
| App output rendering/copy tests | direct `tsx --test` against affected node-output/render-data-value/utils tests                                                                                 | app test + app lint                                        |
| App-executor tests              | direct `tsx --test` against the affected `bin/*.test.mts` file                                                                                                 | `yarn workspace @valerypopoff/rivet-app-executor run test` |
| Test script/CI changes          | dry-run scripts locally                                                                                                                                        | root `yarn test` + `yarn lint`                             |
| Docs/testing guide              | docs typecheck/build if available                                                                                                                              | root lint/test unaffected                                  |

Always run `git diff --check` before handing off a cleanup slice.

## Success Metrics

Track these numbers after each implemented slice:

- net test lines removed or moved
- source-reading test files reduced
- local duplicate fixture builders removed
- largest test file size before/after
- root/focused test runtime before/after when measurable
- number of deleted tests with an explicit replacement or deletion rationale

The target is not a specific line count. A successful cleanup makes the suite easier to understand, less brittle, and at least as strong at catching real regressions.
