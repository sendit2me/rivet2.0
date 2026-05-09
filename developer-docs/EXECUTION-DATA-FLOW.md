# Execution Data Flow and Graph View Identity

> Internal reference for how graph execution, subgraph runs, navigation context,
> and node data storage interact in the desktop app.
>
> This document exists because the interaction between these systems has been
> a recurring source of bugs. Understanding the key mismatch between "how you
> navigated to a graph" and "how execution data was stored for that graph" is
> essential for working in this area.

## Overview

When a graph executes, the app must:

1. Record which graphs ran, how many times, and in what context (root vs subgraph).
2. Store per-node execution data (inputs, outputs, status) tagged with enough identity to filter it later.
3. Let the user navigate to any graph and see the correct execution data for the context they're viewing.
4. Let the user switch between multiple runs of the same graph (the "run switcher").

These four concerns are handled by separate but tightly coupled systems. The coupling
is where bugs tend to hide.

## Key Concept: Graph View Identity

The same graph definition can execute in multiple distinct contexts:

- As a **root graph** (the user clicked "Run" on it directly).
- As a **subgraph** called from node X in parent graph A.
- As a **subgraph** called from node Y in parent graph B.
- As a **subgraph** called from the same node but during different split-run iterations.

Each of these is a different **graph view**. The app tracks views through `GraphViewContext`:

```typescript
// packages/app/src/domain/graphEditing/navigationActions.ts

type GraphViewContext = {
  key: GraphViewKey; // Unique string identifier
  graphId: GraphId; // Which graph definition
  parent?: {
    parentGraphId: GraphId;
    parentNodeId: NodeId;
  };
};
```

### Key formats

| Context    | Key format                                             | `parent`                          |
| ---------- | ------------------------------------------------------ | --------------------------------- |
| Root graph | `root:${graphId}`                                      | `undefined`                       |
| Subgraph   | `subgraph:${parentGraphId}:${parentNodeId}:${graphId}` | `{ parentGraphId, parentNodeId }` |

This distinction matters because execution data is **stored by the key that the
execution engine computes** (always a subgraph key when the graph runs as a subgraph),
but the user may **navigate to that graph using a different key** (a root key, if
they click it in the sidebar).

## The Key Mismatch Problem

This is the single most important thing to understand in this area.

### How execution stores data

When a subgraph executes, the engine emits events with `GraphExecutionMetadata`
that includes an `executor` field:

```typescript
// packages/core/src/model/ProcessContext.ts

type SubgraphExecutorMetadata = {
  nodeId: NodeId; // The subgraph node that invoked this
  parentGraphId: GraphId; // The parent graph
  processId: ProcessId;
  splitIndex?: number; // For split-run: which iteration
};

type GraphExecutionMetadata = {
  rootRunId: RootRunId;
  graphRunId: GraphRunId;
  graphId: GraphId;
  parentGraphRunId?: GraphRunId;
  executor?: SubgraphExecutorMetadata;
};
```

The app converts this metadata into a `GraphViewKey` via `buildGraphViewKeyFromExecution()`:

```typescript
// packages/app/src/utils/executionIdentity.ts

// When executor is present (subgraph execution):
//   key = "subgraph:${parentGraphId}:${nodeId}:${graphId}"
// When executor is absent (root execution):
//   key = "root:${graphId}"
```

This key is used to store **graph run records** in `graphRunHistoryByViewState[key]`.

Per-node data (`ProcessDataForNode`) is tagged with `graphRunId` only, not with
`graphViewKey`. The filtering pipeline uses the resolved `graphRunId` from the run
switcher to select the correct node data for display.

### How navigation creates view context

The user can navigate to a graph in two broad ways:

1. **Sidebar click / Go to Node / most navigation paths**: Creates `createRootGraphViewContext(graphId)`; key is `root:${graphId}`.

2. **Direct Subgraph node navigation**: The Subgraph node header link and
   `"Go to subgraph"` context-menu action both flow through
   `useGoToSubgraphNode(...)`. They create
   `createSubgraphGraphViewContext(...)`; key is
   `subgraph:${parentGraphId}:${nodeId}:${graphId}`.

Only path (2) produces a key that matches the execution-stored key. Path (1) produces
a root key that does **not** match.

### The result

If the user navigates to a subgraph via the sidebar after execution:

- `currentGraphView.key` = `root:${subgraphId}`
- Execution data is stored under `subgraph:${parentId}:${nodeId}:${subgraphId}`
- Direct lookup finds nothing, so no run switcher or node data is displayed

### How this is solved

The mismatch is handled in one place: **`getGraphRunsForView()`** in
`executionSelectors.ts`. When viewing a root context with no direct history matches,
it falls through to a broader search across all history entries matching by `graphId`.
This resolves the correct `graphRunId` values for the current view.

Once the correct `graphRunId` is resolved via the run switcher, all downstream
filtering uses `graphRunId` only:

- **`filterProcessDataForSelection()`** filters node data by `graphRunId`.
- **`setSelectedNodePageLatest()`** matches by `graphId` to decide whether to
  auto-follow the latest execution.

**When modifying `getGraphRunsForView`, preserve its fallback logic.** It is how
the app works for the most common navigation path (sidebar click to view a subgraph
after execution).

## Execution Identity Chain

### How IDs are created

```
User clicks "Run" on main graph
`- GraphProcessor created
   |- rootRunId = nanoid()        // Shared across entire execution tree
   |- graphRunId = nanoid()       // This processor's unique run ID
   |- graphId = main graph ID
   `- executor = undefined        // This is the root
      |
      |- Subgraph node executes
      |  `- #createSubProcessor()
      |     |- rootRunId = inherited from parent
      |     |- graphRunId = nanoid()       // Fresh ID for this subgraph run
      |     |- graphId = subgraph ID
      |     |- parentGraphRunId = parent's graphRunId
      |     `- executor = {
      |          nodeId: subgraph node ID,
      |          parentGraphId: parent graph ID,
      |          processId: ...,
      |          splitIndex: 0              // If split-run
      |        }
      |
      `- Same subgraph node, split iteration 2
         `- #createSubProcessor()
            |- rootRunId = same as above
            |- graphRunId = nanoid()       // Different from iteration 1
            |- parentGraphRunId = same parent
            `- executor.splitIndex = 1
