# Rivet Refactor Plan - Next Phase

> This plan assumes the work in `refactor-done.md` is already complete.
> The goal of this phase is not to add features or change product behavior.
> The goal is to make the current behavior easier to understand, cheaper to change,
> and smaller in code size by removing accidental complexity and reducing duplicated logic.

## Principles

- Preserve current behavior and file formats.
- Prefer deletion and consolidation over adding new abstractions.
- Reduce the number of places that know the same workflow.
- Make runtime ownership explicit: one place starts things, one place stops things, one place translates data.
- Keep public package contracts stable unless there is a very strong reason to change them.
- Do not deepen Tauri-specific assumptions inside app-level business logic.
- Any refactor in `packages/app` should move toward a platform-neutral app core plus thin platform adapters, even if the web client itself is not implemented in this phase.
- Prefer naming that describes capability (`native shell`, `platform file access`, `executor transport`) rather than current implementation (`tauri`, `sidecar`) when the code can reasonably become cross-platform later.

---

## Tier 1: High-Value Simplifications

These are the best next refactors if the goal is maintainability and lower code volume without changing functionality.

---

### 1. Finish shrinking `GraphProcessor` into an orchestration layer - DONE

**Effort: M-L | Impact: High**

`packages/core/src/model/GraphProcessor.ts` is still one of the largest and most coupled files in the repo. The first refactor wave extracted some modules, but the remaining file still owns too many responsibilities at once:

- queue orchestration
- node scheduling
- control-flow exclusion
- node result bookkeeping
- subprocessor wiring
- event emission plumbing
- abort/pause/resume fan-out

**Refactor goal**

Make `GraphProcessor` primarily responsible for:

- owning execution state
- delegating scheduling/exclusion/subprocessor concerns
- exposing the public evented API

**Suggested steps**

1. Identify the remaining private method clusters in `GraphProcessor.ts` and group them into three buckets:
   - scheduling and dependency progression
   - control-flow exclusion / split-run / loop handling
   - subprocessor creation and event forwarding
   DONE
2. Extract a `NodeExecutionPlanner` module responsible for:
   - deciding when a node is runnable
   - computing dependency readiness
   - determining whether upstream failures/exclusions should block execution
   DONE
3. Extract a `SubprocessorBridge` module responsible for:
   - constructing subprocessors
   - wiring pause/resume/abort
   - wiring event forwarding from child to parent
   DONE
4. Replace repeated direct field access across these flows with a single `ExecutionState` object passed into helpers.
   DONE
5. Keep all public `GraphProcessor` methods and event names unchanged.
   DONE
6. After each extraction, delete now-unused private helpers instead of leaving wrappers behind.
   DONE

**Expected result**

- smaller `GraphProcessor.ts`
- fewer internal cross-method dependencies
- easier debugging of execution bugs
- less duplicate event/plumbing code

**Risks**

- Moving logic out of `GraphProcessor` can subtly alter ordering of events or queue timing.
- Shared mutable state may become harder to follow if extraction is done with too many thin wrappers.
- Subgraph behavior is high-risk because parent/child processor coordination is stateful.

---

### 2. Break up `ChatNodeBase` and remove provider-specific duplication - DONE

**Effort: L | Impact: High**

`packages/core/src/model/nodes/ChatNodeBase.ts` is still extremely large, and provider-specific chat nodes like Anthropic and Google retain substantial repeated logic around:

- token counting
- request shaping
- streaming updates
- response normalization
- tool/function handling
- cost accounting

This is one of the clearest remaining over-complexity hotspots in core.

**Refactor goal**

Split chat execution into composable stages so provider nodes mostly define provider-specific behavior rather than reimplementing the full pipeline.

**Suggested steps**

1. Identify the provider-agnostic phases currently embedded in `ChatNodeBase`:
   - prompt/message preparation
   - token accounting
   - streaming event handling
   - output normalization
   - cost extraction
   DONE
