# Executor Session and Remote Debugger Architecture Audit

Date: 2026-05-06

Scope: the Rivet app executor session lifecycle, hosted internal Node executor
URL contract, Remote Debugger handoff, Run button state, and remote execution
call sites.

This report focuses on architectural problems, user-visible risks, and
regression targets. Some entries describe defects that have already been fixed
and should remain covered by tests; others describe design hazards that make
future lifecycle changes easy to get wrong.

## Summary

Rivet uses one shared websocket session runtime for two different product
concepts:

1. The internal Node executor session used by desktop/Tauri and hosted wrappers.
2. The external Remote Debugger session used to receive latest-workflow runs.

That shared runtime is a useful simplification at the transport layer because
both targets speak the same graph-execution websocket protocol. The refactor
now makes the target explicit, keeps active session facts transient, centralizes
startup/restore policy in a coordinator, exposes transport capabilities, and
feeds product UI from a typed selector instead of raw socket state.

The main remaining debt is naming: some source-level compatibility surfaces are
still called `useRemoteDebugger` because they are used by the user-facing Remote
Debugger command flow, even though the underlying runtime is now neutral. New
code should treat the items below as the original audit findings that motivated
the refactor and should prefer the implemented target/capability/product-state
model described in the refactor plan and bottom line.

## Original Problems and Risks

1. The session runtime has one transport model but two product meanings.

   Affected files:

   - `packages/app/src/hooks/executorSession.ts`
   - `packages/app/src/hooks/useExecutorSession.ts`
   - `packages/app/src/hooks/useRemoteDebugger.ts`
   - `packages/app/src/state/selectors/executionSelectors.ts`
   - `packages/app/src/components/ActionBar.tsx`
   - `packages/app/src/components/ActionBarMoreMenu.tsx`
   - `packages/app/src/components/DebuggerConnectPanel.tsx`

   The runtime can represent either an internal executor or an external Remote
   Debugger, but much of the public hook surface still calls it a remote
   debugger. This causes repeated local checks such as `!session.isInternalExecutor`
   before showing Remote Debugger UI. Any component that forgets this check can
   make the hosted internal executor look like the Remote Debugger came back.

   Recommended direction: keep the shared low-level websocket runtime, but give
   it a neutral app-facing name and expose product-specific views such as
   `executorSession`, `nodeExecutorSession`, and `remoteDebuggerSession`.

2. Session target classification is a boolean instead of a richer target model.

   Affected files:

   - `packages/app/src/hooks/executorSession.ts`
   - `packages/app/src/state/execution.ts`
   - `packages/app/src/state/selectors/executionSelectors.ts`

   `isInternalExecutor` works for the current two-target world, but it does not
   encode why a session exists, whether it is desktop sidecar or hosted internal
   executor, whether it can upload project data, or whether it should reconnect.
   The code has to infer those policies from a mix of URL, selected executor,
   Tauri availability, and host config.

   Recommended direction: replace the boolean with a target object or union:
   `internal-desktop`, `internal-hosted`, `external-debugger`. That object can
   carry reconnect policy and capabilities instead of scattering them across
   hooks.

3. `remoteDebuggerConfigState` persists transient session data.

   Affected files:

   - `packages/app/src/state/execution.ts`
   - `packages/app/src/hooks/executorSession.ts`
   - `packages/app/src/hooks/useExecutorSession.ts`
   - `packages/app/src/state/settings.ts`

   `remoteDebuggerConfigState` is persistent app storage, but it contains
   `url`, `remoteUploadAllowed`, and `isInternalExecutor`. Those are
   runtime/session facts, not durable user configuration. The connect-panel
   default URL is already stored separately as `debuggerDefaultUrlState`, so the
   persisted `remoteDebuggerConfigState.url` is not needed to remember what the
   user typed. After reload, the persisted config can briefly describe a socket
   that no longer exists until the runtime overwrites it.

   Recommended direction: persist only durable user choices, such as the last
   manually entered external debugger URL. Move `url`, `remoteUploadAllowed`,
   `isInternalExecutor`, and any active target metadata into transient runtime
   state.

4. The action-time restore decision can use a render-time snapshot.

   Affected files:

   - `packages/app/src/hooks/useRemoteDebugger.ts`

   `useRemoteDebugger.disconnect()` decides whether to restore the internal Node
   executor from `sessionState` captured during render. If the session changes
   between render and click, the restore decision can be stale. This is low
   probability but belongs to the same class of lifecycle bugs already found in
   this product area.

   Recommended direction: make `disconnect()` ask the runtime for the current
   classified session at action time, or move the "disconnect external debugger
   and optionally restore selected executor" command into a single coordinator.

