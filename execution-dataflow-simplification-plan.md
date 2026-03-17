# Execution Dataflow Simplification Plan

## Analysis Summary

The subgraph dataflow refactor (documented in `subgraph-dataflow-structural-fix-plan.md`)
solved a real problem: subgraph runs were mixing node data because there was no execution
identity. The solution added execution metadata (`rootRunId`, `graphRunId`,
`GraphExecutionMetadata`) to events, graph-run history state, and a filtering pipeline.

The core execution model (metadata generation in `GraphProcessor`, event forwarding in
`SubprocessorBridge`, recording parity) is well-designed and not overengineered. It
solves a genuinely hard problem with the right abstractions.

However, the **app layer** that consumes this metadata has accumulated unnecessary
complexity. The root issue is a **dual identity system** — navigation creates
`GraphViewKey` strings in one format while execution stores data under a different
format — and the fix was adding fallback logic in three separate places rather than
eliminating the mismatch.

## What's Overengineered

### 1. `graphViewKey` on `ProcessDataForNode` is redundant with `graphRunId`

Every `ProcessDataForNode` entry stores both `graphRunId` and `graphViewKey`. The
filtering pipeline then runs a two-stage filter:

- Stage 1: Filter by `graphViewKey` (with fallback to `graphId` when it doesn't match)
- Stage 2: Filter by `graphRunId`

But `graphRunId` is already a unique identifier for a specific graph invocation. Once
the run switcher resolves the correct `graphRunId` (which already handles call-site
distinction via `getGraphRunsForView`), filtering by `graphRunId` alone is sufficient.

The `graphViewKey` filter on node data adds nothing — it only creates problems when
navigation keys don't match execution keys (the key mismatch bug), which then requires
fallback logic.

**Evidence**: The graphId fallback in `filterProcessDataForSelection` (Stage 1b) exists
precisely because Stage 1 fails for the most common navigation path. When a filter
needs a fallback for its most common case, the filter itself is the wrong abstraction.

### 2. `buildGraphViewKeyFromExecution` is over-complex (93 lines)

This function in `executionIdentity.ts` converts execution metadata to a `GraphViewKey`.
It has three code paths:

1. **No executor**: Tries `inferSubgraphViewContextFromProject()` which scans ALL graphs
   in the project looking for subgraph nodes matching the graphId. If exactly one match,
   returns a subgraph context. Otherwise falls back to root context.

2. **Executor with `parentGraphId`**: Direct conversion (the simple path).

3. **Executor without `parentGraphId`**: Scans project graphs to find the parent.

Path 1's inference logic is fragile (fails when subgraph is used from 2+ places) and
expensive (full project scan). Path 3 is likely dead code — `#createSubProcessor` in
`GraphProcessor.ts` always sets `parentGraphId: this.#graph.metadata!.id!`.

This function is called **on every node event** during execution. For a graph with
50 nodes, that's 50+ calls per graph run, each potentially scanning the entire project.

### 3. Per-component filtering is redundant

Six components independently perform the same computation every render:

```
VisualNode           → getGraphSelectionOptions() + getSelectedProcessRun()
NormalVisualNodeContent → getGraphSelectionOptions() + getSelectedProcessRun()
ZoomedOutVisualNodeContent → getGraphSelectionOptions() + getSelectedProcessRun()
NodeOutput           → getGraphSelectionOptions() + filterProcessDataForSelection() + getSelectedProcessData()
PortInfo             → getGraphSelectionOptions() + getSelectedProcessData()
WireLayer            → getGraphSelectionOptions() + getSelectedProcessData() (per wire)
```

Each one independently:
1. Reads 3 atoms (`currentGraphViewState`, `graphRunHistoryByViewState`, `selectedGraphRunByViewState`)
2. Calls `getGraphSelectionOptions()` which internally calls `getGraphRunsForView()`
3. Passes the result through the filtering pipeline

`getGraphSelectionOptions` is computed at least 6 times per render cycle. For a canvas
with 50 visible nodes, the filtering runs 200+ times.

### 4. The key mismatch fallbacks are symptoms, not a solution

Three places have fallback logic to handle the navigation/execution key mismatch:

1. `getGraphRunsForView()`: Broader search when direct key lookup fails
2. `filterProcessDataForSelection()`: Falls back to `graphId` when `graphViewKey` filter
   produces no results
3. `setSelectedNodePageLatest()`: Matches by `graphId` in addition to exact `graphViewKey`

These are correct and necessary given the current architecture, but they exist because
the architecture creates a problem and then patches it in multiple places.

## What's NOT Overengineered

These parts are well-designed and should not be simplified:

- **`GraphExecutionMetadata`** (`rootRunId`, `graphRunId`, `graphId`, `executor`) — the
  right level of identity for the execution engine
- **`SubprocessorBridge` event forwarding** — simple, correct forwarding without
  metadata rewriting
- **`GraphRunRecord` and `graphRunHistoryByViewState`** — necessary for the run switcher
- **`ExecutionRecorder` / `RecordingPlayer`** — recording parity is essential and the
  legacy fallback is well-handled
- **`GraphViewContext` in the navigation stack** — correct distinction between root and
  subgraph navigation
- **The run switcher (`GraphExecutionSelectorBar`)** — clean, simple component

## Simplification Plan

### Tier 1: Centralize the filtering computation (high impact, low risk)

**Goal**: Compute "which `graphRunId` is selected for the current view" once,
not 6+ times per render.

#### 1a. Create a derived atom for the resolved graph run selection

```ts
// packages/app/src/state/selectors/executionSelectors.ts (or a new derived-atoms file)

export const resolvedGraphSelectionState = atom((get) => {
  const currentGraphView = get(currentGraphViewState);
  const graphRunHistoryByView = get(graphRunHistoryByViewState);
  const selectedGraphRunByView = get(selectedGraphRunByViewState);

  return getGraphSelectionOptions({
    currentGraphView,
    graphRunHistoryByView,
    selectedGraphRunByView,
  });
});
```

#### 1b. Create a per-node derived atom for resolved execution data

```ts
export const resolvedNodeRunState = atomFamily((nodeId: NodeId) =>
  atom((get) => {
    const lastRun = get(lastRunDataState(nodeId));
    const selection = get(resolvedGraphSelectionState);
    const selectedPage = get(selectedProcessPageState(nodeId));
    return getSelectedProcessRun(lastRun, selectedPage, selection);
  }),
);
```

#### 1c. Migrate components to use derived atoms

Replace the 3-atom reads + `getGraphSelectionOptions()` + filtering call in each of:
- `VisualNode.tsx`
- `NormalVisualNodeContent.tsx`
- `ZoomedOutVisualNodeContent.tsx`
- `PortInfo.tsx`
- `WireLayer.tsx`
- `NodeOutput.tsx`

Each component goes from ~8 lines of selector boilerplate to ~1 atom read.

**Files changed**: 6 component files + `executionSelectors.ts` (or new file)
**Lines removed**: ~50 lines of duplicated filtering
**Lines added**: ~20 lines of derived atoms
**Risk**: Low — pure refactor, behavior unchanged

---

### Tier 2: Eliminate `graphViewKey` from per-node data (medium impact, medium risk)

**Goal**: Stop storing and filtering by `graphViewKey` on `ProcessDataForNode`.
Filter by `graphRunId` only.

#### 2a. Remove `graphViewKey` from `ProcessDataForNode`

```ts
// packages/app/src/state/dataFlow.ts

export type ProcessDataForNode = {
  processId: ProcessId;
  rootRunId?: RootRunId;
  graphRunId?: GraphRunId;
  graphId?: GraphId;
  // graphViewKey removed
  data: NodeRunDataWithRefs;
};
```

#### 2b. Simplify `setDataForNode` in `useExecutionDataFlow.ts`

Remove the `buildGraphViewKeyFromExecution` call from `setDataForNode`. The function
currently calls it on every node event to compute and store the view key. With
`graphViewKey` removed from the data model, this call is eliminated.

The only remaining use of `buildGraphViewKeyFromExecution` is in
`useGraphExecutionEvents.ts` for building graph run history keys, and in
`useNodeExecutionEvents.ts` for split-run `partialOutput` handling.

#### 2c. Simplify `filterProcessDataForSelection`

Remove Stage 1 (graphViewKey filter) and Stage 1b (graphId fallback). The function
becomes:

```ts
export function filterProcessDataForSelection(options: {
  graphRuns?: GraphRunRecord[];
  processData?: ProcessDataForNode[];
  selectedGraphRun?: GraphRunSelection;
}): ProcessDataForNode[] | undefined {
  const { graphRuns, processData, selectedGraphRun } = options;
  if (!processData?.length) {
    return undefined;
  }

  const selectedGraphRunId = getSelectedGraphRunId(graphRuns, selectedGraphRun);
  if (!selectedGraphRunId) {
    return processData;
  }

  const graphRunFiltered = processData.filter(
    (process) => process.graphRunId == null || process.graphRunId === selectedGraphRunId,
  );
  return graphRunFiltered.length > 0 ? graphRunFiltered : processData;
}
```

This eliminates:
- The `graphViewKey` parameter
- The `graphId` parameter
- Stage 1 (graphViewKey filter)
- Stage 1b (graphId fallback)
- The entire key mismatch fallback at the node data level

The key mismatch is now handled in exactly one place: `getGraphRunsForView()`, which
resolves the correct `graphRunId` for the run switcher regardless of how the user
navigated to the graph.

#### 2d. Simplify `getGraphSelectionOptions`

Remove `graphId` and `graphViewKey` from the return value — they're only used by
`filterProcessDataForSelection` and `getSelectedProcessData`, which no longer need them.

```ts
export function getGraphSelectionOptions(options: {
  currentGraphView?: GraphViewContext;
  graphRunHistoryByView: Record<GraphViewKey, GraphRunRecord[]>;
  selectedGraphRunByView: Record<GraphViewKey, GraphRunSelection>;
}): {
  graphRuns?: GraphRunRecord[];
  selectedGraphRun?: GraphRunSelection;
} {
  const { currentGraphView, graphRunHistoryByView, selectedGraphRunByView } = options;
  return {
    graphRuns: currentGraphView
      ? getGraphRunsForView({ currentGraphView, graphRunHistoryByView })
      : undefined,
    selectedGraphRun: currentGraphView
      ? selectedGraphRunByView[currentGraphView.key]
      : undefined,
  };
}
```

#### 2e. Simplify `setSelectedNodePageLatest` in `useExecutionDataFlow.ts`

Remove the `graphViewKey`-based matching and the `graphId` fallback. Since the function
needs to decide "is this event relevant to what the user is currently viewing", match
by `graphId` directly (which is simpler and already the effective behavior after
fallback):

```ts
const setSelectedNodePageLatest = (
  nodeId: NodeId,
  execution: GraphExecutionMetadata | undefined,
) => {
  const shouldFollowLatest =
    currentGraphView != null &&
    execution?.graphId === currentGraphView.graphId &&
    (selectedGraphRunByView[currentGraphView.key] ?? 'latest') === 'latest';

  if (!shouldFollowLatest) {
    return;
  }

  setSelectedPage((prev) => ({ ...prev, [nodeId]: 'latest' }));
};
```

This eliminates the `buildGraphViewKeyFromExecution` call from this function entirely.

#### 2f. Remove `buildGraphViewKeyFromExecution` from `useNodeExecutionEvents.ts`

The `onPartialOutput` handler for split-run nodes currently calls
`buildGraphViewKeyFromExecution` to set `graphViewKey` on the process data. With
`graphViewKey` removed from the data model, this call is eliminated.

**Files changed**: `dataFlow.ts`, `executionSelectors.ts`, `useExecutionDataFlow.ts`,
`useNodeExecutionEvents.ts`, all 6 component files (type changes)
**Lines removed**: ~60 lines of filtering logic + ~10 lines per event handler call
**Lines added**: ~10 lines (simplified filtering)
**Risk**: Medium — changes data model, needs testing with all execution paths

---

### Tier 3: Simplify `buildGraphViewKeyFromExecution` (medium impact, low risk)

**Goal**: Remove the project-scanning inference logic.

After Tier 2, `buildGraphViewKeyFromExecution` is only called from
`useGraphExecutionEvents.ts` (for graph-level events: `onGraphStart`, `onGraphFinish`,
`onGraphError`, `onGraphAbort`). These are called much less frequently (once per graph
invocation, not once per node event).

#### 3a. Remove `inferSubgraphViewContextFromProject`

This function scans the entire project to infer subgraph context when `executor` is
absent. But `executor` is absent only for root graph executions, where the correct
key is simply `root:${graphId}`. The inference for "graph that has a
`parentGraphRunId` but no `executor`" is a defensive path that shouldn't occur in
practice (since `#createSubProcessor` always sets executor metadata).

Remove the function entirely. If `executor` is absent, return root context.

#### 3b. Remove the parentGraphId-missing path

The path that scans project graphs to find the parent when `executor` exists but
`executor.parentGraphId` is missing is dead code. `#createSubProcessor` always sets
`parentGraphId: this.#graph.metadata!.id!`.

#### 3c. Resulting simplified function

```ts
export function buildGraphViewContextFromExecution(options: {
  execution: GraphExecutionMetadata;
}): GraphViewContext {
  const { execution } = options;

  if (!execution.executor) {
    return createRootGraphViewContext(execution.graphId);
  }

  return createSubgraphGraphViewContext({
    graphId: execution.graphId,
    parentGraphId: execution.executor.parentGraphId,
    parentNodeId: execution.executor.nodeId,
  });
}
```

**93 lines → 15 lines.**

The `project` parameter is no longer needed, which simplifies all call sites.

**Files changed**: `executionIdentity.ts`, `useGraphExecutionEvents.ts`,
`useNodeExecutionEvents.ts` (simplified call sites)
**Lines removed**: ~78 lines
**Lines added**: ~0
**Risk**: Low — the removed paths are defensive/dead code

---

### Tier 4: Optional future — restructure data storage (high impact, high risk)

This is NOT recommended for immediate implementation but worth documenting as a
possible future direction.

#### Current storage model

```ts
lastRunDataByNodeState: Record<NodeId, ProcessDataForNode[]>
// Pro: Simple append, matches how events arrive
// Con: Filtering every render, unbounded growth per node
```

#### Alternative: GraphRunId-keyed storage

```ts
type ExecutionRunData = {
  graphId: GraphId;
  rootRunId: RootRunId;
  nodes: Record<NodeId, NodeRunDataWithRefs>;
};

executionDataByRunState: Record<GraphRunId, ExecutionRunData>
```

Benefits:
- Node data lookup is O(1): `data[selectedGraphRunId].nodes[nodeId]`
- No filtering pipeline needed at all
- Natural grouping of all node data for a single run
- Easier to implement "clear old runs" (delete by graphRunId)

Costs:
- Major refactor of all data writes
- Split-run partial outputs need different handling
- Process-local paging (multiple processIds per node) needs restructuring
- All consumers change
- High risk of subtle bugs

**Recommendation**: Defer unless performance problems appear with the array-filtering
approach after Tiers 1-3.

## Implementation Order

1. **Tier 3** first (simplify `buildGraphViewKeyFromExecution`) — lowest risk, removes
   dead code, makes the codebase easier to reason about
2. **Tier 1** second (centralize filtering) — medium effort, big developer experience
   improvement, no behavior change
3. **Tier 2** third (remove `graphViewKey` from node data) — the most impactful
   simplification but also the most invasive

## Expected Results

After Tiers 1-3:

| Metric | Before | After |
|--------|--------|-------|
| `buildGraphViewKeyFromExecution` calls per 50-node run | 50+ | 4 (graph events only) |
| `getGraphSelectionOptions` calls per render cycle | 6+ per visible node | 1 (derived atom) |
| Filtering stages for node data | 3 (viewKey → graphId fallback → graphRunId) | 1 (graphRunId) |
| Key mismatch fallback locations | 3 | 1 (`getGraphRunsForView` only) |
| Lines in `executionIdentity.ts` | 93 | ~15 |
| Lines in `filterProcessDataForSelection` | 33 | ~15 |
| Per-component filtering boilerplate | ~8 lines × 6 components | ~1 line × 6 components |
| Total lines removed (estimate) | ~180 |  |
| Total lines added (estimate) | ~30 |  |

## What We're NOT Changing

- `GraphExecutionMetadata` type and generation in `GraphProcessor`
- `SubprocessorBridge` event forwarding
- `ExecutionRecorder` / `RecordingPlayer`
- `GraphRunRecord` / `graphRunHistoryByViewState` (still keyed by `GraphViewKey`)
- `GraphViewContext` / `GraphNavigationStack`
- `getGraphRunsForView()` fallback logic (this is the ONE correct place for it)
- `GraphExecutionSelectorBar` component
- The run switcher's selection model (`'latest'` vs specific `GraphRunId`)

## Risk Assessment

- **Tier 1**: No behavior change, pure internal refactor. Very safe.
- **Tier 2**: Changes the data model. Requires testing with:
  - Root graph execution (browser + node executor)
  - Single subgraph execution
  - Split-run subgraph execution
  - Recording playback (both new and legacy)
  - Sidebar navigation to subgraph after execution
  - "Go to subgraph" context menu after execution
  - Run switcher navigation between runs
  - Clear outputs command
- **Tier 3**: Removes dead/defensive code paths. Low risk but should verify no
  recording or edge case relies on the inference logic.