2. Extract these into focused helpers under a new `model/chat/` or `plugins/chat/` folder:
   - `prepareChatRequest.ts`
   - `countChatTokens.ts`
   - `streamChatResponse.ts`
   - `normalizeChatOutputs.ts`
   - `collectChatCost.ts`
   DONE
   Current extracted helpers:
   - `openAIChatRequest.ts`
   - `chatMessages.ts`
   - `tokenBudget.ts`
   - `streamChatResponse.ts`
   - `chatCost.ts`
   Remaining extraction is still open for the rest of token/accounting and output-normalization paths.
3. Move provider-specific mapping logic out of the base class and into provider adapters.
   DONE
4. Reduce `ChatNodeBase` to:
   - shared node/editor contract
   - orchestration of the extracted chat pipeline
   - hooks that provider nodes must implement
   DONE
5. Audit `ChatAnthropicNode.ts`, `ChatGoogleNode.ts`, and OpenAI-related nodes for repeated token-count and output-shaping logic; consolidate shared portions aggressively.
   DONE
   Consolidation included:
   - shared prompt-to-chat-message coercion now reused by OpenAI, Google, and Anthropic paths
   - shared token-budget clamping now reused by OpenAI, Google, and Anthropic paths
   - shared assistant output shaping is now reused in OpenAI, Google, and Anthropic paths
   - OpenAI streaming/non-streaming runtime and retry handling moved out of `ChatNodeBase`
6. Add focused tests for each extracted helper instead of only high-level node tests.
   DONE

**Expected result**

- significant code deletion across chat-related files
- lower risk when adding or fixing a provider
- less “copy a provider and tweak” duplication

**Risks**

- Chat nodes are behaviorally sensitive; small changes can affect streaming timing or output shape.
- Provider SDK quirks may not fit a shared abstraction cleanly if extraction is too generic.
- Token counting behavior must remain stable enough for existing cost / trimming logic.

---

### 3. Simplify execution connectivity into one explicit session manager - DONE

**Effort: M | Impact: High**

The recent fixes made `useExecutorSidecar` and `useRemoteDebugger` safer, but the overall app execution flow is still spread across:

- `useGraphExecutor`
- `useRemoteExecutor`
- `useRemoteDebugger`
- `useExecutorSidecar`
- UI components that read debugger state directly

The main remaining smell is that executor connectivity state still spans several hooks and a module-level promise bridge, while the current structure still assumes the desktop-internal sidecar is the center of the model.

**Refactor goal**

Replace the current spread-out lifecycle with one explicit executor-session layer whose API is transport-agnostic, while preserving the current internal-sidecar behavior.

**Suggested steps**

1. Introduce a single executor session module or hook that owns:
   - connection lifecycle
   - reconnect policy
   - request/response correlation
   - executor readiness state
   DONE
2. Inside that session layer, isolate the current desktop-only concerns behind a narrow transport adapter:
   - internal sidecar process startup/shutdown
   - websocket connection to `ws://localhost:21889/internal`
   - external remote debugger connection
   DONE
3. Move the module-level `graphExecutionPromise` bridge in `useRemoteExecutor.ts` into this session layer.
   DONE
4. Replace the current implicit “started/reconnecting/socket” coordination with explicit session states, for example:
   - `idle`
   - `starting`
   - `connecting`
   - `ready`
   - `reconnecting`
   - `errored`
   DONE
5. Keep the current UI behavior unchanged by adapting existing hooks/components to read the new session state.
   DONE
6. Remove duplicate direct `useRemoteDebugger()` consumers where a read-only selector or context would suffice.
   DONE
7. Keep the distinction between:
   - internal executor (`21889/internal`)
   - external remote debugger (`21888` default)
   - future browser-safe remote execution transport
   explicit in the new structure.
   DONE

**Expected result**

- less lifecycle drift across hooks
- easier reasoning about why the Run button is enabled/disabled
- fewer module-level hacks
- a cleaner seam for a future web client that cannot spawn a local sidecar