5. Lifecycle ownership is split between `useRemoteDebugger` and `useExecutorSession`.

   Affected files:

   - `packages/app/src/hooks/useRemoteDebugger.ts`
   - `packages/app/src/hooks/useExecutorSession.ts`

   Manual external debugger disconnect restores the internal Node executor in
   `useRemoteDebugger`. Unexpected external debugger drop restores the internal
   Node executor in `useExecutorSession`. The split keeps each fix small, but it
   means the same product policy lives in two hooks.

   Recommended direction: centralize handoff policy in one coordinator hook or
   command layer. The runtime should report facts; the coordinator should decide
   whether selected Node mode should be restored.

6. Lifecycle events use one shape for connect and disconnect.

   Affected files:

   - `packages/app/src/hooks/executorSession.ts`

   `ExecutorSessionLifecycleEvent.reason` currently includes `connected`, which
   is not really a reason. It also means connect and disconnect callbacks receive
   a shape that is not precise for either event type.

   Recommended direction: use a discriminated event union, for example
   `{ type: 'connected', target, status, url }` and
   `{ type: 'disconnected', target, reason, status, url }`.

7. Lifecycle and message subscriber failures can break later subscribers.

   Affected files:

   - `packages/app/src/hooks/executorSession.ts`

   `notifyConnect`, `notifyDisconnect`, and process-message dispatch iterate
   callback sets directly. If one callback throws, later callbacks may not run.
   This could interrupt cleanup in another hook and create sticky running state.
   Direct Set iteration also means callbacks added or removed during
   notification can affect the same notification pass.

   Recommended direction: snapshot callback sets before notifying and isolate
   subscriber errors with `handleError(..., { toastError: false })` or equivalent
   runtime logging.

8. External Remote Debugger and internal executor share capability flags.

   Affected files:

   - `packages/app/src/hooks/useRemoteExecutor.ts`
   - `packages/app/src/components/gentrace/GentraceInteractors.tsx`
   - `packages/app/src/hooks/executorSession.ts`

   `remoteUploadAllowed` is used for both external debugger and internal
   executor sessions. That is technically valid if both targets speak the same
   upload protocol, but the name implies external debugger behavior. It also
   hides which commands are supported by which target.

   Recommended direction: expose explicit capabilities from the active session,
   such as `canUploadProject`, `canSendRun`, `canSendAbort`, and
   `canRecordSocket`.

9. Remote executor routing is selected before the session is usable.

   Affected files:

   - `packages/app/src/hooks/useGraphExecutor.ts`
   - `packages/app/src/hooks/useRemoteExecutor.ts`
   - `packages/app/src/state/selectors/executionSelectors.ts`

   `shouldUseRemoteExecutor(...)` returns true whenever selected executor is
   Node, even while the internal socket is idle, connecting, or reconnecting.
   `useRemoteExecutor.tryRunGraph()` then checks readiness and silently skips if
   the socket is not ready. The action bar tries to prevent this, but the
   layering is still surprising.

   Recommended direction: model "route to remote executor" and "remote executor
   can accept a run now" as separate explicit decisions, and make skipped runs
   return a meaningful result to callers.

10. `useRemoteExecutor.active` is target-agnostic.

    Affected file:

    - `packages/app/src/hooks/useRemoteExecutor.ts`

    `active` means the shared session is ready. It does not tell callers whether
    that ready session is the internal Node executor or the external Remote
    Debugger. The current app does not consume this field directly, which limits
    immediate impact, but the hook contract is weak because a future consumer
    may reasonably read it as "remote debugger is active."

    Recommended direction: expose both `transportReady` and `target`, or remove
    the ambiguous `active` field from product-level consumers.

11. Remote run cleanup treats all disconnects the same.

    Affected files:

    - `packages/app/src/hooks/useRemoteExecutor.ts`
    - `packages/app/src/hooks/useRemoteDebugger.ts`

    `useRemoteExecutor` passes an `onDisconnect` callback to
    `useRemoteDebugger`, and that callback clears the active request and stops
    current execution for any disconnect. Manual external debugger disconnect,
    unexpected external drop, internal executor reconnect, app shutdown, and
    target replacement all collapse into the same callback.

    Recommended direction: pass lifecycle event metadata through
    `useRemoteDebugger` callbacks, or subscribe directly to the neutral runtime
    with a target-aware handler.

12. Internal executor reconnect policy is runtime-owned, but restore policy is
    hook-owned.

    Affected files:

    - `packages/app/src/hooks/executorSession.ts`
    - `packages/app/src/hooks/useExecutorSession.ts`

    The runtime schedules automatic reconnect for internal executor websocket
    closes. Separately, `useExecutorSession` opens Node mode on startup and
    restores Node mode after an external debugger drops. `useRemoteDebugger`
    restores Node mode after an explicit external debugger disconnect. This is
    valid, but there are several places that can open an internal executor
    socket after a disconnect.

    Recommended direction: make the runtime expose reconnect primitives, but let
    one coordinator own every automatic call to `connectInternal(...)`.

