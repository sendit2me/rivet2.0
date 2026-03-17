## 1. DONE - Executor session ownership is still implemented as a process-global mutable singleton

**Why this is serious**

The recent session-manager refactor improved structure, but the current implementation still relies on module-level mutable state in `packages/app/src/hooks/executorSession.ts`. That keeps ownership implicit, hides lifecycle coupling, and makes transport behavior harder to test and evolve.

**Refactor goal**

Replace the process-global executor session module with an explicit app-scoped session runtime that owns its socket, callbacks, pending work, and teardown logic.

**Detailed refactor steps / actions**

1. Introduce an `ExecutorSessionRuntime` abstraction.
   - Move all mutable session state out of module scope and into an instance object.
   - Define a narrow interface for connection lifecycle, request dispatch, subscriptions, and teardown.
2. Add an app-level provider or runtime owner.
   - Create the runtime once at the app shell boundary.
   - Pass it down through React context or a small service boundary instead of importing singleton helpers directly.
3. Split transport state from React state wiring.
   - Keep socket lifecycle and message routing inside the runtime.
   - Keep UI-facing derived state inside hooks that subscribe to the runtime instead of mutating it.
4. Remove bind-style APIs that inject setters into global state.
   - Replace `bind...` style functions with explicit constructor dependencies or runtime methods.
   - Make dataset-provider ownership explicit rather than globally replaceable.
5. Add runtime lifecycle tests.
   - Cover connect, reconnect, disconnect, teardown, and stale callback cleanup.
   - Verify no session state survives runtime disposal.
6. Migrate consumers incrementally.
   - Move `useExecutorSession.ts`, `useRemoteExecutor.ts`, and related call sites onto the runtime interface.
   - Keep a temporary adapter only if needed to avoid a large cutover.

**Risks**

- Regressions in reconnect behavior or dataset request routing during the migration.
- Hidden call sites may still rely on singleton semantics.
- App startup order bugs may appear if runtime creation and consumer subscription order are not well defined.

**What will change for the user after the refactor**

- Remote executor connection behavior should become more predictable.
- Random session cross-talk between tabs, windows, or sequential runs should be less likely.
- Disconnect/reconnect flows should feel more reliable, especially after errors or project switching.

## 2. DONE - Remote execution still supports only one in-flight pending run at a time

**Why this is serious**

The current bridge stores only one pending remote execution at a time. Starting a second run replaces the first pending promise, which means the transport cannot safely represent concurrent or overlapping remote work.

**Refactor goal**

Make remote execution request/response handling fully request-scoped so the app can track multiple active runs without promise replacement hacks.

**Detailed refactor steps / actions**

1. Introduce stable request IDs for remote graph runs.
   - Generate a unique ID for every remote execution request.
   - Include that ID in outbound run messages and require it in completion/error events.
2. Replace `pendingExecution` with a request map.
   - Store active requests in a `Map<requestId, PendingExecution>`.
   - Track resolver, rejecter, timeout, metadata, and optional cancellation hooks per request.
3. Update message routing in the executor session runtime.
   - Route completion, error, pause, abort, and progress events by request ID.
   - Reject only the affected request on error instead of globally replacing the active run.
4. Update remote executor consumers.
   - Make `useRemoteExecutor.ts` and test-related flows use request-scoped APIs.
   - Remove assumptions that only one remote run can exist at a time.
5. Decide explicit cancellation semantics.
   - Support cancel-one, cancel-all-on-disconnect, and timeout cleanup behaviors.
   - Ensure disconnect tears down every pending request deterministically.
6. Add concurrency tests.
   - Cover two simultaneous runs, out-of-order completion, cancellation, disconnect, and stale responses.

**Risks**

- Protocol changes may require matching updates on both app and executor sides.
- Existing tooling may implicitly depend on serialized execution and could expose new race conditions once concurrency is possible.
- Timeout and cleanup bugs could leak pending promises or orphan remote work.

**What will change for the user after the refactor**

- Running one graph or test should no longer unexpectedly cancel another pending remote run.
- Concurrent tooling workflows should behave more reliably.
- Error reporting should point to the specific run that failed instead of surfacing confusing replacement errors.

## 3. DONE - The app still relies on a mutable global node registry that changes per project/plugin set

**Why this is serious**

The app rebuilds a registry from project plugins and then installs it globally with `replaceGlobalRivetNodeRegistry(registry)`. That creates hidden coupling between project selection, plugin loading, editor behavior, and runtime availability.

**Refactor goal**

Move from a global mutable registry model to explicit project-scoped registry ownership, while keeping the migration safe for editor and runtime consumers.

**Detailed refactor steps / actions**

