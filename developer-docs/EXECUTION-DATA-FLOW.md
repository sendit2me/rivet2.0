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
  key: GraphViewKey;      // Unique string identifier
  graphId: GraphId;       // Which graph definition
  parent?: {
    parentGraphId: GraphId;
    parentNodeId: NodeId;
  };
};
```

### Key formats

| Context | Key format | `parent` |
|---------|-----------|----------|
| Root graph | `root:${graphId}` | `undefined` |
| Subgraph | `subgraph:${parentGraphId}:${parentNodeId}:${graphId}` | `{ parentGraphId, parentNodeId }` |

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
  nodeId: NodeId;           // The subgraph node that invoked this
  parentGraphId: GraphId;   // The parent graph
  processId: ProcessId;
  splitIndex?: number;      // For split-run: which iteration
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

This key is used to store:
- **Graph run records** in `graphRunHistoryByViewState[key]`
- **Node data** in each `ProcessDataForNode.graphViewKey`

### How navigation creates view context

The user can navigate to a graph in two ways:

1. **Sidebar click / Go to Node / most navigation paths**: Creates `createRootGraphViewContext(graphId)` → key is `root:${graphId}`.

2. **"Go to subgraph" context menu on a subgraph node**: Creates `createSubgraphGraphViewContext(...)` → key is `subgraph:${parentGraphId}:${nodeId}:${graphId}`.

Only path (2) produces a key that matches the execution-stored key. Path (1) produces
a root key that does **not** match.

### The result

If the user navigates to a subgraph via the sidebar after execution:

- `currentGraphView.key` = `root:${subgraphId}`
- Execution data is stored under `subgraph:${parentId}:${nodeId}:${subgraphId}`
- Direct lookup finds nothing → no run switcher, no node data displayed

### How this is solved

Three places implement fallback logic for this mismatch:

1. **`getGraphRunsForView()`** in `executionSelectors.ts`: When viewing a root context
   with no direct matches, falls through to a broader search across all history entries
   matching by `graphId`.

2. **`filterProcessDataForSelection()`** in `executionSelectors.ts`: When the exact
   `graphViewKey` filter produces no results, falls back to filtering by `graphId`.

3. **`setSelectedNodePageLatest()`** in `useExecutionDataFlow.ts`: Matches by
   `graphId` in addition to exact `graphViewKey` when deciding whether to auto-follow
   the latest execution.

**When modifying any of these systems, preserve these fallbacks.** They are not
optional compatibility shims — they are how the app works for the most common
navigation path (sidebar click to view a subgraph after execution).

## Execution Identity Chain

### How IDs are created

```
User clicks "Run" on main graph
└─ GraphProcessor created
   ├─ rootRunId = nanoid()        // Shared across entire execution tree
   ├─ graphRunId = nanoid()       // This processor's unique run ID
   ├─ graphId = main graph ID
   └─ executor = undefined        // This is the root
      │
      ├─ Subgraph node executes
      │  └─ #createSubProcessor()
      │     ├─ rootRunId = inherited from parent
      │     ├─ graphRunId = nanoid()       // Fresh ID for this subgraph run
      │     ├─ graphId = subgraph ID
      │     ├─ parentGraphRunId = parent's graphRunId
      │     └─ executor = {
      │          nodeId: subgraph node ID,
      │          parentGraphId: parent graph ID,
      │          processId: ...,
      │          splitIndex: 0              // If split-run
      │        }
      │
      └─ Same subgraph node, split iteration 2
         └─ #createSubProcessor()
            ├─ rootRunId = same as above
            ├─ graphRunId = nanoid()       // Different from iteration 1
            ├─ parentGraphRunId = same parent
            └─ executor.splitIndex = 1