13. Hosted internal executor classification depends on using the correct method.

    Affected files:

    - `packages/app/src/hooks/executorSession.ts`
    - `packages/app/src/hooks/useExecutorSession.ts`
    - `packages/app/src/providers/ExecutorSessionContext.tsx`

    `connect(url)` is now a compatibility wrapper for external Remote Debugger
    sessions. Hosted executor URLs must be connected through
    `connectInternalHostedExecutor(url)` or the compatibility
    `connectInternal(url)` wrapper. Current hosted code does this correctly, but
    any future direct call to `connect(hostedInternalUrl)` will classify the
    internal executor as an external debugger.

    Recommended direction: make the URL target explicit at the type level, or
    remove generic `connect(url)` from app-level consumers and expose
    `connectExternalDebugger(...)`, `connectInternalDesktopExecutor(...)`, and
    `connectInternalHostedExecutor(...)`.

14. Replacing an active session does not notify disconnect subscribers.

    Affected files:

    - `packages/app/src/hooks/executorSession.ts`
    - `packages/app/src/hooks/useRemoteExecutor.ts`

    `connect(...)` can replace the current websocket by closing the old one and
    opening a new one. The old socket close is intentionally ignored through the
    socket-generation guard, but the replacement path does not notify
    disconnect subscribers and does not reject pending remote executions tied to
    the old socket. If a graph is running and the user or code connects a
    different executor/debugger session, the old run can be left without a
    clean lifecycle signal.

    Recommended direction: treat target replacement as a first-class lifecycle
    event. Before replacing a live socket, reject pending executions and notify
    subscribers with a reason such as `replaced`. If a product flow should
    forbid replacement while running, enforce that explicitly in the
    coordinator/UI layer.

15. Dataset request handling can throw after a socket closes.

    Affected file:

    - `packages/app/src/hooks/executorSession.ts`

    Dataset websocket messages are handled asynchronously. If the socket closes
    while the dataset provider is working, `sendDatasetResponse(...)` can throw.
    That failure is currently not caught in the async dataset path.

    Recommended direction: wrap dataset request handling and response sending in
    try/catch, and include target/url/request metadata in non-toast runtime logs.

16. The runtime keeps stale URL/target fields after idle.

    Affected files:

    - `packages/app/src/hooks/executorSession.ts`
    - `packages/app/src/hooks/useExecutorSession.ts`

    After disconnect, `currentUrl` and `currentIsInternalExecutor` remain set
    even though status is idle. This is useful for diagnostics, but it can also
    leak stale classification into derived state if a consumer forgets to gate on
    status.

    Recommended direction: either clear the active target on idle and keep
    diagnostics separately, or expose `activeTarget` as nullable when idle.

17. UI state names still describe Remote Debugger even when the active target is
    Node executor.

    Affected files:

    - `packages/app/src/state/execution.ts`
    - `packages/app/src/hooks/useRemoteDebugger.ts`
    - `packages/app/src/components/ActionBar.tsx`
    - `packages/app/src/components/ActionBarMoreMenu.tsx`
    - `packages/app/src/components/DebuggerConnectPanel.tsx`

    Names such as `remoteDebuggerConfigState`, `remoteDebuggerConnectionState`,
    and `remoteDebugger.sessionState` make it too easy to conflate internal
    executor readiness with external debugger state.

    Recommended direction: reserve Remote Debugger naming for the external
    product feature and use session/executor naming for shared transport.

18. There is no dedicated integration test for the React hook coordinator.

    Affected files:

    - `packages/app/src/hooks/useExecutorSession.ts`
    - `packages/app/src/hooks/useRemoteDebugger.ts`

    Current tests cover pure restore helpers and the runtime behavior. They do
    not mount the hook layer to prove the selected-executor effect and lifecycle
    subscription cooperate correctly under React timing.

    Recommended direction: add a small hook/coordinator test with fake runtime,
    selected executor state, hosted internal URL, and external debugger drop.

19. Gentrace remote execution uses the shared session directly.

    Affected file:

    - `packages/app/src/components/gentrace/GentraceInteractors.tsx`

    Gentrace checks `executorSession.status === 'ready' && executorSession.socket`
    and then records socket events directly. It does not distinguish external
    debugger from internal executor. That may be intended because both speak the
    same protocol, but it bypasses some target-aware semantics being added to
    the action bar and executor hooks. This item should be verified with product
    intent before refactoring; the technical risk is direct raw-socket coupling,
    not necessarily the choice to use either remote target.

    Recommended direction: route Gentrace through the same target/capability
    abstraction as normal graph runs.

20. The user-facing status model is still too indirect.

    Affected files:

    - `packages/app/src/state/selectors/executionSelectors.ts`
    - `packages/app/src/components/ActionBar.tsx`
    - `packages/app/src/components/ActionBarMoreMenu.tsx`

    The UI has to derive `canRun`, `executorLoading`,
    `isActuallyRemoteDebugging`, and `showRemoteDebuggerBanner` from raw session
    status plus `isInternalExecutor`. This derivation is now centralized better
    than before, but it still depends on a low-level session state.

    Recommended direction: create one product-level selector that returns a
    typed state such as `browser-ready`, `internal-node-starting`,
    `internal-node-ready`, `internal-node-reconnecting`,
    `external-debugger-ready`, and `external-debugger-disconnected`.