1. Define a `ProjectRegistryContext` boundary.
   - Represent the assembled node registry as project-owned runtime state.
   - Make registry creation an explicit result of project/plugin loading.
2. Audit all registry consumers.
   - Identify editor, validation, execution, serialization, and UI code that still reads the global registry implicitly.
   - Group them into easy-to-migrate consumers and high-risk legacy consumers.
3. Add dependency injection for registry consumers.
   - Update core app services and hooks to accept a registry reference or context-derived value.
   - Prefer passing the registry through execution/editor boundaries rather than importing a singleton.
4. Add compatibility shims during migration.
   - If needed, keep a temporary fallback for legacy consumers while converting the main surfaces.
   - Mark the fallback as transitional and remove it after the critical consumers are migrated.
5. Make multi-project behavior explicit.
   - Ensure each open project tab can resolve its own registry.
   - Prevent plugin changes in one project from mutating editor/runtime behavior in another.
6. Add validation and regression coverage.
   - Test plugin changes, tab switching, project loading, and node availability under multiple open projects.

**Risks**

- This change touches many consumers, so migration churn is likely.
- Legacy code may assume that the registry is always globally available during initialization.
- Some plugin/editor flows may fail in subtle ways if registry ownership is only partially migrated.

**What will change for the user after the refactor**

- Multiple open projects should interfere with each other less.
- Plugin changes should feel more isolated to the project where they were made.
- Editor and runtime node availability should become more consistent and easier to reason about.

## 4. DONE - `GraphProcessor` still runs with unbounded concurrency

**Why this is serious**

`GraphProcessor` currently initializes `PQueue` with `concurrency: Infinity`, so the scheduler is effectively unconstrained. That makes throughput and failure behavior highly dependent on graph shape and node behavior rather than an intentional execution policy.

**Refactor goal**

Introduce explicit concurrency policy into graph execution so resource usage, throughput, and failure modes become predictable and tunable.

**Detailed refactor steps / actions**

1. Add a concurrency policy abstraction.
   - Define defaults for local app runs, sidecar runs, CLI runs, and tests.
   - Make the scheduler read concurrency settings from processor options rather than hardcoding infinity.
2. Separate concurrency concerns by work type.
   - Distinguish general node execution, fan-out/split execution, subgraph execution, and high-latency IO nodes where possible.
   - Avoid one flat global rule if the workload types differ materially.
3. Implement safe defaults.
   - Start with bounded concurrency that preserves current behavior well enough for common graphs.
   - Keep an override for advanced or benchmark use cases.
4. Add instrumentation.
   - Measure queue depth, active tasks, throttling, and slow-node patterns.
   - Use this to tune defaults before hardening them further.
5. Test behavior under load.
   - Add stress coverage for large fan-out graphs, split-runs, and graphs with slow remote calls.
   - Compare throughput, cancellation, and memory behavior before and after the change.
6. Document the new execution policy.
   - Update developer docs so plugin authors and core maintainers understand the new scheduling constraints.

**Risks**

- Some graphs may run slower until defaults are tuned.
- Bounded concurrency can expose hidden assumptions in nodes that accidentally relied on unlimited parallelism.
- Incorrect throttling at the wrong layer could reduce responsiveness without meaningfully reducing load.

**What will change for the user after the refactor**

- Large graphs should be less likely to spike resource usage unpredictably.
- Execution should feel more stable under heavy workloads.
- In some scenarios, peak throughput may drop slightly, but crashes, stalls, or overload behavior should improve.

## 5. DONE - Multi-project workspace state is duplicated across too many layers

**Why this is serious**

The current multi-project workspace model persists and synchronizes large project snapshots across open-tab state and storage layers. That creates overlapping sources of truth and increases the chance of stale writes, hidden synchronization bugs, and unnecessary memory pressure.

**Refactor goal**

Reduce duplicated project state by making one authoritative workspace model and storing only the minimum data needed for tabs, persistence, and restoration.

**Detailed refactor steps / actions**

1. Define the canonical source of truth.
   - Decide which layer owns the active editable project state.
   - Treat tab metadata, persistence caches, and restoration snapshots as derived or explicitly serialized artifacts.
2. Shrink tab state.
   - Store stable identifiers, file paths, selected graph IDs, and lightweight UI metadata in `openedProjects`.
   - Stop storing full project payloads there unless there is a clearly justified offline/restore need.
3. Replace continuous full mirroring with targeted persistence.
   - Persist on explicit checkpoints, debounced saves, or well-defined transitions.
   - Avoid writing a full copy of project state on every active-state change.
4. Introduce snapshot versioning or dirty tracking.
   - Track whether tab metadata and project content are in sync.
   - Make stale snapshot detection explicit rather than implicit.
