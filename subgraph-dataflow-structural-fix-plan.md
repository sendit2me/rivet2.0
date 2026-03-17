# Subgraph Dataflow Structural Fix Plan

## Goal

Fix incorrect or mixed dataflow shown in the editor for subgraph executions, especially when:

- the executor is `Node`
- a subgraph runs in `Split - Sequential`
- the subgraph executes multiple times for one outer node run
- users inspect historical runs while events are still arriving

The fix should preserve a stable identity for nested executions and make inspector selection depend on execution lineage rather than per-node array position, scoped to a concrete graph view or call site.

## Root Cause Summary

The current model has two coupled flaws:

1. Subgraph child-node events do not carry enough lineage to identify which parent subgraph invocation they belong to.
2. The app stores node history as append-only arrays and selects by numeric page index, which is only a heuristic and not a stable execution identity.

A related UX problem makes this worse:

3. New node events force selection back to `latest` per node, so historical inspection can drift into a mixed state while execution is still active.

## Non-Goals

- Do not ship only a UI bandaid that disables `latest` auto-selection.
- Do not rely on event ordering or array position to reconstruct nested execution identity.
- Do not special-case only split-sequential subgraphs if the underlying model can support nested graphs generally.

## Design Principles

- Execution selection must be identity-based, not position-based.
- Nested executions must preserve parent lineage all the way from runtime emission to UI storage.
- The same model should work for:
  - normal node runs
  - split runs
  - nested subgraphs
  - recordings and replay
- A user selecting a historical execution should not be silently moved to another execution by incoming events.

## Proposed Model

### 1. Add explicit graph-run identity to emitted events - DONE

The current bug is graph-scoped, not just node-scoped.

The app needs to know which **invocation of the currently open graph** each node event belongs to. A generic lineage blob is possible, but it is not the best primary abstraction for this codebase. The more useful model is:

- `rootRunId`: one ID for a top-level `processGraph()` call
- `graphRunId`: one ID for each graph invocation, including subgraphs
- parent executor metadata for subgraph invocations

Conceptually:

```ts
type GraphRunId = string;
type RootRunId = string;

type ExecutionMetadata = {
  rootRunId: RootRunId;
  graphRunId: GraphRunId;
  graphId: GraphId;
  parentGraphRunId?: GraphRunId;
  executor?: {
    nodeId: NodeId;
    processId: ProcessId;
    splitIndex?: number;
  };
};
```

This should be treated as execution metadata, not as a replacement for `processId`.

Important correction to the earlier plan:

- do **not** use `GraphProcessor.id` for this; it is processor-instance identity, not per-run identity
- generate run IDs per `processGraph()` invocation
- keep `processId` as the node-run identity

Minimum metadata required for the app to stop mixing runs:

- `rootRunId`
- `graphRunId`
- `graphId`
- `parentGraphRunId` for subgraph invocations
- `executor.nodeId`
- `executor.processId`
- `executor.splitIndex` when applicable

### 2. Attach metadata to the right events - DONE

The earlier plan was too vague here.

Metadata should be added to the events the app actually reduces into state:

- `start`
- `graphStart`
- `graphFinish`
- `graphAbort`
- `graphError`
- `nodeStart`
- `nodeFinish`
- `nodeError`
- `nodeExcluded`
- `partialOutput`
- `nodeOutputsCleared`
- `userInput`
- `globalSet`

`trace` does not need full metadata for correctness of the inspector.

The key rule is:

- graph events define graph-run records
- node events reference the `graphRunId` they belong to

That is sufficient for the app to join child node executions to the correct subgraph invocation.

### 3. Generate metadata in `GraphProcessor` - DONE

Likely touchpoints:

- `packages/core/src/model/GraphProcessor.ts`
- `packages/core/src/model/SubprocessorBridge.ts`
- `packages/core/src/model/ProcessContext.ts`
- possibly `packages/core/src/model/ProcessContextBuilder.ts`

Required behavior:

- root processor creates a fresh `rootRunId` and `graphRunId` during `#initializeGraphRun`
- each subprocessor invocation gets its own fresh `graphRunId`
- subprocessors inherit `rootRunId`
- subgraph `graphStart` includes parent executor metadata from `#executor`
- node events emitted inside a graph include that graph's `graphRunId`

Important adjustment to the earlier plan:

- `wireSubprocessorEvents()` should mostly remain a forwarding layer
- child processors should emit already-enriched events instead of having the bridge reconstruct lineage ad hoc

`SubGraphNode.ts` may not need direct changes if `context.createSubProcessor()` remains the only entry point and `GraphProcessor` owns all run metadata.

### 4. Persist metadata in recordings and replay it fully - DONE

Recorded events must preserve the same metadata so replay matches live execution behavior.

Likely touchpoints:

- `packages/core/src/recording/RecordedEvents.ts`
- `packages/core/src/recording/ExecutionRecorder.ts`
- `packages/core/src/model/RecordingPlayer.ts`

Critical gap in the current code that the earlier plan did not call out explicitly:

- `ExecutionRecorder` can record `partialOutput`
- `RecordingPlayer` currently does **not** replay `partialOutput`
- `RecordingPlayer` also currently ignores `nodeOutputsCleared`

That means replay parity is already incomplete even before adding run metadata.

Required behavior:

- recorded event payloads include execution metadata
- replay emits the same metadata-rich events as live execution
- replay dispatches `partialOutput`
- replay dispatches `nodeOutputsCleared` if present
- recording format is versioned explicitly if needed

## App Data Model Changes

### 5. Add graph-run history state - DONE

The current graph selector is the wrong abstraction:

- it derives “execution count” from the longest node history array
- it writes a numeric page index into every visible node
- it assumes page `N` means the same logical execution for all nodes

The structural fix should introduce explicit graph-run history for each graph view.

Conceptually:

```ts
type GraphRunRecord = {
  graphRunId: GraphRunId;
  rootRunId: RootRunId;
  graphId: GraphId;
  parentGraphRunId?: GraphRunId;
  executor?: {
    nodeId: NodeId;
    processId: ProcessId;
    splitIndex?: number;
  };
  startedAt?: number;
  finishedAt?: number;
  status?: 'running' | 'ok' | 'error' | 'aborted';
};
```

Add state along these lines:

- `graphRunHistoryByViewState`
- `selectedGraphRunByViewState`

where selection is:

```ts
type GraphRunSelection = 'latest' | GraphRunId;
```

`GraphExecutionSelectorBar.tsx` should use the currently open graph view's run history, not `max(processData.length)` across nodes.

### 6. Enrich node history entries with graph-run metadata - DONE

The earlier plan pushed too hard toward replacing all node history arrays with maps.

That is not strictly necessary for the structural fix.

The current array model can remain initially if each entry stores the graph-run identity it belongs to.

Update `ProcessDataForNode` conceptually from:

```ts
type ProcessDataForNode = {
  processId: ProcessId;
  data: NodeRunDataWithRefs;
};
```

toward:

```ts
type ProcessDataForNode = {
  processId: ProcessId;
  rootRunId: RootRunId;
  graphRunId: GraphRunId;
  graphId: GraphId;
  graphViewKey?: GraphViewKey;
  data: NodeRunDataWithRefs;
};
```

`graphViewKey` may be derived in the app rather than emitted directly by core events, but the plan must account for it somewhere in the app model. Without that, multiple call sites into the same graph definition can still be collapsed together in the inspector.

Why keep arrays for now:

- `setDataForNode()` already updates existing entries by `processId`
- `partialOutput` for split nodes already updates in place by `processId`
- `NodeOutput` pager already expects ordered arrays

A normalized `byKey` structure can be deferred unless performance or deduplication problems appear after the graph-run migration.

### 7. Select visible node data by `graphRunId`, then page locally - DONE

The selector model should become two-layered:

- graph-view selection chooses the active `graphRunId` for the currently open graph view
- node-local pager, if needed, pages only within entries that belong to that selected `graphRunId`

This is a key correction to the original plan.

The graph selector and node pager are solving different problems:

- graph selector = “which invocation of this graph view / call site am I inspecting?”
- node pager = “within that graph invocation, which run of this node am I viewing?”

Required behavior in selectors/components:

- `NodeOutput.tsx` filters a node's history by the selected `graphRunId` within the current graph view
- `GraphExecutionSelectorBar.tsx` selects graph runs for the current graph view, not node pages
- `executionSelectors.ts` gains helpers that resolve node entries by `graphRunId` plus current graph-view context when needed
- split node `splitOutputData` remains grouped inside a single node-run entry by split index

This is enough to stop descendant nodes from drifting across different subgraph invocations.

## Event Handling Changes

### 8. Replace per-node auto-jump-to-latest with graph-aware follow mode - DONE

`useNodeExecutionEvents.ts` currently forces `selectedProcessPageNodesState[node.id] = 'latest'` after nearly every event.

That behavior is incompatible with stable historical inspection.

After graph-run selection exists:

- auto-follow should apply to the selected graph run for the current graph view
- node event handlers should stop blindly changing node-local selection on every event
- if the graph selection is `latest`, new graph runs can become visible automatically
- if the user selected a historical `graphRunId`, incoming events for newer graph runs must not change what is shown

Node-local pager state may still have a `latest` mode, but it must never override the graph-run selection.

## Migration Strategy

### Phase 1: Core execution metadata

- add `rootRunId` / `graphRunId` generation to `GraphProcessor`.
- enrich core events with execution metadata.
- keep existing event fields intact.