**Risks**

- The app currently mixes internal-executor and remote-debugger concepts in the same surface area.
- Reconnection behavior can regress if the session state machine is not carefully mapped to current behavior.
- Refactoring this without strong tests could reintroduce the sidecar/socket bugs that were just fixed.
- If the new session manager is designed around the internal sidecar instead of around executor transport in general, it will make the future web client harder, not easier.

---

### 4. Reduce project load/save/switch duplication into a single workspace flow - DONE

**Effort: M | Impact: High**

The app still has project orchestration spread across:

- `useLoadProject`
- `useLoadGraph`
- `useSaveProject`
- graph sync hooks
- Trivet/static-data/context persistence paths

The behavior is correct but still procedurally duplicated and easy to break.

**Refactor goal**

Create a single internal “workspace transition” layer that all project/graph switching and saving flows use.

**Suggested steps**

1. Map the existing operations into a small set of transition types:
   - load project
   - switch graph
   - save project
   - save current graph into project
   - close project
   DONE
2. Extract shared steps into reusable helpers:
   - cleanup atom families
   - sync current graph into project
   - reset read-only/historical state
   - restore viewport
   - load/save Trivet data
   - load/save project static data
   DONE
3. Build a `workspaceTransitions.ts` module that exposes these operations as explicit functions.
   DONE
4. Convert `useLoadProject`, `useLoadGraph`, and `useSaveProject` into thin hook adapters that call those functions.
   DONE
5. Delete duplicated inline sequencing once the central flow is in place.
   DONE
6. Add tests for the transition helpers, especially around graph switching and project path handling.
   DONE
7. Keep path-based filesystem operations and pure in-memory workspace transitions separate so that the same transition layer can later serve both desktop and web clients.
   DONE

**Expected result**

- fewer “almost the same” save/load flows
- less risk of missing one persistence concern when changing behavior
- lower code volume in hooks
- a clearer split between platform-independent workspace transitions and platform-specific file access

**Risks**

- These flows touch many state atoms; extraction must preserve operation order.
- Graph cleanup and viewport restore behavior are user-visible and can regress subtly.
- Save/load bugs are high-impact because they affect user data.
- Mixing path-based persistence logic back into the shared transition layer would work against a future browser client.

---

### 5. Decompose the remaining large app components by responsibility, not by file size only - DONE

**Effort: M-L | Impact: High**

Several app files are still large enough to hide multiple concerns:

- `NodeCanvas.tsx`
- `SettingsPages.tsx`
- `NodeOutput.tsx`
- `NodeEditor.tsx`
- `PromptDesigner.tsx`
- `PluginsOverlay.tsx`
- `RenderDataValue.tsx`

The next step should not be “split every big file arbitrarily.” It should split by stable domain boundaries.

**Refactor goal**

Make each component file answer one question, not several.

**Suggested steps**

1. For `NodeCanvas.tsx`, extract:
   - viewport and transform application
   - canvas surface event handlers
   - overlay rendering
   - wire-layer composition
   DONE
2. For `NodeOutput.tsx` and `RenderDataValue.tsx`, separate:
   - output selection / metadata logic
   - value rendering by scalar/composite type
   - binary/image/audio/document specialized renderers
   DONE
3. For `NodeEditor.tsx`, split:
   - editor selection logic
   - field layout / grouping
   - node header / controls
   DONE
4. For `SettingsPages.tsx`, move each page into its own file if not already split deeply enough.
   DONE
5. For `PluginsOverlay.tsx`, separate:
   - plugin list rendering
   - failed plugin rendering
   - install/update/remove actions
   DONE
6. Delete pass-through wrappers as soon as a subcomponent is stable; avoid turning one large file into many thin files plus the same large file.
   DONE

**Expected result**

- smaller review surfaces
- fewer unrelated atom subscriptions per component
- easier bug localization

**Risks**