5. Revisit hybrid storage boundaries.
   - Keep the storage layer focused on persistence concerns, not cross-store synchronization policy.
   - Reduce memory duplication between in-memory caches and persisted state where feasible.
6. Add transition tests.
   - Cover tab switching, rapid edits, project closing, crash recovery, and persistence restoration.

**Risks**

- Migration mistakes could cause loss of unsaved state during tab switches or crash recovery.
- Existing restore behavior may depend on duplicated snapshots more than the code suggests.
- Reducing writes too aggressively could make recovery worse if save checkpoints are not designed carefully.

**What will change for the user after the refactor**

- Tab switching and workspace restoration should become more reliable.
- The app should be less likely to resurrect stale project state.
- Large projects may use less memory and feel less fragile during long editing sessions.

## 6. DONE - Error handling still often degrades into generic logs, generic toasts, or swallowed failures

**Why this is serious**

Important execution, transport, and persistence paths still collapse into low-signal logging or generic user-facing errors. In a stateful app, that often leaves the system partially broken without enough information to recover or debug it.

**Refactor goal**

Make failure handling explicit, structured, and boundary-specific so internal errors are diagnosable and user-facing errors are actionable.

**Detailed refactor steps / actions**

1. Define an error taxonomy.
   - Separate user-correctable errors, expected remote/runtime failures, transient transport failures, and internal consistency bugs.
   - Give each category standard handling rules.
2. Introduce structured error objects.
   - Preserve operation name, project/graph identifiers, request IDs, and causal error chains.
   - Avoid losing context when errors cross transport or hook boundaries.
3. Standardize boundary behavior.
   - Execution layer: fail the active run with structured context.
   - Transport layer: surface connection and protocol errors clearly.
   - Persistence layer: mark state as degraded when writes fail instead of only logging.
4. Replace generic toasts and console logs at key boundaries.
   - Use targeted UI messages with enough detail to help the user recover.
   - Keep richer diagnostic information in logs or dev tooling.
5. Add observability hooks.
   - Centralize error reporting for executor session, plugin loading, and workspace transitions.
   - Make it possible to correlate one failure across layers.
6. Add regression coverage for failure flows.
   - Test disconnect mid-run, plugin load failure, persistence write failure, stale response handling, and recovery after an error.

**Risks**

- Better error propagation may initially surface more failures to users and developers.
- Tightening failure semantics can reveal hidden state corruption that used to be silently ignored.
- If the taxonomy is too complicated, the team may stop using it consistently.

**What will change for the user after the refactor**

- Errors should be clearer and more actionable.
- The app should be less likely to silently continue in a broken state.
- Recovery paths after failed runs, failed saves, or transport issues should feel more consistent.

## 7. DONE - App-side async actions and mutations now carry too much repeated boilerplate

**Why this is serious**

The recent safety refactors improved behavior, but they also left a lot of near-identical code in components and hooks. Repeated `try/catch` blocks, duplicated `handleError` metadata wiring, overlapping async wrappers, and copy-pasted React Query mutation setup increase file size and make simple flows harder to read and maintain.

**Refactor goal**

Reduce code and complexity by consolidating repeated async action, mutation, and error-reporting patterns into a small set of explicit helpers or domain hooks without hiding important behavior.

**Progress so far**

- `wrapAsync` now carries the shared async-handler behavior, while `syncWrapper` remains only as a compatibility alias.
- Dataset actions now use shared wrapper/error plumbing instead of repeated local `try/catch` code.
- Dataset hooks now also share small persist-and-reload helpers instead of repeating the same write/reload sequence across row and metadata mutations.
- Community template publish/version/unpublish flows now share request/query-key plumbing instead of repeating mutation setup details.
- Community/profile mutations now also share a small handled-mutation helper for repeated error handling, invalidation, and completion wiring.
- Top-level app UI entry points now use `wrapAsync` directly in place of many compatibility-wrapper call sites.
- Small hook-returned UI callbacks such as opening URLs and saving recordings now use `wrapAsync` instead of local promise-catching boilerplate.

**Detailed refactor steps / actions**

1. Wrapper consolidation and async UI entry points.
   - [x] Replace app-side `syncWrapper(...)` call sites with direct `wrapAsync(...)` usage and explicit context strings.
   - [x] Preserve compatibility by keeping `syncWrapper` as a thin alias while removing non-test app usage.
   - [x] Convert top-level UI entry points and utility buttons to direct `wrapAsync(...)` handlers.
   - [x] Convert file I/O editors and browse-button flows to direct `wrapAsync(...)` handlers.
   - [x] Remove stale `syncWrapper` imports after call-site cleanup.