### Phase 2: Recording parity - DONE

- persist execution metadata in recorded events
- version the recording schema if needed
- update replay to emit `partialOutput` and `nodeOutputsCleared`.

### Phase 3: App graph-run state - DONE

- add graph-view state that can distinguish subgraph call sites reusing the same `graphId`
- add graph-run history state keyed by graph view, not only `graphId`
- add graph-run selection state keyed by graph view, not only `graphId`
- populate graph-run state from `graphStart` / `graphFinish` / `graphAbort` / `graphError`.

### Phase 3.5: Navigation model update - DONE

- replace or augment `graphNavigationStackState` so it can store graph view context, not only `GraphId`
- ensure loading a subgraph from node X vs node Y produces distinct graph-view entries when needed
- keep backward/forward navigation semantics intact.

### Phase 4: App node history enrichment - DONE

- extend node history entries with `rootRunId` / `graphRunId` / `graphId`
- attach or derive graph-view context for node data shown in the current editor
- populate them from node events
- keep existing arrays during the transition.

### Phase 5: Selector and UI migration - DONE

- migrate `GraphExecutionSelectorBar` to graph-run records
- filter `NodeOutput` by selected `graphRunId` within the current graph view
- retain node-local paging only inside the filtered subset
- stop using graph-wide page writes into `selectedProcessPageNodesState`.

### Phase 6: Cleanup

- remove cross-node page-index assumptions
- remove any fallback logic that guesses correspondence by array position

## Suggested Implementation Order

1. Add `rootRunId` / `graphRunId` generation to `GraphProcessor`.
2. Enrich core events with execution metadata.
3. Persist metadata in recordings and fix replay parity for `partialOutput` and `nodeOutputsCleared`.
4. Add graph-view context to app navigation/state so reused subgraph graphs do not collapse by `graphId`.
5. Add graph-run history and graph-run selection state in the app.
6. Extend node history entries with `graphRunId` metadata.
7. Migrate `GraphExecutionSelectorBar` and `NodeOutput` to graph-run-based selection within a graph view.
8. Remove graph-wide dependence on `selectedProcessPageNodesState`.
9. Add regression tests around the original reproduction and shared-subgraph-call-site cases.

## Concrete Implementation Checklist By File

### Core runtime and event schema

#### `packages/core/src/model/GraphProcessor.ts`

- introduce `RootRunId` and `GraphRunId`
- generate a fresh `rootRunId` per top-level `processGraph()` call
- generate a fresh `graphRunId` per graph invocation, including subgraphs
- pass parent graph-run context into subprocessors
- emit execution metadata on graph and node events reduced by the app

#### `packages/core/src/model/ProcessContext.ts`

- extend internal process context with `rootRunId`, `graphRunId`, and `parentGraphRunId`
- keep `processId` as the distinct node-run identity

#### `packages/core/src/model/ProcessContextBuilder.ts`

- thread graph-run metadata through context creation
- ensure subprocessors inherit root lineage and receive a fresh child `graphRunId`
- preserve executor `splitIndex` for split-sequential subgraph invocations

### Recording and replay parity

#### `packages/core/src/recording/ExecutionRecorder.ts`

- persist execution metadata on recorded graph and node events
- record enough data to reconstruct parent graph invocation and executor context

#### `packages/core/src/model/RecordingPlayer.ts`

- replay metadata-rich events with the same shape as live execution
- add missing replay dispatches for `partialOutput` and `nodeOutputsCleared`
- keep legacy fallback behavior explicit when metadata is absent

### App types and execution state

#### `packages/app/src/state/dataFlow.ts`

- introduce graph-view-aware execution state
- add `graphRunHistoryByViewState` and `selectedGraphRunByViewState`
- extend node history entries with `rootRunId`, `graphRunId`, `graphId`, and graph-view identity or derivation data
- keep existing node arrays in the first pass

#### `packages/app/src/state/graphBuilder.ts`

- evolve `graphNavigationStackState` from raw `GraphId[]` to graph-view-aware entries
- ensure shared subgraph graphs opened from different caller nodes remain distinct in navigation

### App selectors and data derivation

#### `packages/app/src/state/selectors/executionSelectors.ts`

- add selectors for current graph view, selected graph run, and run history for that view
- filter node history by selected `graphRunId`
- remove assumptions that shared page index means shared execution
- keep fallback behavior when metadata is unavailable

#### `packages/app/src/hooks/useExecutionDataFlow.ts`

- tag node-history writes with graph-run metadata
- derive graph-run history from graph events rather than node array length
- retain in-place updates by `processId` for partial outputs

### App event handlers

#### `packages/app/src/hooks/useGraphExecutionEvents.ts`