```

### How events flow

Events from subprocessors bubble up through `wireSubprocessorEvents()` in
`SubprocessorBridge.ts`. The key behavior:

- Child processor emits events with **its own** `GraphExecutionMetadata`.
- `wireSubprocessorEvents` forwards those events to the parent's emitter **without rewriting metadata**.
- Subprocessor event/lifecycle forwarding uses a run-scoped lifecycle subscription and only tears down when the forwarded processor's own `graphRunId` finishes, aborts, or errors. A nested child graph finishing must not clean up the parent subgraph bridge, because the parent still needs to forward the subgraph node's later `nodeFinish` and the parent graph's own finish event.
- The app's event handlers see the original metadata and can determine the execution context.

This means the root processor's event emitter receives events from the entire
execution tree, all with correct lineage metadata.

```
SubProcessor emits nodeStart({ execution: { graphRunId: "child-run", ... } })
  `- wireSubprocessorEvents forwards to parentEmitter
     `- parentEmitter.emit('nodeStart', same event)
        `- App handler: onNodeStart(event)
           `- setDataForNode(nodeId, processId, event.execution, data)
              `- Stores with graphRunId from event.execution
```

For **local execution** (`useLocalExecutor`), events are received directly on the
root processor via `attachGraphEvents()`.

For **remote execution** (`useRemoteExecutor`), events arrive as WebSocket messages
from `app-executor`. The sidecar serializes processor events including full
execution metadata; app-only observability messages such as `codeConsole` are
handled separately and are not treated as replayable execution events.
`createProcessEventDispatcher()` deserializes and dispatches processor events to
the same handler functions.

Remote execution is routed through the shared executor-session runtime rather
than through Remote Debugger globals. The runtime exposes an explicit target:

- `internal-desktop`: the desktop/Tauri Node executor sidecar.
- `internal-hosted`: a wrapper-provided internal executor URL from
  `RivetAppHost`'s `executor.internalExecutorUrl`.
- `external-debugger`: a user-connected Remote Debugger endpoint.

Browser execution has no executor-session target. UI code maps the selected
executor, loaded recording state, session target/status, and `canSendRun`
capability into a product state such as `browser-ready`,
`internal-node-ready`, or `external-debugger-ready`. A websocket status of
`ready` is not enough by itself for UI run readiness; the ready product states
also require the active session to be able to send a run command. This prevents
a hosted internal executor reconnect from being displayed as a Remote Debugger
reconnect and keeps the Run buttons aligned with the action-time send guard.

Executor-session target identity is `type + url`, not URL alone. Reconnecting to
the same target reuses the existing websocket when possible, while connecting the
same URL as a different target emits a replacement lifecycle event and resets
capabilities before the new socket opens. If the same target has a stale or
closing websocket that cannot be reused, that handoff also uses the explicit
`replaced` lifecycle path so old pending graph executions are rejected before
the new socket is created. Replacement disconnect events report the old target
and the post-transition `idle` status visible to subscribers.

Transport features are exposed as session capabilities. For example,
`canSendRun` controls whether remote run commands can be sent, `canUploadProject`
replaces older direct `remoteUploadAllowed` checks for project uploads, and
`canRecordSocket` gates Gentrace socket recording. Remote graph execution,
Trivet remote runs, remote user-input replies, preload messages, and remote
abort/pause/resume commands check those capabilities at action time before
sending protocol messages and then verify that the websocket accepted the send.
Gentrace records through `recordSocketEvents(...)`, so feature code no longer
reads the session socket from UI state. Raw socket/status fields are still
available to low-level runtime code and tests, but product UI should use the
selector and capability layer.

Executor-session callbacks are failure-isolated. Lifecycle subscribers,
process-message subscribers, and the renderer state-change callback are invoked
from snapshots, and both synchronous throws and asynchronous promise rejections
are logged without toast notifications. Dataset provider requests also run
behind the same non-toast error boundary and use safe websocket sends, so a
provider failure or closed socket cannot become an unhandled renderer rejection
after the graph execution has already moved on. If websocket construction itself
fails, for example because a typed external debugger URL is malformed, the
runtime clears the attempted target back to idle and the Remote Debugger command
surface reports the connection failure instead of leaving stale session state
behind.

`useExecutorSessionCoordinator` owns connection policy. It starts/restores the
internal Node executor when Node mode is selected, falls back to Browser mode in
plain web contexts without a hosted internal executor URL, and restores only the
internal Node executor after an external Remote Debugger disconnects while Node
mode is selected. `useRemoteDebugger` is limited to the explicit external
debugger command surface. Startup decisions go through
`getExecutorSessionStartupAction(...)`, and side effects go through
`runExecutorSessionStartupAction(...)` so hosted executor connects, Browser
fallback, desktop sidecar readiness, and cleanup-before-ready cancellation all
share one tested path.
The disconnect restore path is tested through
`handleExecutorSessionCoordinatorDisconnect(...)`, which reads the latest
selected executor and hosted executor URL at lifecycle-event time instead of
using the render snapshot that created the subscription.

The runtime owns the current session snapshot. [`executorSessionRevisionState`](../packages/app/src/state/execution.ts)
is only a transient render tick, not a storage-backed source of active URL,
upload permission, connection status, or target classification. The durable
Remote Debugger field is [`debuggerDefaultUrlState`](../packages/app/src/state/settings.ts),
which remembers the default URL shown in the connect panel. `buildSessionState()`
keeps optional legacy parameters for source-level compatibility, but ignores
them; the returned state is always derived from the runtime.

## State Storage

### Graph run history

```typescript
// packages/app/src/state/dataFlow.ts

graphRunHistoryByViewState = atom<Record<GraphViewKey, GraphRunRecord[]>>({});
```

Each `GraphRunRecord` contains:

```typescript
{
  graphRunId: GraphRunId;
  rootRunId: RootRunId;
  graphId: GraphId;
  parentGraphRunId?: GraphRunId;
  executor?: SubgraphExecutorMetadata;
  startedAt?: number;
  finishedAt?: number;
  status?: 'running' | 'ok' | 'error' | 'aborted';
}
```

Records are created in `onGraphStart` and updated in `onGraphFinish`/`onGraphError`/`onGraphAbort`.

On new execution start (`onStart`), all history is cleared (unless running Trivet tests).

### Graph run selection

```typescript
selectedGraphRunByViewState = atom<Record<GraphViewKey, GraphRunSelection>>({});
// where GraphRunSelection = GraphRunId | 'latest'
```

- Defaults to `'latest'` (follow the most recent run).
- Set to a specific `GraphRunId` when the user clicks a historical run in the run switcher.
- When a new run starts for a view, the selection is preserved if it was an explicit
  historical selection. If it was `'latest'` or unset, it stays `'latest'`.

### Per-node execution data