21. The product needs an explicit handoff contract.

    Affected docs:

    - `developer-docs/APP-ARCHITECTURE.md`
    - `developer-docs/EXECUTION-DATA-FLOW.md`

    The intended handoff is subtle:

    1. Node mode connects internal executor.
    2. Remote Debugger connect replaces that internal executor with an external
       debugger socket.
    3. Manual external debugger disconnect restores the selected Node executor.
    4. Unexpected external debugger drop does not reconnect the external
       debugger.
    5. If Node mode is selected, unexpected external debugger drop may restore
       only the internal executor.
    6. Browser mode never restores `/ws/executor/internal` after external
       debugger disconnect/drop.

    This contract is now documented, but it is important enough to become a
    first-class design invariant with tests and product copy.

## Already Addressed Regression Targets

1. External Remote Debugger websocket close must not auto-reconnect the external
   debugger.

   Previously, the runtime reconnect path did not distinguish internal executor
   from external debugger strongly enough. The implementation restricts
   automatic reconnect to internal executor sessions.

2. Hosted `/ws/executor/internal` must remain classified as internal across
   reconnects.

   Hosted wrappers do not use the desktop default internal URL. The
   implementation uses `connectInternalHostedExecutor(hostConfig.internalExecutorUrl)`
   through the coordinator so custom hosted executor URLs do not show as Remote
   Debugger sessions.

3. Manual disconnect must notify cleanup subscribers even when Node mode is
   restored immediately.

   The implementation captures the old socket/target, detaches it, sets idle,
   closes the socket, and notifies disconnect subscribers synchronously.

4. Internal executor reconnect timers must not race a deliberate reconnect from
   a lifecycle subscriber.

   The implementation schedules the timeout before notifying subscribers, and
   `connectInternal(...)` clears the timeout if a subscriber reconnects
   immediately.

## Recommended Refactor Plan

1. DONE - Introduce a neutral session target type.

   Goal: make the active websocket target explicit everywhere, so the app no
   longer has to infer product meaning from `status + isInternalExecutor + url`.

   Proposed model:

   ```ts
   type ExecutorSessionTarget =
     | { type: 'internal-desktop'; url: string }
     | { type: 'internal-hosted'; url: string }
     | { type: 'external-debugger'; url: string };
   ```

   What to change:

   - In `packages/app/src/hooks/executorSession.ts`, replace
     `currentIsInternalExecutor` with `currentTarget: ExecutorSessionTarget | null`.
   - Replace `connect(url, { isInternalExecutor })` with explicit methods such
     as `connectExternalDebugger(url)`, `connectInternalDesktopExecutor()`,
     and `connectInternalHostedExecutor(url)`.
   - Do this as a staged API migration because `ExecutorSessionRuntime` is
     exported from `packages/app/src/host.tsx`. First add explicit methods and
     keep `connect(...)` / `connectInternal(...)` as compatibility wrappers;
     then migrate internal app call sites; only then consider removing or
     deprecating the generic methods.
   - Keep a backwards-compatible `isInternalExecutor` derived field on
     `ExecutorSessionState` during the transition, because hosted wrappers may
     import the source-level host API directly.
   - Update `ExecutorSessionLifecycleEvent` to include `target` instead of only
     `isInternalExecutor`. Keep a derived `isInternalExecutor` on lifecycle
     events during the transition if external source consumers need it.
   - Update callers in `useExecutorSession.ts`, `useRemoteDebugger.ts`,
     `ActionBar.tsx`, `ActionBarMoreMenu.tsx`, `DebuggerConnectPanel.tsx`,
     `GentraceInteractors.tsx`, and `executionSelectors.ts`.

   User-visible impact:

   - The UI can reliably distinguish "Node executor connected" from "Remote
     Debugger connected".
   - Hosted `/ws/executor/internal` reconnects stay invisible as Remote Debugger
     activity.
   - Future copy can say "Node executor reconnecting" or "Remote Debugger
     disconnected" without ambiguity.

   Risks:

   - `ExecutorSessionRuntime` and `ExecutorSessionState` are exported from
     `packages/app/src/host.tsx`; hosted wrappers may import them from source.
     Keep the migration source-compatible where practical or document the
     breaking change.
   - A partial migration is worse than the current boolean. Do not leave mixed
     target models in product-level UI.
   - The same websocket URL can be intentionally used as different target types
     in tests and edge cases. Target equality must compare both URL and target
     type, not URL alone.

   Verification:

   - Extend `executorSession.test.ts` to assert target type for desktop internal,
     hosted internal, and external debugger sessions, including the contract
     that a matching URL is only reused when the target type also matches.
   - Extend `executionSelectors.test.ts` so every target/status combination
     produces the expected action-bar state.
   - Manually verify hosted Node mode with a custom internal executor URL.