2. Shared async error plumbing.
   - [x] Extend `wrapAsync` so it can resolve structured error metadata from call-site arguments.
   - [x] Keep shared toast deduplication and structured logging behavior in one place.
   - [x] Replace repeated local `try/catch + handleError` blocks where routine wrapper behavior is sufficient.
   - [x] Audit remaining local `try/catch + handleError` blocks outside the already-cleaned slices and collapse only the ones that are routine rather than semantically special.

3. Dataset action boilerplate reduction.
   - [x] Consolidate repeated dataset action error handling and metadata wiring in dataset UI flows.
   - [x] Simplify dataset import/export/clear/update handlers to use shared wrapper behavior instead of repeated local async plumbing.
   - [x] Recheck for any remaining dataset-specific async duplication that is still materially repetitive.

4. Community/template request and mutation cleanup.
   - [x] Centralize shared community template request/query-key plumbing.
   - [x] Move template publish/version/unpublish flows onto shared request helpers where semantics match.
   - [x] Introduce a small handled-mutation helper for repeated React Query error/invalidation/completion wiring.
   - [x] Adopt that helper in community/template/profile mutation callers that fit the shared shape.
   - [x] Audit for remaining community/profile mutation call sites that still justify the shared helper or a small adjacent helper.

5. Low-value indirection removal.
   - [x] Replace wrapper-on-wrapper UI handlers where the outer layer added little value.
   - [x] Remove redundant compatibility-wrapper imports and call-through layers that no longer buy clarity.
   - [x] Reassess temporary callback/state layers that still exist only to route one async action into another.

6. Completion criteria for issue 7.
   - [x] Confirm the highest-value remaining boilerplate clusters are either refactored or explicitly left alone because their behavior is meaningfully unique.
   - [x] Record the remaining intentional exceptions in this section so the issue can be marked done with a clear boundary.
   - [x] Measure the final cleanup in practical terms: major clusters removed, helpers introduced, and notable call-site reductions.

**Intentional exceptions / closure boundary**

- Remaining `try/catch + handleError` sites in `useWorkspaceTransitions`, `useRemoteExecutor`, `useLocalExecutor`, `useLoadProject`, `useLoadProjectWithFileBrowser`, and `useReloadProjectReferences` are intentionally left in place because they combine error handling with meaningful recovery, state rollback/reset, partial-failure tolerance, or orchestration across multiple async steps.
- Storage, selector, worker, and plugin-loading error handlers are intentionally left explicit because they are infrastructure-level boundaries rather than routine UI action wrappers.
- Remaining callback/state layers around workspace loading, executor runs, and project-reference reloads are intentionally left in place because they encode ownership boundaries and effect timing, not just indirection for its own sake.

**Practical cleanup achieved**

- Introduced or standardized two shared helpers around async behavior: `wrapAsync` for routine async UI handlers and `useHandledMutation` for common React Query mutation wiring.
- Removed non-test app reliance on `syncWrapper`, leaving it as a compatibility alias instead of an actively used abstraction.
- Consolidated repeated boilerplate across dataset actions, community template/profile mutations, file I/O helpers, utility buttons, and small hook-returned UI callbacks.
- Reduced the remaining open-ended boilerplate surface to flows whose complexity is tied to orchestration semantics rather than repetitive error-wrapper code.

**Risks**

- Over-abstracting could make simple UI flows harder to debug than they are today.
- A helper that tries to fit every async case may recreate the same complexity in a different place.
- Consolidating metadata generation too aggressively could reduce the quality of diagnostic context.

**What will change for the user after the refactor**

- The app should behave the same, but the code behind common actions should be smaller and easier to evolve.
- Routine UI actions should become less fragile because there will be fewer copy-pasted implementations to keep in sync.
- Future fixes should require touching fewer files for the same kind of change.

# Recommended implementation order

1. executor session runtime ownership
2. request-scoped remote execution tracking
3. structured error handling at executor/transport boundaries
4. project-scoped registry ownership
5. workspace state de-duplication
6. bounded `GraphProcessor` concurrency
7. app-side async action and mutation simplification

# Why this order

- **1 and 2 first** because they reduce hidden coupling in the runtime layer that the other app-side refactors depend on.
- **3 next** because better failure semantics make the rest of the migration safer to execute.
- **4 and 5 after that** because both change ownership boundaries in app state and project/runtime composition.
- **6 last** because it is important, but easier to do safely once runtime behavior is easier to observe and debug.
- **7 after the stability work** because code-reduction cleanup is safest once ownership, transport, and failure boundaries are already explicit.

# Overall conclusion

These seven items are not just cleanup tasks. Together, they are a refactor program to make Rivet less dependent on hidden global state, less prone to cross-feature coupling, easier to debug, and smaller in the places where defensive structure has started to turn into repeated boilerplate.