```typescript
lastRunDataByNodeState = atom<Record<NodeId, ProcessDataForNode[]>>({});
```

Each `ProcessDataForNode` contains:

```typescript
{
  processId: ProcessId;
  rootRunId?: RootRunId;
  graphRunId?: GraphRunId;
  graphId?: GraphId;
  data: {
    debugData?: {
      codeSource?: string;
      expressionSource?: string;
      extractObjectPathSource?: string;
      extractObjectPathUsePathInput?: boolean;
      jsListCallbackBodySource?: string;
    };
    inputData?: Record<PortId, StoredDataValue>;
    outputData?: Record<PortId, StoredDataValue>;
    splitOutputData?: Record<number, Record<PortId, StoredDataValue>>;
    status?: { type: 'ok' | 'error' | 'running' | 'interrupted' | 'notRan', ... };
    startedAt?: number;
    finishedAt?: number;
  };
}
```

Data is keyed by `processId` within the node's array. A node can have multiple
entries from different graph runs or split-run iterations.

Most nodes leave `debugData` empty. The current notable exceptions are app-side
presentation/debug affordances: `Code` snapshots `codeSource` so the selected
failed run can highlight the matching editor line, `Expression` snapshots
`expressionSource` for historical `Parsed expression` rendering, `Extract Object
Path` snapshots `extractObjectPathSource` and `extractObjectPathUsePathInput` for
stored-path parsed-source rendering, and `JS Filter` / `JS Map` snapshot
`jsListCallbackBodySource` for their callback parsed-source preview. These
snapshots are stored only in app execution history; they are not part of the core
graph-output contract used by programmatic workflow execution.

`StoredDataValue` is an app-only wrapper around execution payloads:

- small values stay inline as `{ type, storage: 'inline', value }`
- oversized text-like values and media values become `{ type, storage: 'ref', refId, preview }`
- the full payload for ref-backed values lives in the in-memory `globalDataRefs` cache

Execution-scoped ref ids are stable per process and port:

- `execution:${nodeId}:${processId}:input:${portId}`
- `execution:${nodeId}:${processId}:output:${portId}`
- `execution:${nodeId}:${processId}:output:${splitIndex}:${portId}`

This matters because streaming `partialOutput` updates overwrite the same ref entry instead of
allocating a new blob key on every event, and run resets can clear all execution-scoped refs
deterministically.

## Data Filtering for Display

When rendering node output or execution status, the app filters the node's
`ProcessDataForNode[]` array through a two-stage pipeline:

```
All ProcessDataForNode[] for this node
  |
  |- Stage 1: Filter by selected graphRunId
  |  Match: process.graphRunId === resolvedSelectedGraphRunId
  |  OR process.graphRunId is null (legacy/untagged data)
  |  Falls back to showing all data if no match.
  |
  `- Stage 2: Page selection
     Pick entry by page index or 'latest'.
```

The `resolvedSelectedGraphRunId` comes from the run switcher, which uses
`getGraphRunsForView()` to resolve the correct runs for the current view
(handling the key mismatch described above).

This pipeline is implemented across:

- `filterProcessDataForSelection()` in `executionSelectors.ts` (stage 1)
- `getSelectedProcessData()` in `executionSelectors.ts` (stage 2)

The graph selection inputs (`graphRuns` and `selectedGraphRun`) are computed
once via the `resolvedGraphSelectionState` derived atom in `dataFlow.ts` and
shared across all consuming components.

- Consumers: `NodeOutput`, `VisualNode`, `PortInfo`, `WireLayer`, and zoomed-out
  node content.
- `VisualNode` resolves `selectedProcessRun` once from that shared selection state and passes
  it down into `NormalVisualNodeContent` and `ZoomedOutVisualNodeContent` rather than having
  those children resubscribe and recompute the same selection locally.

## The Run Switcher

`GraphExecutionSelectorBar` renders when a graph view has more than one run:

```typescript
const graphRuns = getGraphRunsForView({ currentGraphView, graphRunHistoryByView });

if (!currentGraphView || graphRuns.length <= 1) {
  return null; // No switcher needed
}

// Render prev/next buttons and "Execution: N/M" indicator
```

The control is fixed in the same top canvas row as the main run controls, uses
the same scaled action height, and follows the graph-search panel's dark
bordered surface style. Its stacking order stays below graph search so an open
search panel always wins when the two overlays occupy the same row.

The run switcher updates `selectedGraphRunByViewState[currentGraphView.key]`:

- Moving to the last run sets selection to `'latest'`.
- Moving to any other run sets it to a specific `GraphRunId`.

## Split-Run vs Subgraph Runs

These are related but different concepts:

### Split-run (pager within a single node)

- A node marked `isSplitRun: true` processes array inputs item-by-item.
- All iterations share the same `processId` and `graphRunId`.
- Each iteration's output is stored in `splitOutputData[index]`.
- The UI shows a pager ("page 1 of N") within the node's output panel.
- Split-output renderers sort those indexes numerically through `packages/app/src/components/nodeOutput/splitOutputEntries.ts`; do not rely on object-key order or string sorting for display order.
- This is **not** multiple graph runs; it is one node execution with indexed outputs.

### Subgraph runs (multiple entries in run history)

- A subgraph node creates a child `GraphProcessor` for each invocation.
- Each invocation gets a unique `graphRunId`.
- When combined with split-run (subgraph node is split), you get N subgraph runs.
- The UI shows a run switcher ("1 / N") at the top of the canvas when viewing that subgraph.
- Each run has its own complete set of node execution data.

### Combined scenario

When a split-run subgraph node processes an array of 3 items:

```
Main graph run (graphRunId: "gr-1")
  `- Subgraph node (split-run, 3 iterations)
     |- Iteration 0: subgraph run (graphRunId: "gr-2", splitIndex: 0)
     |- Iteration 1: subgraph run (graphRunId: "gr-3", splitIndex: 1)
     `- Iteration 2: subgraph run (graphRunId: "gr-4", splitIndex: 2)
```

In the main graph view: the subgraph node shows a pager with 3 split outputs.
In the subgraph view: the run switcher shows "1 / 3" and the user can inspect
each iteration's complete internal execution.

## Navigation and View Context

### Navigation stack

```typescript
// packages/app/src/state/graphBuilder.ts

graphNavigationStackState = atom<GraphNavigationStack>({
  stack: GraphViewContext[],
  index?: number
});

// packages/app/src/state/dataFlow.ts