2. DONE - Split durable settings from runtime state.

   Goal: prevent stale session facts from surviving reloads and making an idle
   app look like it still has a debugger or internal executor session.

   What to change:

   - In `packages/app/src/state/execution.ts`, replace
     `remoteDebuggerConfigState` with runtime-owned state for active session
     facts plus a transient render tick.
   - Keep `debuggerDefaultUrlState` in `packages/app/src/state/settings.ts` as
     the durable user preference for the Remote Debugger connect panel.
   - Move `url`, `remoteUploadAllowed`, and active target/classification out of
     persistent storage. They should be derived from the runtime or held in a
     non-persistent atom.
   - Remove `remoteDebuggerConnectionState`; status is runtime-owned.
   - Decide where reactivity lives. The implemented path keeps
     `executorSessionRevisionState`, a transient Jotai render tick that the
     runtime increments on status/capability/target changes. Active session
     snapshots come directly from `runtime.buildSessionState()` and are not
     rebuilt by merging stored config atoms.
   - Update `ExecutorSessionProvider.tsx`, `useExecutorSession.ts`, and
     `useRemoteDebugger.ts` so they no longer merge persistent config with
     runtime status to build active session state.

   User-visible impact:

   - Reloading the app cannot briefly show stale Remote Debugger or Node
     executor information.
   - The Remote Debugger URL field still remembers the user's preferred URL.

   Risks:

   - Existing users may have stale `remoteDebuggerConfig` data in storage. The
     new code should simply ignore that key; no migration UI is needed.
   - If any wrapper relied on persisted `remoteDebuggerConfigState`, it will need
     to switch to runtime state or the explicit debugger default URL.
   - Removing the Jotai write path without adding another reactive state source
     would stop the UI from updating on websocket lifecycle changes. Preserve the
     current render-trigger behavior.

   Verification:

   - Add a unit test for the state builder that proves idle session state is
     runtime-owned and cannot be made active by stale stored config.
   - Manually set old storage values in devtools/local storage and reload the
     app; the action bar should start from idle Browser/Node startup state only.

3. DONE - Add a coordinator hook.

   Goal: centralize product policy so the runtime only owns websocket mechanics
   and one hook owns when Rivet should open, restore, or disconnect a session.

   What to change:

   - Create a coordinator hook, for example
     `packages/app/src/hooks/useExecutorSessionCoordinator.ts`.
   - Keep startup-action selection separate from startup-action execution:
     `getExecutorSessionStartupAction(...)` decides what should happen, and
     `runExecutorSessionStartupAction(...)` performs the connect/disconnect or
     sidecar work and returns the effect cleanup.
   - Move selected-executor startup logic out of `useExecutorSession.ts` into
     the coordinator:
     - Browser mode disconnects the internal executor.
     - Hosted Node mode connects the hosted internal executor URL.
     - Desktop Node mode starts the sidecar and connects the internal desktop
       executor.
     - Plain web app without a hosted internal URL falls back to Browser.
   - Move manual external debugger disconnect restore logic out of
     `useRemoteDebugger.ts` into the coordinator.
   - Move unexpected external debugger drop restore logic out of
     `useExecutorSession.ts` into the coordinator.
   - Keep `useRemoteDebugger.ts` focused on the external debugger command
     surface: open panel, connect external debugger, disconnect external
     debugger.
   - Avoid having the coordinator call `useRemoteDebugger()`. The coordinator
     should use the neutral runtime directly so Remote Debugger hooks do not
     become product-policy dependencies.
   - Keep `executorSession.ts` focused on connect/disconnect/send/reconnect
     transport primitives.
   - Mount the coordinator from `RivetApp.tsx` where `useExecutorSession(...)`
     is currently called.
   - Preserve `useExecutorSessionState()` as a read-only state hook or replace it
     with a clearly named successor such as `useExecutorTransportState()`.

   User-visible impact:

   - Manual Remote Debugger disconnect remains predictable.
   - Unexpected external debugger drops do not reopen the external debugger.
   - Node mode still recovers the internal executor when that is the selected
     executor.

   Risks:

   - The coordinator will touch the highest-risk lifecycle path in the app.
     Sequence the refactor behind tests and avoid changing UI behavior at the
     same time.
   - Sidecar startup/shutdown ordering is easy to regress. Preserve the current
     `attachAndStartExecutorSidecar()` readiness marker behavior.
   - Fire-and-forget hosted executor connects and sidecar cleanup should catch
     failures at the coordinator boundary so invalid hosted URLs or cleanup
     failures do not surface as unhandled promise rejections.

   Verification:

   - Add coordinator tests for hosted Node mode, desktop Node mode, Browser
     mode, plain-web fallback, manual external debugger disconnect, unexpected
     external debugger drop, and selected-executor cleanup/cancellation.
   - Re-run focused executor-session tests and `executionSelectors.test.ts`.
   - Manually verify the hosted-wrapper scenario:
     connect `/ws/latest-debugger`, disconnect/drop it, and confirm only
     `/ws/executor/internal` can return in Node mode.