- Splitting a component without redistributing state access can preserve re-render coupling.
- Node canvas interactions are timing-sensitive and can regress if event extraction changes closure behavior.
- RenderDataValue/NodeOutput changes can break uncommon data types if not tested.

---

### 6. Collapse duplicated app-side execution rendering and status derivation - DONE

**Effort: M | Impact: Medium-High**

Execution status is still derived and displayed in multiple places:

- Action bar run/pause state
- node visual classes
- node output panels
- process-page selection state
- remote/local execution event bridges

There is still too much UI code that knows how to interpret execution state.

**Refactor goal**

Create one canonical execution-status derivation layer and have UI components consume that.

**Suggested steps**

1. Identify all places that compute concepts like:
   - “can run”
   - “running”
   - “paused”
   - “last run succeeded/errored/interrupted”
   - “node has output worth displaying”
   DONE
2. Move those derivations into selector/helper modules close to execution state.
   DONE
3. Replace component-local status logic with those helpers/selectors.
   DONE
4. Standardize naming for status variants so UI and execution hooks use the same terms.
   DONE
5. Delete duplicate per-component predicates and status adapters.
   DONE

**Expected result**

- less UI duplication
- easier changes to run-state behavior
- more transparent execution-state semantics
- clearer UI semantics across browser execution, internal Node execution, and future web-safe remote execution

**Risks**

- Status derivation is deeply entangled with UI behavior, especially for the action bar and node styling.
- It is easy to accidentally change when buttons are enabled or which class a node gets.

---

### 7. Separate platform-neutral app logic from desktop-only integration points - DONE

**Effort: M-L | Impact: High**

The docs already show that `packages/app` contains both platform-neutral product logic and desktop-only integration concerns. That is acceptable today, but it is the clearest architectural contradiction with a future fully web-based client if left untreated.

Current examples include:

- Tauri/native helpers imported from product hooks and components
- internal sidecar assumptions leaking into app execution logic
- path-based file handling mixed into project workflows

**Refactor goal**

Create a platform-neutral app core inside `packages/app` and move desktop-specific behavior behind explicit adapters, without changing current behavior.

**Suggested steps**

1. Identify platform-specific touchpoints in the app layer:
   - native shell/sidecar APIs
   - dialogs and filesystem access
   - updater APIs
   - desktop-only environment/path helpers
   DONE
2. Define a small set of platform capability interfaces for the app layer, for example:
   - file access
   - shell/process execution
   - window/app lifecycle
   - updater
   - executor transport bootstrap
   DONE
3. Move product logic to depend on those interfaces rather than directly on Tauri-flavored helpers.
   DONE
4. Keep the existing desktop implementations as the only concrete implementations for now.
   DONE
5. Ensure browser-mode code paths never import desktop-only modules at top level unless they are gated behind lazy/dynamic boundaries.
   DONE
6. Update docs to explicitly distinguish:
   - platform-neutral app logic
   - desktop platform adapters
   - future browser platform adapters
   DONE

**Expected result**

- lower coupling between app logic and Tauri
- fewer accidental desktop-only imports in shared UI flows
- a realistic path toward a future web client without redoing the execution and workspace layers from scratch

**Risks**

- Over-abstracting too early can add interface noise without reducing complexity.
- Some current helpers look platform-neutral but actually hide Tauri assumptions internally.
- If this is done as a giant migration, it will create unnecessary churn; it should proceed capability by capability.

---

## Tier 2: Structural Cleanups With High Long-Term Payoff

These are worth doing once Tier 1 is underway or covered by tests.

---

### 7. Consolidate serialization code further and shrink compatibility paths

**Effort: M | Impact: Medium**

`refactor-done.md` notes that V3/V4 shared logic still was not fully extracted. Serialization remains a compatibility boundary, but the implementation can still be made smaller and clearer.

**Refactor goal**

Reduce serializer/deserializer duplication without changing serialized output or compatibility.

**Suggested steps**