currentGraphViewState = atom((get) => {
  const nav = get(graphNavigationStackState);
  return nav.index != null ? nav.stack[nav.index] : undefined;
});
```

### Navigation paths and their view contexts

| Action                                               | View context created             | Key format                              |
| ---------------------------------------------------- | -------------------------------- | --------------------------------------- |
| Click graph in sidebar                               | `createRootGraphViewContext`     | `root:${graphId}`                       |
| "Go to node" (search)                                | `createRootGraphViewContext`     | `root:${graphId}`                       |
| Back/forward browser buttons                         | Restored from stack              | Whatever was stored                     |
| Subgraph header link / "Go to subgraph" context menu | `createSubgraphGraphViewContext` | `subgraph:${parent}:${node}:${graphId}` |
| Load project                                         | `createRootGraphViewContext`     | `root:${graphId}`                       |

The Subgraph header link and the Subgraph node context-menu action are the
intentional direct Subgraph navigation paths that create a subgraph view
context. Sidebar graph clicks, search "Go to node", project load, and most
other navigation paths create root contexts.

### Viewport per view

The active canvas still renders from `canvasPositionState`, but remembered graph view is
now persisted separately in `projectEditorStateByProjectIdState`.

Important nuance:

- remembered editor view is keyed by `project.metadata.id`, then by `graphId`
- each persisted entry stores both the `GraphNavigationStack` and per-graph canvas positions
- `useSyncCurrentProjectEditorState` mirrors `graphNavigationStackState` and `canvasPositionState`
  into that project-scoped store, so programmatic viewport moves are captured too
- `useRestorePersistedWorkspace` restores the remembered graph/subgraph context and viewport once on
  boot without re-running the full project-load side effects
- `lastCanvasPositionByGraphState` remains as a same-session runtime cache and compatibility
  fallback for graph switching, but it is no longer the authoritative reopen source

Switching between views therefore prefers the current project's persisted canvas positions, then
falls back to the legacy cache, and centers/resets only when neither has a saved viewport.

## Event Handler Registration

### Local execution (`useLocalExecutor`)

```typescript
attachGraphEvents(processor, currentExecution);
// currentExecution comes from useGraphExecutionEvents + useNodeExecutionEvents
```

All events from the entire execution tree arrive on the root processor's emitter
(via SubprocessorBridge forwarding).

### Remote execution (`useRemoteExecutor`)

```typescript
const eventDispatcher = createProcessEventDispatcher(currentExecution);
// WebSocket messages dispatched through eventDispatcher
```

The sidecar serializes events with full metadata. The dispatcher reconstructs
and routes them to the same handler functions.

Local and remote run-from execution now also share the same preload-data derivation helper:

- `getDependentDataForNodeForPreload(...)` in `remoteExecutorHelpers.ts` restores dependency outputs from stored history
- `useLocalExecutor` uses that helper and then calls `processor.preloadNodeData(...)`
- `useRemoteExecutor` uses that same helper and sends the resulting map over the debugger preload message

### Lifecycle

- `onStart`: Clears all run history, run data, and selection state.
- `onGraphStart`: Creates a `GraphRunRecord` in history.
- `onGraphFinish`/`onGraphError`/`onGraphAbort`: Updates the record's status through a shared `finishGraphRun(...)` helper in `useGraphExecutionEvents`.
- `onNodeStart`/`onNodeFinish`/`onNodeExcluded`/`onPartialOutput`/`onNodeError`: Store per-node data.
- `onDone`: Marks graph as no longer running.

Persisted app-side execution payloads now share one transform layer before being cloned into history:

- `sanitizeInputsOrOutputs(...)` in `executionDataTransforms.ts` fixes Uint8Array-shaped values without destructively truncating them
- `storeNodeDataForHistory(...)` / `storeInputsOrOutputsForHistory(...)` decide whether each payload stays inline or moves into `globalDataRefs`
- the storage decision layer treats malformed typed payloads defensively, including string, string-array, and media summary values, so an invalid node output can stay inline for debugging instead of throwing an unhandled UI error while the graph itself has already finished
- downstream UI consumers must preserve that boundary: `RenderDataValue`, Chat Viewer split-prompt lookup, Prompt Designer attached-node hydration, run-cost totals, `Copy value`, and `globalDataRefs` sizing all use the shared runtime guards in `dataValuePayloads.ts` to tolerate malformed inline/ref payloads and render or fall back instead of assuming the static `DataValue` type was honored at runtime
- explicit `{ type: 'any', value: undefined }` output is real display data, not a missing payload. Shared rendering and display-oriented copy should show the literal text `undefined`; explicit `any[]` arrays should apply the same projection to each item. Large ref-backed `any[]` previews and fullscreen-search text should use the same display projection so undefined items stay findable instead of becoming JSON `null`. That projection must stay cycle-safe and fall back through the existing defensive JSON/string path for circular arrays. Absent `DataValue` wrappers, malformed typed payloads, and `control-flow-excluded` remain separate fallback/exclusion cases.
- `globalDataRefs` still uses compact JSON for cache-size fallback accounting; pretty-printing helpers are display-only and should not affect LRU sizing
- `storeNodeDataForHistory(...)` only writes fields that are explicitly present, so start-time payloads such as `inputData` and small debug snapshots survive later finish/error updates instead of being overwritten with `undefined`
- `useNodeExecutionEvents` uses that shared path for started, finished, excluded, and partial-output persistence
- split-run partial outputs still keep their separate `splitOutputData[index]` storage model, but they now reuse the same storage transform and stable ref-id scheme before persistence
- `onStart`, `onTrivetStart`, and node-output clearing paths clear the corresponding execution-scoped refs when they wipe prior run data
- `executionDataTransforms.ts` remains the low-level storage/restore boundary, but app-side read/restore behavior now goes through `executionDataReaders.ts` so UI and executor-preload code share the same displayed-output restore, port-level restore/coercion, and warning extraction logic
- display-oriented `Copy value` serialization now goes through `executionDataCopyValue.ts`, which projects restored outputs into the same plain-value shapes the user sees instead of serializing raw `DataValue` wrappers
- nodes whose visible output shape differs from the raw output port map use `getCopyValueData` projectors from `nodeOutputCopyValueProjectors.ts` so copy behavior stays aligned with the custom output UI
- fullscreen node-output search also depends on the same restore/payload model: generic rendered text is searched from the current fullscreen page DOM through `fullscreenOutputSearch.ts`, while large ref-backed text/JSON-like previews participate through `LargeStoredValuePreview` search providers so search can target the full restored text instead of only the currently visible excerpt
- preload/run-from paths therefore restore ref-backed values back into full `DataValue` payloads through the shared reader layer before passing them to the executor, instead of each consumer hand-rolling `restoreStoredInputsOrOutputs(...)` calls

## Browser vs Remote: Event Delivery and React Rendering

This section documents a critical difference between browser and remote execution
modes that is invisible from the handler code but determines whether the UI
updates during execution. **Getting this wrong causes the app to appear frozen
during browser-mode execution: no running indicators, no dataflow, no progress,
even though all state updates happen correctly (visible only after execution ends).**

### The core problem

React 18 batches all `setState` calls and only commits + paints at **macrotask
boundaries**. The browser's rendering pipeline (style -> layout -> paint ->
composite) runs between macrotasks, never in the middle of a microtask chain.

This distinction is irrelevant for remote execution but critical for browser
execution, because the two modes deliver events on fundamentally different
scheduling boundaries.

### Remote execution: natural macrotask boundaries

In remote/Node execution mode, each event arrives as a separate **WebSocket
message**. The browser delivers each message as its own macrotask:

```
[macrotask] WebSocket message: nodeStart  -> setState -> React commit -> browser paint
[macrotask] WebSocket message: nodeFinish -> setState -> React commit -> browser paint
[macrotask] WebSocket message: nodeStart  -> setState -> React commit -> browser paint
```

Each event gets its own render cycle automatically. No special handling is needed.

Node executor mode is available only in the desktop/Tauri app because it relies
on Tauri's sidecar launcher. When Node mode is selected, the renderer starts the
app-executor sidecar and waits until the sidecar reports that its websocket
server is listening before opening the internal websocket at
`ws://127.0.0.1:21889/internal`. The sidecar binds that internal debugger server
to `127.0.0.1` by default, matching the renderer URL and avoiding localhost
IPv4/IPv6 resolution mismatches. Hosted wrappers that run the executor in a
container can override the bind address with `--host` or `RIVET_EXECUTOR_HOST`,
and can override the default port with `--port` / `-p` or `RIVET_EXECUTOR_PORT`;
custom ports must be valid TCP ports from `1` to `65535`. The desktop app keeps
the loopback default. If the plain web app loads a stale
persisted Node executor preference, it resets to Browser mode instead of
attempting an internal sidecar connection that cannot be created in a normal
browser.