4. DONE - Expose capabilities instead of protocol details.

   Goal: stop UI and feature code from inspecting raw websocket/session fields
   to decide what the active transport can do.

   Proposed capabilities:

   ```ts
   type ExecutorSessionCapabilities = {
     canSendRun: boolean;
     canUploadProject: boolean;
     canSendAbort: boolean;
     canSendPause: boolean;
     canSendResume: boolean;
     canBridgeDatasets: boolean;
     canRecordSocket: boolean;
   };
   ```

   What to change:

   - In `executorSession.ts`, derive capabilities from active target, status,
     websocket readiness, and protocol messages such as `graph-upload-allowed`.
   - Rename `remoteUploadAllowed` to a neutral capability such as
     `canUploadProject`.
   - Update `useRemoteExecutor.ts` to check capabilities instead of
     `remoteDebugger.sessionState.remoteUploadAllowed`.
   - Update `GentraceInteractors.tsx` to check `canRecordSocket` or a dedicated
     remote-run capability before reading `executorSession.socket`.
   - Keep raw socket access private if possible. If Gentrace still needs it,
     expose a narrow recorder method rather than the socket itself.
   - Keep transport capabilities separate from graph state. For example,
     `canSendAbort` means the active transport can accept an abort command; the
     action bar should still combine it with `graphRunning` before showing or
     enabling Abort.
   - `canBridgeDatasets` depends on both session readiness and whether an app
     dataset provider is available. Do not model it as a target-only capability.

   User-visible impact:

   - Feature availability becomes more consistent across Browser, internal Node
     executor, and external Remote Debugger.
   - The app can disable or hide unsupported actions for the exact active target
     instead of relying on broad session status.

   Risks:

   - Some remote targets may support commands before they advertise upload
     capability. Keep command capability and project-upload capability separate.
   - If raw socket access is removed too quickly, Gentrace recording can break.
   - Renaming `remoteUploadAllowed` without checking every graph upload path can
     accidentally stop external debugger runs from receiving the current project
     and settings.

   Verification:

   - Add capability derivation tests for all target/status combinations.
   - Run remote graph execution in internal Node mode and external debugger mode.
   - Run Gentrace tests or at least exercise its remote path with a fake ready
     session in tests.
   - The reassessed implementation also gates action-time remote graph runs,
     Trivet remote runs, abort/pause/resume commands, and Gentrace recording on
     explicit capabilities. Protocol sends now report whether the message was
     actually written, so pending Trivet runs are rejected if the executor drops
     between the capability check and the send.
   - Gentrace still records the underlying websocket protocol because that is
     what `ExecutionRecorder` consumes, but the socket is accessed through the
     narrow `recordSocketEvents(...)` runtime method instead of through
     `ExecutorSessionState.socket`.

5. DONE - Make UI selectors product-state based.

   Goal: give UI code a small product-level state machine instead of low-level
   websocket status and target fields.

   Proposed state:

   ```ts
   type ExecutorProductState =
     | { type: 'browser-ready' }
     | { type: 'recording-playback-ready' }
     | { type: 'internal-node-starting' }
     | { type: 'internal-node-ready' }
     | { type: 'internal-node-reconnecting' }
     | { type: 'external-debugger-connecting' }
     | { type: 'external-debugger-ready' }
     | { type: 'external-debugger-idle' };
   ```

   What to change:

   - In `packages/app/src/state/selectors/executionSelectors.ts`, add a selector
     that maps selected executor, loaded recording, graph running state, and
     executor session state into a product state.
   - Build `getActionBarExecutionState(...)` on top of that product state.
   - Update `ActionBar.tsx`, `ActionBarMoreMenu.tsx`, and
     `DebuggerConnectPanel.tsx` to consume named product decisions instead of
     duplicating `status !== 'idle' && !isInternalExecutor`.
   - Keep recording playback explicit: loaded recordings should route graph runs
     to the local replay path even when selected executor is Node.
   - Treat external debugger reconnecting as a legacy/impossible state unless a
     future feature deliberately reintroduces external reconnect. The product
     selector should not make external reconnect a normal happy-path state.

   User-visible impact:

   - Run buttons, loading indicators, and Remote Debugger banners become harder
     to desynchronize.
   - The same internal executor state will render consistently in the action bar
     and context menu.

   Risks:

   - If the selector hides too much, feature code may need escape hatches. Keep
     raw runtime state available to low-level hooks, but keep UI on product
     selectors.
   - Recording playback has special routing and must remain covered.
   - The product state should not hide the difference between "external debugger
     is connecting because the user clicked Connect" and "Node executor is
     starting because Node mode is selected." Those states need different copy
     and buttons.

   Verification:

   - Expand `executionSelectors.test.ts` to cover every product state.
   - Add regression cases for recording playback with Node selected.
   - Manually verify Browser mode, hosted Node mode startup, internal reconnect,
     external debugger connected, and external debugger disconnected.
   - The reassessed implementation also treats `canSendRun` as part of product
     readiness. A session with websocket status `ready` but no run-send
     capability remains in a connecting/starting product state, so ActionBar
     readiness and action-time send guards cannot drift.
   - `shouldUseRemoteExecutor(...)` now delegates Browser-mode external
     debugger routing to the product-state selector instead of reimplementing
     the `target + status + capability` check locally.
   - Remote Debugger banner label and pending styling are also selector output,
     so `ActionBar.tsx` no longer reads legacy `reconnecting` flags to decide
     what the banner says.