1. Extract shared V3/V4 node and graph serialization helpers where the structure is still duplicated.
2. Centralize version detection into one narrow function if there are still scattered checks.
3. Replace nested fallbacks with a small dispatch table where possible.
4. Add snapshot-like round-trip tests for the existing example and fixture project files.
5. Delete duplicated helper logic once coverage is in place.

**Expected result**

- smaller serialization modules
- easier review of future persistence changes
- less fear around touching project file code

**Risks**

- Serialization changes can break backwards compatibility silently.
- YAML formatting expectations may be stricter than they appear from the code.

---

### 8. Shrink `nativeApp.ts` into focused platform capability modules

**Effort: M | Impact: Medium**

`packages/app/src/utils/nativeApp.ts` is a broad compatibility surface for:

- app/window APIs
- shell commands/sidecars
- dialogs
- filesystem
- path helpers
- updater
- HTTP

It is useful, but it is also a single oversized “everything native” module. In its current shape, it also encourages app code to think in terms of Tauri APIs instead of in terms of platform capabilities.

**Refactor goal**

Split platform integration by capability so app code depends on narrower modules, and so desktop-only implementations are easier to replace with browser-safe implementations later.

**Suggested steps**

1. Split `nativeApp.ts` into focused capability modules such as:
   - `platformShell.ts`
   - `platformWindow.ts`
   - `platformFs.ts`
   - `platformDialog.ts`
   - `platformUpdater.ts`
   - `platformHttp.ts`
2. Keep a tiny top-level compatibility barrel only if it is truly additive and does not collapse the new boundaries back into one import magnet.
3. Move the shared environment detection / unsupported helpers into a tiny shared base file.
4. Keep the existing Tauri implementations as the current concrete implementations.
5. Update consumers to import only the capability they use.
6. Delete the old monolith once imports are migrated.

**Expected result**

- clearer dependency boundaries
- smaller files
- easier browser-vs-Tauri reasoning
- a cleaner seam for a future browser client

**Risks**

- This touches many imports and can create churn if done too broadly at once.
- Some helpers depend on each other implicitly today; splitting may expose hidden assumptions.
- Renaming everything to “platform” without actually reducing desktop assumptions would just be cosmetic churn; the capability split must be real.

---

### 9. Simplify node/plugin registration ownership

**Effort: M | Impact: Medium-High**

The current registry model still mixes:

- built-in node registration
- built-in plugin registration
- project plugin reset/rebuild behavior
- dynamic node availability

The code works, but ownership is still not obvious, especially in app/plugin-loading flows.

**Refactor goal**

Make it obvious which layer owns which registration step and reduce reset/rebuild complexity.

**Suggested steps**

1. Define three explicit operations:
   - create built-in registry
   - extend registry with plugins
   - replace current runtime registry
2. Encapsulate “reset + re-register built-ins + register project plugins” into one helper used by the app and executor.
3. Remove scattered direct registry mutation where possible.
4. Audit `globalRivetNodeRegistry` usage and replace non-essential direct reads/writes with explicit helper calls.
5. Keep runtime behavior identical: same built-ins, same plugin load order, same failure behavior.
6. Keep the helper interfaces usable by:
   - app browser execution
   - desktop app sidecar execution
   - standalone `rivet-node`
   - future web client runtime assembly
   without requiring one global mutable registry path.

**Expected result**

- less hidden coupling around registry-global state
- less duplicate setup code between app and sidecar
- easier plugin-related debugging
- less friction when reusing the same runtime assembly logic outside the desktop app

**Risks**

- Registry-global behavior is relied on in many places and easy to break.
- Plugin order matters for some behavior and must remain stable.
- If the refactor still assumes one long-lived desktop-global registry, it will not help the future web client enough.

---

### 10. Replace ad hoc “fire-and-forget” event emission with explicit helpers

**Effort: M | Impact: Medium**

Core still has many `eslint-disable-next-line @typescript-eslint/no-floating-promises` around event emission and related flows. Some are legitimate, but collectively they obscure intent.