```

### How events flow

Events from subprocessors bubble up through `wireSubprocessorEvents()` in
`SubprocessorBridge.ts`. The key behavior:

- Child processor emits events with **its own** `GraphExecutionMetadata`.
- `wireSubprocessorEvents` forwards those events to the parent's emitter **without rewriting metadata**.
- The app's event handlers see the original metadata and can determine the execution context.

This means the root processor's event emitter receives events from the entire
execution tree, all with correct lineage metadata.

```
SubProcessor emits nodeStart({ execution: { graphRunId: "child-run", ... } })
  └─ wireSubprocessorEvents forwards to parentEmitter
     └─ parentEmitter.emit('nodeStart', same event)
        └─ App handler: onNodeStart(event)
           └─ setDataForNode(nodeId, processId, event.execution, data)
              └─ Stores with graphViewKey derived from event.execution
```

For **local execution** (`useLocalExecutor`), events are received directly on the
root processor via `attachGraphEvents()`.

For **remote execution** (`useRemoteExecutor`), events arrive as WebSocket messages
from `app-executor`. The sidecar serializes all events including full execution
metadata. `createProcessEventDispatcher()` deserializes and dispatches to the same
handler functions.

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
  graphViewKey?: GraphViewKey;
  data: {
    inputData?: Record<PortId, DataValue>;
    outputData?: Record<PortId, DataValue>;
    splitOutputData?: Record<number, Record<PortId, DataValue>>;
    status?: { type: 'ok' | 'error' | 'running' | 'interrupted' | 'notRan', ... };
    startedAt?: number;
    finishedAt?: number;
  };
}
```

Data is keyed by `processId` within the node's array. A node can have multiple
entries from different graph runs or split-run iterations.

## Data Filtering for Display

When rendering node output or execution status, the app filters the node's
`ProcessDataForNode[]` array through a multi-stage pipeline:

```
All ProcessDataForNode[] for this node
  │
  ├─ Stage 1: Filter by graphViewKey
  │  Match: process.graphViewKey === currentGraphView.key
  │  OR process.graphViewKey is null (legacy/untagged data)
  │
  ├─ Stage 1b: Fallback by graphId (if Stage 1 found nothing)
  │  Match: process.graphId === currentGraphView.graphId
  │  This handles the key mismatch described above.
  │
  ├─ Stage 2: Filter by selected graphRunId
  │  Match: process.graphRunId === resolvedSelectedGraphRunId
  │  Falls back to showing all compatible data if no match.
  │
  └─ Stage 3: Page selection
     Pick entry by page index or 'latest'.
```

This pipeline is implemented across:

- `filterProcessDataForSelection()` in `executionSelectors.ts` (stages 1-2)
- `getSelectedProcessData()` in `executionSelectors.ts` (stage 3)

Consumers: `NodeOutput`, `VisualNode`, `PortInfo`, `WireLayer`, and zoomed-out
node content.

## The Run Switcher

`GraphExecutionSelectorBar` renders when a graph view has more than one run:

```typescript
const graphRuns = getGraphRunsForView({ currentGraphView, graphRunHistoryByView });

if (!currentGraphView || graphRuns.length <= 1) {
  return null; // No switcher needed
}

// Render prev/next buttons and "N / M" indicator
```

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
- This is **not** multiple graph runs — it's one node execution with indexed outputs.

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
  └─ Subgraph node (split-run, 3 iterations)
     ├─ Iteration 0: subgraph run (graphRunId: "gr-2", splitIndex: 0)
     ├─ Iteration 1: subgraph run (graphRunId: "gr-3", splitIndex: 1)
     └─ Iteration 2: subgraph run (graphRunId: "gr-4", splitIndex: 2)
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

| Action | View context created | Key format |
|--------|---------------------|------------|
| Click graph in sidebar | `createRootGraphViewContext` | `root:${graphId}` |
| "Go to node" (search) | `createRootGraphViewContext` | `root:${graphId}` |
| Back/forward browser buttons | Restored from stack | Whatever was stored |
| "Go to subgraph" context menu | `createSubgraphGraphViewContext` | `subgraph:${parent}:${node}:${graphId}` |
| Load project | `createRootGraphViewContext` | `root:${graphId}` |

The "Go to subgraph" context menu is the **only** navigation path that creates
a subgraph view context. All other paths create root contexts.

### Viewport per view

Each graph view remembers its own canvas position in `lastCanvasPositionByGraphState`.
Switching between views restores the saved viewport, or centers the view if no
position was saved.

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