If the user connects an external remote debugger while Node executor mode is
selected, that external websocket temporarily replaces the internal sidecar
session. Manual remote-debugger disconnect must restore the internal Node
executor session immediately when Node mode is still selected, using
`executor.internalExecutorUrl` in hosted shells or
`ws://127.0.0.1:21889/internal` in Tauri, so the Run button becomes usable again
without requiring a Browser -> Node mode toggle.

Hosted executor URLs are still internal executor sessions: callers must connect
them through `executorSession.connectInternalHostedExecutor(...)` or the
compatibility `connectInternal(...)` wrapper, not through the external
remote-debugger `connectExternalDebugger(...)` path, so ActionBar/debugger UI
does not mistake the hosted executor for a user-attached remote debugger.

Hosted wrappers that mount the editor through
[`RivetAppHost`](../packages/app/src/host.tsx) can opt back into Node executor
mode in a browser shell by passing `executor.internalExecutorUrl`. In that mode
the shared executor-session coordinator connects to the provided websocket URL
directly and skips Tauri sidecar start/stop ownership; all
run/upload/message handling continues through the same `useRemoteExecutor` and
executor-session runtime as the desktop app.

`executor.internalExecutorUrl` is also a UI/session classification contract. A
hosted executor URL connected as `internal-hosted` is treated as the active
internal Node executor, so manual remote-debugger disconnect restores that
session and the ActionBar keeps Node-mode run controls in an explicit disabled
loading state only while the internal executor is genuinely connecting. Hosted
internal executor reconnects must preserve that internal classification after
proxy, server, or idle websocket closes; otherwise `/ws/executor/internal` can
be misrepresented as a user-attached remote debugger. External remote debuggers
should continue to use the public `connectExternalDebugger(...)` path, and
remote-debugger UI should only show disconnect affordances for external-debugger
sessions.

The app-executor sidecar treats graph failures as request-scoped execution
events rather than process/session failures. If a dynamic run throws because a
node fails, provider setup fails, or plugin assembly fails, the sidecar sends an
`error` protocol message with the active request id, detaches that processor
from the debugger server, and keeps the websocket connection alive. The app can
then clear `graphRunningState` through the normal remote event dispatcher
without forcing the user to reconnect the Node executor.
The ActionBar intentionally keeps Node-mode Run controls rendered while the
internal sidecar is starting, connecting, or reconnecting; readiness only moves
the button into a disabled loading state that keeps its normal text and swaps
the action glyph for the same ring indicator used by running node headers, it
must not collapse the control or make a handled node failure look like the
executor UI disappeared.
The app logs the internal Node executor lifecycle at the sidecar/session seam.
Sidecar spawn, readiness marker vs timeout fallback, socket close/reconnect
scheduling, disconnect requests, and skipped run attempts are runtime debug logs
gated by `rivet.debugRuntimeLogs`. These logs intentionally describe the phase
and internal/external target, not full graph input values or secrets.
Automatic reconnect is restricted to internal executor sessions. A user-attached
external Remote Debugger websocket that closes unexpectedly is not reopened by
Rivet itself. If Node executor mode is selected, the app shell may restore only
the internal Node executor session; Browser mode waits for an explicit Remote
Debugger Connect action. This keeps an open project from suddenly reopening a
remote debugger socket by itself.

The renderer does not treat app-executor stderr as an execution-state signal.
The sidecar can write expected Node warnings or logged provider failures to
stderr while still delivering the request-scoped websocket `error` event. The
renderer records stdout/stderr byte counts as debug telemetry only; run state is
driven by `start`, `done`, `abort`, and `error` protocol messages.
The app-executor also logs top-level unhandled promise rejections and uncaught
exceptions. Startup-phase top-level failures still terminate the sidecar, while
late provider/stream failures after websocket startup are recorded without
terminating the sidecar after a graph failure has already been reported through
the normal request-scoped protocol.

The desktop app's internal Node sidecar also uses an app-executor-only
worker-backed `CodeRunner` for most Code-node JavaScript. That keeps the sidecar
event loop free to process independent nodes and emit their `nodeFinish` events
while an unrelated synchronous Code node is still running. This does not change
the public `@valerypopoff/rivet2-node` default runner, and Code nodes that request the
`Rivet` capability may still run on the sidecar's current thread for
compatibility.