6. DONE - Add hook-level lifecycle tests.

   Goal: prove the React hook layer applies the runtime rules correctly under
   real subscription/effect timing.

   What to change:

   - Add tests for the new coordinator hook. If a full React hook test harness is
     too heavy, extract the coordinator decisions into pure helpers and add one
     small integration test around the hook.
   - Use a fake `ExecutorSessionRuntime` with observable calls:
     `connectInternal`, `connectExternalDebugger`, `disconnect`,
     `subscribeLifecycle`, and runtime status snapshots.
   - Cover:
     - hosted Node startup connects `hostConfig.internalExecutorUrl`;
     - desktop Node startup waits for sidecar readiness before internal connect;
     - Browser mode disconnects any internal executor;
     - manual external debugger disconnect restores internal Node only when Node
       mode is selected;
     - unexpected external debugger drop never reconnects the external debugger;
     - unexpected external debugger drop restores internal Node only in Node
       mode;
     - internal executor drops use internal reconnect behavior;
     - loaded recording playback does not require a ready Node executor.
     - replacing one target with another rejects pending runs and notifies
       lifecycle subscribers exactly once.

   User-visible impact:

   - No direct UI change, but this protects the most confusing user-facing
     states: disabled Run buttons, surprise Remote Debugger banners, and
     recording playback accidentally running the graph.

   Risks:

   - Tests that mock too much can bless implementation details rather than
     behavior. Prefer assertions on runtime calls and product state.
   - Desktop sidecar tests should not spawn a real sidecar; mock the sidecar
     runtime.

   Verification:

   - Run the focused app hook tests.
   - Run the existing runtime tests and selector tests after each coordinator
     step.
   - The reassessed implementation extracts
     `handleExecutorSessionCoordinatorDisconnect(...)` so the lifecycle
     subscription path is directly testable without a heavy React renderer. The
     tests assert that external debugger disconnect/drop restores the current
     hosted executor URL, does not restore after the latest selected executor is
     Browser, and falls back to desktop internal Node when no hosted URL exists.
     This covers the real stale-render-risk path the hook protects with refs.

7. DONE - Harden async callback boundaries.

   Goal: make the runtime resilient when one subscriber, message handler, or
   dataset provider fails.

   What to change:

   - In `executorSession.ts`, snapshot subscriber sets before iteration:
     `for (const callback of [...onDisconnectCallbacks])`.
   - Wrap lifecycle callbacks, process-message handlers, and the runtime
     `onStateChange` callback in try/catch and log through
     `handleError(..., { toastError: false })`.
   - Treat returned callback promises as part of the same boundary. A subscriber
     that rejects after returning must be logged as a callback failure instead of
     surfacing as an unhandled promise rejection.
   - Wrap `handleDatasetsMessage(...)` and `sendDatasetResponse(...)` so provider
     failures or closed sockets do not become unhandled promise rejections.
   - If a dataset request fails, log request metadata without graph inputs or
     secrets. Only send an error response if the executor protocol is extended in
     `packages/core/src/model/ExecutorProtocol.ts` to support one. The current
     protocol only defines `datasets:response` with a payload.
   - Add a helper for safe websocket send that checks `readyState` and catches
     send failures.

   User-visible impact:

   - Fewer "Unhandled promise rejection" toasts from transport cleanup races.
   - A broken dataset provider or subscriber should not strand Run button state.

   Risks:

   - Swallowing errors too aggressively can hide integration bugs. Log enough
     metadata to diagnose failures without exposing secrets.
   - Do not invent a dataset error response only in the app layer. If error
     responses are needed, define them first in
     `packages/core/src/model/ExecutorProtocol.ts` and update both executor and
     renderer handling together.

   Verification:

   - Add runtime tests where one lifecycle subscriber throws or asynchronously
     rejects and the next still runs.
   - Add process-message handler tests with one throwing or asynchronously
     rejecting handler.
   - Add state-change callback tests for synchronous throws and asynchronous
     rejections.
   - Add dataset request tests for provider rejection and socket close before
     response.
   - Run `git diff --check` and focused app tests.