### Lifecycle

- `onStart`: Clears all run history, run data, and selection state.
- `onGraphStart`: Creates a `GraphRunRecord` in history.
- `onGraphFinish`/`onGraphError`/`onGraphAbort`: Updates the record's status.
- `onNodeStart`/`onNodeFinish`/`onPartialOutput`/`onNodeError`: Stores per-node data.
- `onDone`: Marks graph as no longer running.

## Recording and Replay

Execution recordings capture the full event stream so it can be replayed later
with the same data flow behavior as a live run.

### Recording (`ExecutionRecorder`)

`ExecutionRecorder` subscribes to every event on a `GraphProcessor` (or WebSocket
channel) and serializes each event into a `RecordedEvents` array. The key detail
is that **execution metadata is preserved in each recorded event** via the
`withExecution()` helper — every graph-level and node-level event records its
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
serializable identifiers (e.g. `node: ChartNode` → `nodeId: NodeId`,
`graph: NodeGraph` → `graphId: GraphId`). The full type mapping is in
`RecordedEventsMap` (`RecordedEvents.ts`).

Recordings are serialized to `.rivet-recording` files with asset deduplication
(Uint8Arrays → base64) and string deduplication (long strings → FNV-1a hash
references).

### Replay (`replayExecutionRecording`)

`RecordingPlayer.ts` replays a recording by iterating the `RecordedEvents` array
and re-emitting each event on a provided `Emittery<ProcessEvents>` emitter. This
means the app's standard event handlers (`onNodeStart`, `onGraphStart`, etc.)
receive the same events during replay as during live execution.

The critical design point is **execution metadata parity**: replay emits events
with the same `GraphExecutionMetadata` that was recorded, so:

- `graphRunHistoryByView` gets populated with the same view keys.
- `lastRunDataByNodeState` entries get the same `graphViewKey` and `graphRunId` tags.
- The run switcher, data filtering, and key mismatch fallbacks all work identically.

### Legacy recording fallback

Recordings made before execution metadata was added do not have `execution` fields
on their events. `RecordingPlayer` handles this with `getExecution()`:

```typescript
// packages/core/src/model/RecordingPlayer.ts

const legacyRootRunId = nanoid() as RootRunId;
const legacyGraphRunsByGraphId = new Map<GraphId, GraphRunId>();

const getExecution = (
  graphId: GraphId,
  recordedExecution?: GraphExecutionMetadata,
): GraphExecutionMetadata => {
  if (recordedExecution) {
    return recordedExecution;  // New recording — use as-is
  }

  // Legacy recording — synthesize consistent IDs per graphId
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

| Event | Effect on app state |
|-------|-------------------|
| `start` | Clears history, sets context values and inputs |
| `graphStart` | Creates `GraphRunRecord` in history |
| `graphFinish` / `graphError` / `graphAbort` | Updates run record status |
| `nodeStart` / `nodeFinish` / `nodeError` | Stores per-node execution data |
| `nodeExcluded` | Stores excluded status |
| `partialOutput` | Stores streaming/split-run output |
| `nodeOutputsCleared` | Removes node data entries |
| `done` | Sets final outputs, marks not running |
| `userInput` | Replays user input prompt (callback is `undefined`) |
| `globalSet` | Replays global variable changes |

Chat nodes get an artificial delay (`recordingPlaybackChatLatency`) during replay
to simulate streaming behavior.

### Recording options

`ExecutionRecorderOptions` controls what is captured:

- `includePartialOutputs` (default `false`): Whether to record `partialOutput` events. Excluded by default to reduce recording size.
- `includeTrace` (default `false`): Whether to record `trace` events.

These same events are simply skipped during recording — replay handles their
absence gracefully since the final `nodeFinish` event contains the complete outputs.

## File Reference

| File | Role |
|------|------|
| [`navigationActions.ts`](../packages/app/src/domain/graphEditing/navigationActions.ts) | `GraphViewContext` types, `createRootGraphViewContext`, `createSubgraphGraphViewContext` |
| [`executionIdentity.ts`](../packages/app/src/utils/executionIdentity.ts) | `buildGraphViewKeyFromExecution` — converts execution metadata to view key |
| [`dataFlow.ts`](../packages/app/src/state/dataFlow.ts) | Core atoms: `currentGraphViewState`, `graphRunHistoryByViewState`, `selectedGraphRunByViewState`, `lastRunDataByNodeState` |
| [`executionSelectors.ts`](../packages/app/src/state/selectors/executionSelectors.ts) | `getGraphRunsForView`, `filterProcessDataForSelection`, `getSelectedProcessData`, `getGraphSelectionOptions` |
| [`useExecutionDataFlow.ts`](../packages/app/src/hooks/useExecutionDataFlow.ts) | `setDataForNode`, `setSelectedNodePageLatest` — writes execution data to state |
| [`useGraphExecutionEvents.ts`](../packages/app/src/hooks/useGraphExecutionEvents.ts) | Graph-level event handlers: `onStart`, `onGraphStart`, `onGraphFinish`, `onDone` |
| [`useNodeExecutionEvents.ts`](../packages/app/src/hooks/useNodeExecutionEvents.ts) | Node-level event handlers: `onNodeStart`, `onNodeFinish`, `onPartialOutput`, `onNodeError` |
| [`useLocalExecutor.ts`](../packages/app/src/hooks/useLocalExecutor.ts) | Browser-mode execution orchestration |
| [`useRemoteExecutor.ts`](../packages/app/src/hooks/useRemoteExecutor.ts) | Sidecar/remote execution orchestration |
| [`remoteExecutorHelpers.ts`](../packages/app/src/hooks/remoteExecutorHelpers.ts) | `createProcessEventDispatcher` — routes WebSocket messages to handlers |
| [`GraphProcessor.ts`](../packages/core/src/model/GraphProcessor.ts) | Core execution engine, `#createSubProcessor`, `#buildExecutionMetadata` |
| [`SubprocessorBridge.ts`](../packages/core/src/model/SubprocessorBridge.ts) | `wireSubprocessorEvents` — forwards child events to parent emitter |
| [`SplitRunProcessor.ts`](../packages/core/src/model/SplitRunProcessor.ts) | `processSplitRunNode` — iterates split inputs, creates subprocessors per iteration |
| [`ProcessContext.ts`](../packages/core/src/model/ProcessContext.ts) | `GraphExecutionMetadata`, `SubgraphExecutorMetadata` type definitions |
| [`GraphExecutionSelectorBar.tsx`](../packages/app/src/components/GraphExecutionSelectorBar.tsx) | Run switcher UI component |
| [`useGoToNode.ts`](../packages/app/src/hooks/useGoToNode.ts) | Navigation to node — creates root view context |
| [`useGraphBuilderContextMenuHandler.ts`](../packages/app/src/hooks/useGraphBuilderContextMenuHandler.ts) | "Go to subgraph" — creates subgraph view context |
| [`ExecutionRecorder.ts`](../packages/core/src/recording/ExecutionRecorder.ts) | Records execution events with metadata, serializes to `.rivet-recording` |
| [`RecordedEvents.ts`](../packages/core/src/recording/RecordedEvents.ts) | `RecordedEventsMap` type definitions — serializable mirror of `ProcessEvents` |
| [`RecordingPlayer.ts`](../packages/core/src/model/RecordingPlayer.ts) | `replayExecutionRecording` — replays recorded events through the same emitter/handler pipeline |

## Debugging Checklist

When execution data is not showing up for a graph:

1. **Check `currentGraphView.key`** — is it `root:` or `subgraph:`?
2. **Check `graphRunHistoryByView` keys** — what keys have run records?
3. **Do the keys match?** If not, the key mismatch fallbacks may not be working.
4. **Check `ProcessDataForNode.graphViewKey`** for the node — does it match the current view?
5. **Check that events are being forwarded** — is `wireSubprocessorEvents` wiring the event type you expect?
6. **Check `filterProcessDataForSelection`** — is the fallback from graphViewKey to graphId triggering?
7. **For remote execution** — check that the sidecar serializes the event type and that `createProcessEventDispatcher` maps it.