Code-node `console` output in Node executor mode is an executor-session message,
not sidecar stdout. When the node's console permission is enabled, the
app-executor runner sends `codeConsole` messages for `debug`, `info`, `log`,
`warn`, and `error`; [`useRemoteExecutor`](../packages/app/src/hooks/useRemoteExecutor.ts)
only replays messages for the active editor run into the renderer console.

Code-node `require()` resolution has a stable hosted-runtime seam. Public
`NodeCodeRunner` and the app-executor worker runner default to resolving from the
process working directory, but `RIVET_CODE_RUNNER_REQUIRE_ROOT` can point them at
a runtime-library directory and `RIVET_CODE_RUNNER_REQUIRE_ANCHOR` can provide a
fully custom `.cjs` anchor path. This keeps hosted wrappers from patching runner
source while preserving the programmatic default for normal `@valerypopoff/rivet2-node`
callers.
For app-executor hosted runtimes, a bootstrap layer may also install
`globalThis.__RIVET_PREPARE_RUNTIME_LIBRARIES__`. The worker runner invokes that
hook before require-enabled or Rivet-capable Code nodes run, so hosted wrappers
can synchronize managed runtime-library artifacts just before module resolution
without rewriting Rivet's runner source.

### Browser execution: microtask avalanche

In browser execution mode, `GraphProcessor` runs in the same thread as React.
The processor uses **Emittery** for event emission and **PQueue** for node
processing concurrency. Both of these schedule work as **microtasks**:

- **Emittery's `emit()`** has `await resolvedPromise` before calling listeners,
  which defers all listener invocations to microtasks.
- **PQueue** chains node processing as further microtask continuations.

The result is that dozens or hundreds of events fire within the same macrotask,
with React batching all their `setState` calls. The browser never gets a chance
to repaint until the entire graph execution completes:

```
[macrotask] processGraph() starts
  [microtask] emit nodeStart  -> setState (batched, not committed)
  [microtask] emit nodeFinish -> setState (batched, not committed)
  [microtask] emit nodeStart  -> setState (batched, not committed)
  ... hundreds more microtasks ...
  [microtask] emit done       -> setState (batched, not committed)
[macrotask boundary] -> React commits ALL state -> browser paints ONCE
```

The user sees nothing change until execution is complete, then everything appears
at once.

### The solution: macrotask yielding

The fix has two parts that must work together:

**1. GraphProcessor must `await` its emits** (`GraphProcessor.ts`)

For `nodeStart` and `nodeFinish`, the processor uses `await this.#emitter.emit()`
instead of `emitDetached()`. This makes the processor pause until all listeners
have completed, which is necessary for the yield to actually pause processing.

```typescript
// In #processNormalNode:
await this.#emitter.emit('nodeStart', ...);   // processor waits for listeners
// ... node processes ...
await this.#emitter.emit('nodeFinish', ...);  // processor waits again
```

Note: `emitDetached()` (which calls `void emitter.emit()`) is fire-and-forget:
the processor continues immediately regardless of what listeners do. With
`emitDetached`, a listener's `await yieldToMacrotask()` would pause only that
listener, not the processor. The processor would race ahead, emitting more events
before any yield completes.

**2. Local executor handlers must yield to the macrotask queue** (`useLocalExecutor.ts`)

Key event handlers (`nodeStart`, `nodeFinish`, `start`, `graphStart`) are async
and yield to the macrotask queue after updating state:

```typescript
function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(undefined);
  });
}

processor.on('nodeStart', async (data) => {
  currentExecution.onNodeStart(data); // setState calls (batched by React)
  await yieldToMacrotask(); // pause -> React commits -> browser paints
});
```

`MessageChannel` posts a macrotask with near-zero latency (unlike `setTimeout(0)`
which has a >=4 ms minimum in browsers). The returned Promise resolves on the next
macrotask, which means:

1. The handler calls `setState` (React batches it).
2. `await yieldToMacrotask()` suspends the handler.
3. Since Emittery `await`s listener Promises, and the processor `await`s
   `emit()`, the entire processing chain is paused.
4. The microtask queue drains. The macrotask ends.
5. **React commits the batched state.** The browser paints.
6. The `MessageChannel` macrotask fires, resolving the Promise.
7. The handler resumes, Emittery resumes, and the processor continues.

### Why `flushSync` doesn't work

`flushSync` (from `react-dom`) forces React to synchronously commit state, but
it does **not** trigger a browser repaint. The browser repaint only happens at
macrotask boundaries. Since Emittery defers listeners to microtasks, even with
`flushSync` the DOM updates happen but the browser never paints them; the next
microtask (next event) starts before the browser can composite a frame.

### Subgraph event propagation

`wireSubprocessorEvents` in `SubprocessorBridge.ts` forwards child processor
events to the parent emitter by returning the Promise from
`parentEmitter.emit()`:

```typescript
processor.on('nodeStart', (event) => parentEmitter.emit('nodeStart', event));
//                                  ^ returns Promise
```

Because the child processor `await`s its own `emit()` calls, and those listeners
return the Promise from `parentEmitter.emit()`, and the parent's listeners yield
to macrotask, the pause propagates through the entire subprocessor tree. A
macrotask yield in a top-level handler pauses child processors too.

### Why only some events yield

Not all events need macrotask yields:

- **`nodeStart`, `nodeFinish`**: High-frequency events that drive running
  indicators and dataflow display. Must yield.
- **`start`, `graphStart`**: Set up initial execution context. Yielding here
  ensures the UI shows "running" state before node processing begins.
- **`nodeError`, `done`, `abort`, etc.**: Terminal or infrequent events. By the
  time they fire, either the graph is finishing (one final paint is sufficient)
  or there is an error state. No yield needed.

## Stale Closures in Browser Execution Handlers

### The problem

In browser execution mode, `attachGraphEvents()` in `useLocalExecutor` registers
event handlers **once** when the processor is created. These handlers close over
values from the render cycle in which `attachGraphEvents` was called.

In contrast, remote execution mode uses `useEffect` with a dependency array that
causes re-subscription on every relevant render, so handlers always have fresh
closure values.

This means any value captured by closure in a browser-mode handler will be stale
if it changes during execution. The most important case is
`setSelectedNodePageLatest` in `useExecutionDataFlow.ts`, which reads
`currentGraphView` and `selectedGraphRunByView` to decide whether to auto-follow
the latest execution page.

### The solution: `useLatest` refs

Values that must be current when read inside event handlers are wrapped with
`useLatest` (from `ahooks`), which stores the value in a ref that is updated on
every render:

```typescript
const currentGraphViewLatest = useLatest(currentGraphView);
const selectedGraphRunByViewLatest = useLatest(selectedGraphRunByView);

const setSelectedNodePageLatest = (nodeId, execution) => {
  const view = currentGraphViewLatest.current; // always fresh
  const selectionByView = selectedGraphRunByViewLatest.current; // always fresh
  // ...
};
```

This is safe because `setSelectedNodePageLatest` is only called from event
handlers (microtasks), and React updates refs synchronously during the commit
phase of the previous render, so by the time a handler reads the ref, it
reflects the latest committed state.

### When to use `useLatest` vs direct closure

- **Jotai `useSetAtom` setters** (e.g., `setLastRunData`): Safe to capture in
  closure. The setter identity is stable and functional updates (`prev => ...`)
  always receive the latest state.
- **Jotai `useAtomValue` values** (e.g., `currentGraphView`): Stale in
  long-lived handlers. Use `useLatest` if the handler needs the current value.
- **Callback refs from `useStableCallback`**: Already use refs internally, so
  they always call the latest version of the callback. Safe to capture.

## Recording and Replay

Execution recordings capture the full event stream so it can be replayed later
with the same data flow behavior as a live run.

### Recording (`ExecutionRecorder`)

`ExecutionRecorder` subscribes to every event on a `GraphProcessor` (or WebSocket
channel) and serializes each event into a `RecordedEvents` array. The key detail
is that **execution metadata is preserved in each recorded event** via the
`withExecution()` helper; every graph-level and node-level event records its
`GraphExecutionMetadata` alongside the event data.

```typescript
// packages/core/src/recording/ExecutionRecorder.ts

// Each event is serialized with its execution metadata intact:
nodeStart: ({ node, inputs, processId, execution }) => withExecution({
  nodeId: node.id,
  inputs,
  processId,
}, execution),
```

Recorded event types mirror `ProcessEvents` but replace runtime objects with
serializable identifiers (e.g. `node: ChartNode` -> `nodeId: NodeId`,
`graph: NodeGraph` -> `graphId: GraphId`). The full type mapping is in
`RecordedEventsMap` (`RecordedEvents.ts`).

Recordings are serialized to `.rivet-recording` files with asset deduplication
(Uint8Arrays -> base64) and string deduplication (long strings -> FNV-1a hash
references).

### Replay (`replayExecutionRecording`)

`RecordingPlayer.ts` replays a recording by iterating the `RecordedEvents` array
and re-emitting each event on a provided `Emittery<ProcessEvents>` emitter. This
means the app's standard event handlers (`onNodeStart`, `onGraphStart`, etc.)
receive the same events during replay as during live execution.

In the desktop app, replay is intentionally routed through the local executor
path even when the selected live executor is Node. The ActionBar's `Play
Recording` button still delegates to `useGraphExecutor`, but
`shouldUseRemoteExecutor(...)` treats `loadedRecordingState` as a local replay
override, and the ActionBar keeps playback enabled without waiting for the Node
sidecar. Remote/app-executor sessions only run live graphs; they do not receive
a `run` protocol message for recording playback. This override is scoped to
graph playback and playback controls, so live features such as Trivet tests keep
using the selected executor while a recording is loaded. The app blocks
recording load/unload while an execution is active, which keeps the playback
override stable for the lifetime of the run and prevents Abort/Pause/Resume from
switching executor targets mid-run.

The critical design point is **execution metadata parity**: replay emits events
with the same `GraphExecutionMetadata` that was recorded, so:

- `graphRunHistoryByView` gets populated with the same view keys.
- `lastRunDataByNodeState` entries get the same `graphRunId` tags.
- The run switcher and data filtering work identically to live execution.

### Legacy recording fallback

Recordings made before execution metadata was added do not have `execution` fields
on their events. `RecordingPlayer` handles this with `getExecution()`:

```typescript
// packages/core/src/model/RecordingPlayer.ts

const legacyRootRunId = nanoid() as RootRunId;
const legacyGraphRunsByGraphId = new Map<GraphId, GraphRunId>();