**Refactor goal**

Make asynchronous fire-and-forget behavior explicit and consistent, instead of repeated inline lint suppression.

**Suggested steps**

1. Inventory the current `no-floating-promises` suppressions in core and app execution code.
2. Introduce a tiny explicit helper for intentionally detached async event emission, for example `emitDetached(...)`.
3. Replace repetitive inline suppression comments with helper usage where the pattern is intentional.
4. Leave genuinely suspicious cases as explicit awaited calls or as local `void` with comments.
5. Delete now-unneeded lint suppression noise.

**Expected result**

- less comment clutter
- easier audit of async behavior
- reduced “is this safe or accidental?” ambiguity

**Risks**

- Overusing a helper can hide real async sequencing bugs.
- Some currently detached calls may actually need awaiting; auditing is required.

---

### 11. Clean up CJS/ESM friction in `rivet-node` and `app-executor`

**Effort: M | Impact: Medium**

Current build output still emits warnings around:

- `import.meta` in CJS bundling
- `pkg` dynamic require resolution
- sidecar packaging assumptions

These warnings do not currently block builds, but they represent complexity and future debugging noise.

**Refactor goal**

Make Node runtime packaging less surprising and remove compatibility hacks where possible.

**Suggested steps**

1. Audit `NodeCodeRunner.ts` and any similar files that branch on `import.meta` in CJS builds.
2. Replace fragile mixed-mode patterns with one explicit compatibility strategy per runtime:
   - ESM path
   - CJS fallback path
3. Review `app-executor` bundling for dynamic requires that `pkg` cannot statically resolve.
4. Where dynamic requires are intentional, isolate them behind a tiny module and document why.
5. Aim to reduce build-time warnings without changing runtime behavior or sidecar packaging shape.

**Expected result**

- cleaner builds
- easier future runtime upgrades
- less packaging-specific confusion
- cleaner runtime boundaries between browser-safe code and Node-only code

**Risks**

- This area is sensitive because it affects built artifacts, not just source ergonomics.
- A “cleanup” here can easily break the packaged sidecar on one platform if not tested end-to-end.
- Be careful not to solve desktop packaging warnings by pushing more Node-only code into modules that the app frontend may later need to load in a browser build.

---

## Tier 3: Breadth Reduction Through Better Boundaries

These are larger cleanups that become much easier once earlier items reduce local complexity.

---

### 12. Create a small internal UI domain layer for graph editing actions

**Effort: L | Impact: Medium-High**

Graph editing behavior is still spread across commands, hooks, state, and component-local callbacks. This is functional but harder to follow than necessary.

**Refactor goal**

Group graph-editing actions into a small internal domain layer so the UI composes actions instead of assembling them ad hoc.

**Suggested steps**

1. Identify stable action groups:
   - node creation / duplication / deletion
   - connection creation / deletion
   - graph navigation
   - graph/folder operations
2. Create thin domain modules that expose those actions with explicit inputs/outputs.
3. Make hooks responsible for UI integration, not the business sequence itself.
4. Reuse these actions from context menus, sidebars, hotkeys, and toolbar flows.
5. Delete repeated orchestration code in hooks/components after migration.

**Expected result**

- less repeated “glue code”
- easier behavioral changes later
- clearer ownership of graph-editing workflows

**Risks**

- If this becomes too abstract, it can add indirection instead of removing it.
- Existing command/undo behavior must remain preserved.

---

### 13. Compress rendering-by-data-type into a table-driven renderer map

**Effort: M | Impact: Medium**

`RenderDataValue.tsx` and nearby rendering code still likely contain long conditional branches for data type handling.

**Refactor goal**

Use a small registry/map of renderers per data type instead of one long branching component.

**Suggested steps**