8. DONE - Treat session replacement as an explicit lifecycle event.

   Goal: make "connect a new target while another session is active" behave like
   an intentional lifecycle transition instead of a silent socket close.

   What to change:

   - In `executorSession.ts`, when `connect...(...)` sees a live current socket
     for a different URL or target, capture the old target and emit a disconnect
     event with a reason such as `replaced`.
   - Treat a non-reusable current socket for the same target as replacement too.
     This covers `CLOSING`/stale socket states where opening a new websocket
     without cleanup would leave old pending graph executions alive.
   - Reject pending remote executions before opening the new socket. Use a clear
     error such as `executor session replaced`.
   - Reset upload/capability state before the new connection starts.
   - Replacement disconnect events should report the post-transition session
     status (`idle`) and the old target. This keeps the event status consistent
     with manual and unexpected disconnect events, which also report the runtime
     state visible to subscribers at notification time.
   - Decide in the coordinator whether replacement is allowed while a graph is
     running. If not allowed, block the connect action and show a precise UI
     message.
   - Add the replacement reason to lifecycle event types and tests.

   User-visible impact:

   - If the user connects a Remote Debugger while Node executor is active, the
     transition remains clean.
   - If a graph is running during replacement, it should either be clearly
     aborted/rejected or the replacement should be blocked.
   - Run buttons should not remain in a stale running/loading state after a
     target switch.

   Risks:

   - Some workflows may currently rely on being able to connect a debugger while
     idle Node mode is connected. Preserve that idle replacement flow.
   - Rejecting pending executions changes behavior for mid-run target switches;
     this is probably correct, but the UI should make it understandable.

   Verification:

   - Add runtime tests for replacing internal with external, external with
     internal, and same-target reconnect/reuse.
   - Add a pending-run replacement test that proves the old pending promise is
     rejected.
   - Add a non-reusable same-target socket test that proves the old pending
     promise is rejected and subscribers receive a `replaced` lifecycle event.
   - Manually test external debugger connect/disconnect while Node mode is
     selected.

## Implemented Coverage and Manual Verification

1. `executorSession.test.ts` now covers explicit target classification for
   desktop internal, hosted internal, and external debugger sessions.
2. `executorSession.test.ts` now covers capability derivation, upload capability
   reset, capability-gated socket recording, protocol-send success reporting,
   session replacement events, pending-run rejection on replacement,
   lifecycle-subscriber failures, process-message subscriber failures, and
   dataset provider rejection handling.
3. `useExecutorSessionCoordinator.test.ts` now covers startup-policy decisions,
   startup-action execution, Browser fallback, hosted Node connect/cleanup,
   desktop sidecar ready connect, cleanup-before-ready cancellation, and the
   external-debugger handoff policy for hosted Node, desktop Node, Browser mode,
   manual disconnect, unexpected disconnect, replacement events, and the
   lifecycle-handler requirement that restores use the latest selected executor
   and hosted executor URL rather than a stale render snapshot.
4. `executionSelectors.test.ts` now covers product-state mapping and the remote
   executor routing rule that Browser mode only uses a run-capable external
   debugger, not a stray internal executor session or a status-ready session
   whose send capability is unavailable.
5. `executorSession.test.ts` now proves idle session state is runtime-owned and
   that consumers are notified when runtime-owned session facts change.
6. The coordinator restore subscription reads the latest selected executor and
   hosted executor URL, so cleanup from an old Node-mode effect cannot restore
   Node after the user has already switched to Browser mode.
7. Manual verification is still recommended for the hosted wrapper path because
   it depends on real proxy/websocket behavior: connect `/ws/latest-debugger`,
   disconnect or drop it, and confirm that only `/ws/executor/internal` can
   return while Node mode is selected.
8. Manual verification is also recommended for desktop Node sidecar startup,
   because the unit tests deliberately do not spawn the real Tauri sidecar.
9. `executorSession.test.ts` now covers websocket construction failure, and the
   runtime clears the attempted target back to idle if construction throws. The
   Remote Debugger command surface catches that failure so a malformed debugger
   URL does not become an unhandled promise rejection or leave stale target
   state behind.

## Bottom Line

The recommended refactor plan is implemented. The executor session now names
its active websocket target explicitly, stores session facts transiently, uses a
single coordinator for reconnect policy, exposes capabilities for feature code,
uses product-state selectors for UI decisions, isolates async callback failures,
and reports target replacement as a first-class lifecycle event.

The remaining naming debt is mostly historical source naming around
`useRemoteDebugger`, retained for the user-facing Remote Debugger command
surface. Active session facts are no longer stored in Remote Debugger config
atoms. New code should prefer the explicit target/capability/product state model
rather than adding more meaning to Remote Debugger booleans.