- build graph-run records from `graphStart`, `graphFinish`, `graphAbort`, and `graphError`
- update follow behavior to operate per graph view
- revisit any state that is currently tracked only as `GraphId[]`

#### `packages/app/src/hooks/useNodeExecutionEvents.ts`

- stop forcing `selectedProcessPageNodesState[nodeId] = 'latest'` on every event
- keep updates keyed by `processId` but scope visibility by `graphRunId`
- preserve split output updates within a single node-run entry
- prevent newer runs from overriding a historical selection

### UI components

#### `packages/app/src/components/GraphExecutionSelectorBar.tsx`

- read graph-run history for the current graph view
- stop deriving execution count from the longest node-history array
- write selected `graphRunId` instead of broadcasting a numeric page index
- support `latest` vs explicit historical run selection

#### `packages/app/src/components/NodeOutput.tsx`

- resolve visible node output by current graph view and selected `graphRunId`
- keep node-local paging inside the filtered subset only
- preserve split output rendering after graph-run filtering

### Navigation and graph loading

#### `packages/app/src/domain/graphEditing/navigationActions.ts`

- make navigation helpers operate on graph-view-aware stack entries rather than raw `GraphId`
- restore both the graph definition and the graph-view context on navigation

#### `packages/app/src/hooks/useLoadGraph.ts`

- support loading a graph together with graph-view context, not just the graph definition

#### `packages/app/src/hooks/useGraphHistoryNavigation.ts`

- ensure backward and forward navigation restore the correct graph view

#### `packages/app/src/hooks/useWorkspaceTransitions.ts`

- preserve graph-view semantics when switching graphs and updating navigation history

### Tests to add with each phase

#### Core tests

- add runtime tests for fresh `rootRunId` and `graphRunId`
- add lineage tests for parent executor metadata and split index propagation

#### Recording tests

- add `ExecutionRecorder` and `RecordingPlayer` parity tests for metadata persistence and replay
- add explicit replay tests for `partialOutput` and `nodeOutputsCleared`

#### App state tests

- add selector tests for graph-view-aware run selection
- add tests proving two call sites into the same `graphId` do not collapse into one history

#### Integration tests

- add the original split-sequential reproduction
- add the shared-subgraph-graph reproduction with two different caller nodes

### Recommended first implementation slice

1. `packages/core/src/model/GraphProcessor.ts`
2. `packages/core/src/model/ProcessContext.ts`
3. `packages/core/src/model/ProcessContextBuilder.ts`
4. `packages/core/src/recording/ExecutionRecorder.ts`
5. `packages/core/src/model/RecordingPlayer.ts`
6. `packages/app/src/state/dataFlow.ts`
7. `packages/app/src/hooks/useGraphExecutionEvents.ts`
8. `packages/app/src/hooks/useExecutionDataFlow.ts`
9. `packages/app/src/state/selectors/executionSelectors.ts`
10. `packages/app/src/components/GraphExecutionSelectorBar.tsx`
11. `packages/app/src/hooks/useNodeExecutionEvents.ts`
12. `packages/app/src/components/NodeOutput.tsx`
13. `packages/app/src/state/graphBuilder.ts`
14. `packages/app/src/domain/graphEditing/navigationActions.ts`
15. `packages/app/src/hooks/useLoadGraph.ts`
16. `packages/app/src/hooks/useGraphHistoryNavigation.ts`
17. `packages/app/src/hooks/useWorkspaceTransitions.ts`

## Backward Compatibility

Decide explicitly how to handle events and recordings without graph-run metadata.

Recommended approach:

- live execution should always emit metadata once this ships
- old recordings can replay through a legacy path
- legacy recordings may keep current positional inspection behavior
- new selectors should only use graph-run logic when metadata is available
- legacy graph navigation keyed only by `graphId` may need a fallback mode until graph-view context ships

If maintaining both paths becomes too invasive, version-gate recordings and surface a limited-inspection fallback for legacy recordings.

## Acceptance Criteria

The fix is complete when all of the following are true:

- selecting a subgraph execution selects a concrete `graphRunId`, not a shared page index
- selecting a subgraph execution is scoped to a concrete graph view / call site, not only `graphId`
- descendant nodes inside the subgraph resolve against that same `graphRunId`
- switching between run 1 and run 2 is stable and reversible
- long-running or compute-intensive child nodes do not cause mixed inspector state
- graph-level selection no longer depends on matching node array positions across nodes
- recording replay matches live behavior, including partial outputs

## Risk Areas

- Event schema changes may affect remote executor bridges
- The current graph navigation model stores only `GraphId`, which is too weak for reused subgraph call sites
- Recording format changes may require versioning
- UI components that assume page-based history may need coordinated migration
- Any node-specific code that depends on `processId` alone may need review once lineage is introduced