1. Identify the current rendering branches by data type.
2. Extract type-specific renderers into focused components or functions.
3. Build a renderer map keyed by data type.
4. Keep one narrow fallback for unknown or unsupported types.
5. Reuse the same map in output viewers and any other data-display surfaces where possible.

**Expected result**

- less branching code
- easier addition of future data renderers
- smaller top-level render component

**Risks**

- Some renderers may depend on contextual UI props not shared by others.
- Binary/image/audio/document rendering often has special-case behavior that should not be over-normalized.

---

### 14. Continue replacing “stateful hook tricks” with plain helpers where React is not needed

**Effort: M | Impact: Medium**

There are still several app hooks that appear to wrap mostly pure logic or sequencing rather than real component lifecycle concerns.

**Refactor goal**

Reduce unnecessary React hook surface by moving pure logic into plain modules and leaving hooks as adapters.

**Suggested steps**

1. Audit large hooks such as:
   - `useAiGraphBuilder.ts`
   - `useRemoteExecutor.ts`
   - graph-management hooks
2. For each hook, separate:
   - pure transformation logic
   - imperative workflow logic
   - React-only integration (atoms, effects, callbacks)
3. Move pure logic into plain `.ts` helpers with unit tests.
4. Keep hooks thin and focused on state wiring.
5. Delete duplicated closure-heavy helpers once the pure modules exist.

**Expected result**

- less hook complexity
- easier testability
- reduced accidental reactivity bugs

**Risks**

- Some hook code depends subtly on stale-closure behavior or effect ordering.
- Over-extraction can create too many tiny files if not grouped by domain.

---

### 15. Add targeted regression coverage for the simplified boundaries

**Effort: M | Impact: High**

The previous refactor wave increased test count, but the remaining high-risk simplification areas still need coverage if they are to be safely reduced.

**Refactor goal**

Add tests only where they enable deletion and simplification of complex code.

**Suggested steps**

1. Add focused tests around:
   - internal sidecar lifecycle
   - shared remote debugger connection behavior
   - project load/save/graph switch transitions
   - `GraphProcessor` scheduling/control-flow helpers extracted in this phase
   - chat-node shared pipeline helpers
   - platform capability adapters at the app boundary
2. Prefer narrow tests for extracted helpers and state transitions rather than only broad E2E tests.
3. Add one integration test that exercises app-executor startup and graph run in Node mode.
4. Add one browser-safe app integration test path that exercises browser execution without desktop-only APIs.
5. Use these tests as the safety net for code deletion in the items above.

**Expected result**

- safer simplification work
- lower chance of reintroducing recent execution bugs
- more confidence when deleting glue code
- more confidence that app-layer refactors are not reinforcing desktop-only assumptions

**Risks**

- Integration tests around sidecar and websocket flows can be flaky if they depend on timing instead of stable events.
- Too much test abstraction can make failures hard to read; keep fixtures simple.

---

## Recommended Execution Order

1. Separate platform-neutral app logic from desktop-only integration points.
2. Finish `GraphProcessor` reduction.
3. Simplify execution connectivity into an explicit session manager.
4. Consolidate project load/save/switch flows.
5. Break up the remaining large app components by domain boundary.
6. Refactor `ChatNodeBase` and provider duplication.
7. Shrink platform capability surfaces and registry setup surfaces.
8. Clean up serialization and runtime packaging warnings.
9. Add targeted regression tests around the simplified seams.

## Success Criteria

This plan is successful if, after implementation:

- `GraphProcessor`, `ChatNodeBase`, and the major app execution hooks are materially smaller.
- The app still passes the current build/test flow with no behavior change.
- Node execution and Browser execution still both work in the desktop app.
- Fewer modules directly manage sidecar/socket/registry lifecycle.
- Project load/save and graph switching are driven by one clear internal flow.
- The amount of code goes down overall, especially in orchestration files.
- The app layer depends on capability boundaries instead of assuming Tauri/desktop APIs directly.
- Nothing in the simplified execution or workspace layers would need to be conceptually undone to support a future fully web-based client.