const getExecution = (graphId: GraphId, recordedExecution?: GraphExecutionMetadata): GraphExecutionMetadata => {
  if (recordedExecution) {
    return recordedExecution; // New recording; use as-is
  }

  // Legacy recording; synthesize consistent IDs per graphId
  let graphRunId = legacyGraphRunsByGraphId.get(graphId);
  if (!graphRunId) {
    graphRunId = nanoid() as GraphRunId;
    legacyGraphRunsByGraphId.set(graphId, graphRunId);
  }

  return { graphId, graphRunId, rootRunId: legacyRootRunId };
};
```

This ensures legacy recordings produce stable synthetic `graphRunId` values per
graph (the same `graphId` always maps to the same `graphRunId` within a replay),
while new recordings use the original metadata verbatim.

### Event coverage

All event types relevant to data flow are replayed:

| Event                                       | Effect on app state                                 |
| ------------------------------------------- | --------------------------------------------------- |
| `start`                                     | Clears history, sets context values and inputs      |
| `graphStart`                                | Creates `GraphRunRecord` in history                 |
| `graphFinish` / `graphError` / `graphAbort` | Updates run record status                           |
| `nodeStart` / `nodeFinish` / `nodeError`    | Stores per-node execution data                      |
| `nodeExcluded`                              | Stores excluded status                              |
| `partialOutput`                             | Stores streaming/split-run output                   |
| `nodeOutputsCleared`                        | Removes node data entries                           |
| `done`                                      | Sets final outputs, marks not running               |
| `userInput`                                 | Replays user input prompt (callback is `undefined`) |
| `globalSet`                                 | Replays global variable changes                     |

Chat nodes get an artificial delay (`recordingPlaybackChatLatency`) during replay
to simulate streaming behavior.

### Recording options

`ExecutionRecorderOptions` controls what is captured:

- `includePartialOutputs` (default `false`): Whether to record `partialOutput` events. Excluded by default to reduce recording size.
- `includeTrace` (default `false`): Whether to record `trace` events.

These same events are simply skipped during recording; replay handles their
absence gracefully since the final `nodeFinish` event contains the complete outputs.

## File Reference

| File                                                                                                     | Role                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`navigationActions.ts`](../packages/app/src/domain/graphEditing/navigationActions.ts)                   | `GraphViewContext` types, `createRootGraphViewContext`, `createSubgraphGraphViewContext`                                                                  |
| [`executionIdentity.ts`](../packages/app/src/utils/executionIdentity.ts)                                 | `buildGraphViewKeyFromExecution` - converts execution metadata to view key (used only for graph-level events)                                             |
| [`dataFlow.ts`](../packages/app/src/state/dataFlow.ts)                                                   | Core atoms: `currentGraphViewState`, `graphRunHistoryByViewState`, `selectedGraphRunByViewState`, `lastRunDataByNodeState`, `resolvedGraphSelectionState` |
| [`executionSelectors.ts`](../packages/app/src/state/selectors/executionSelectors.ts)                     | `getGraphRunsForView`, `filterProcessDataForSelection`, `getSelectedProcessData`, `getGraphSelectionOptions`, executor product-state and ActionBar routing selectors |
| [`useExecutionDataFlow.ts`](../packages/app/src/hooks/useExecutionDataFlow.ts)                           | `setDataForNode`, `setSelectedNodePageLatest` - writes execution data to state                                                                            |
| [`useGraphExecutionEvents.ts`](../packages/app/src/hooks/useGraphExecutionEvents.ts)                     | Graph-level event handlers: `onStart`, `onGraphStart`, `onGraphFinish`, `onDone`                                                                          |
| [`useNodeExecutionEvents.ts`](../packages/app/src/hooks/useNodeExecutionEvents.ts)                       | Node-level event handlers: `onNodeStart`, `onNodeFinish`, `onPartialOutput`, `onNodeError`                                                                |
| [`useLocalExecutor.ts`](../packages/app/src/hooks/useLocalExecutor.ts)                                   | Browser-mode execution orchestration                                                                                                                      |
| [`executorSession.ts`](../packages/app/src/hooks/executorSession.ts)                                     | Shared websocket runtime: target classification, reconnect policy, capabilities, pending remote-run promises, lifecycle events, and dataset bridge handling |
| [`useExecutorSessionCoordinator.ts`](../packages/app/src/hooks/useExecutorSessionCoordinator.ts)         | Product policy for Browser/hosted Node/desktop Node startup, cleanup, sidecar readiness, and external-debugger handoff restoration                         |
| [`useExecutorSession.ts`](../packages/app/src/hooks/useExecutorSession.ts)                               | Read-only executor-session snapshot hook plus compatibility exports for coordinator helpers                                                                |
| [`useRemoteDebugger.ts`](../packages/app/src/hooks/useRemoteDebugger.ts)                                 | External Remote Debugger command/subscription surface; does not own Node executor restoration policy                                                       |
| [`useRemoteExecutor.ts`](../packages/app/src/hooks/useRemoteExecutor.ts)                                 | Remote graph/test execution over the shared session; sends protocol messages only after action-time capability checks                                      |
| [`remoteExecutorHelpers.ts`](../packages/app/src/hooks/remoteExecutorHelpers.ts)                         | `createProcessEventDispatcher` - routes WebSocket messages to handlers                                                                                    |
| [`GraphProcessor.ts`](../packages/core/src/model/GraphProcessor.ts)                                      | Core execution engine, `#createSubProcessor`, `#buildExecutionMetadata`                                                                                   |
| [`SubprocessorBridge.ts`](../packages/core/src/model/SubprocessorBridge.ts)                              | `wireSubprocessorEvents` - forwards child events to parent emitter                                                                                        |
| [`SplitRunProcessor.ts`](../packages/core/src/model/SplitRunProcessor.ts)                                | `processSplitRunNode` - iterates split inputs, creates subprocessors per iteration                                                                        |
| [`ProcessContext.ts`](../packages/core/src/model/ProcessContext.ts)                                      | `GraphExecutionMetadata`, `SubgraphExecutorMetadata` type definitions                                                                                     |
| [`GraphExecutionSelectorBar.tsx`](../packages/app/src/components/GraphExecutionSelectorBar.tsx)          | Run switcher UI component                                                                                                                                 |
| [`useGoToNode.ts`](../packages/app/src/hooks/useGoToNode.ts)                                             | Navigation to node - creates root view context                                                                                                            |
| [`useGoToSubgraphNode.ts`](../packages/app/src/hooks/useGoToSubgraphNode.ts)                             | Shared direct Subgraph navigation used by the header link and context menu                                                                                |
| [`useGraphBuilderContextMenuHandler.ts`](../packages/app/src/hooks/useGraphBuilderContextMenuHandler.ts) | Context-menu dispatch for "Go to subgraph"                                                                                                                |
| [`ExecutionRecorder.ts`](../packages/core/src/recording/ExecutionRecorder.ts)                            | Records execution events with metadata, serializes to `.rivet-recording`                                                                                  |
| [`RecordedEvents.ts`](../packages/core/src/recording/RecordedEvents.ts)                                  | `RecordedEventsMap` type definitions - serializable mirror of `ProcessEvents`                                                                             |
| [`RecordingPlayer.ts`](../packages/core/src/model/RecordingPlayer.ts)                                    | `replayExecutionRecording` - replays recorded events through the same emitter/handler pipeline                                                            |

## Debugging Checklist

When execution data is not showing up for a graph:

1. **Check `currentGraphView.key`** - is it `root:` or `subgraph:`?
2. **Check `graphRunHistoryByView` keys** - what keys have run records?
3. **Do the keys match?** If not, `getGraphRunsForView()` should fall back to
   a broader search by `graphId`. Check that this fallback is finding runs.
4. **Check `ProcessDataForNode.graphRunId`** for the node - does it match a
   run in the resolved graph runs list?
5. **Check that events are being forwarded** - is `wireSubprocessorEvents` wiring the event type you expect?
6. **Check `filterProcessDataForSelection`** - is it filtering to the correct `graphRunId`?
7. **For remote execution** - check that the sidecar serializes the event type and that `createProcessEventDispatcher` maps it.

When execution data appears only _after_ execution completes (no live updates):

8. **Browser mode only?** If the problem is exclusive to browser mode but works
   in Node mode, see "Browser vs Remote: Event Delivery and React Rendering"
   above. The most likely cause is that event handlers are not yielding to the
   macrotask queue, preventing React from committing intermediate state.
9. **Check `emitDetached` vs `await emit()`** - if a new event type is added
   to `GraphProcessor` and uses `emitDetached`, its listeners cannot pause the
   processor. If that event needs live UI updates, change it to `await emit()`.
10. **Check for stale closure values** - if a handler reads a value that was
    correct at registration time but wrong at call time, see "Stale Closures in
    Browser Execution Handlers" above. Use `useLatest` for values captured by
    long-lived handlers in `attachGraphEvents`.
