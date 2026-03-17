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

**Verified**: `graphRunId` is sufficient because each graph invocation gets a unique
`graphRunId` via `nanoid()` in `GraphProcessor.#initializeGraphRun`. Even when the same
graph definition runs both as root and as subgraph, each produces distinct `graphRunId`
values. Node data is stored per-`NodeId` in `lastRunDataByNodeState`, so data from
different graph definitions can never mix within a single node's array. Within a single
graph definition's nodes, `graphRunId` distinguishes between invocations.

### 2. `buildGraphViewKeyFromExecution` is over-complex (93 lines)

This function in `executionIdentity.ts` converts execution metadata to a `GraphViewKey`.
It has three code paths:

1. **No executor**: Tries `inferSubgraphViewContextFromProject()` which scans ALL graphs
   in the project looking for subgraph nodes matching the graphId. If exactly one match,
   returns a subgraph context. Otherwise falls back to root context.

2. **Executor with `parentGraphId`**: Direct conversion (the simple path).

3. **Executor without `parentGraphId`**: Scans project graphs to find the parent.

**Verified**: Path 3 is dead code. `#createSubProcessor` (the only code path that sets
`#executor`) always sets `parentGraphId: this.#graph.metadata!.id!` (line 1442 of
`GraphProcessor.ts`). The `#executor` type enforces `parentGraphId: GraphId` as
required, not optional (lines 238-245).

Path 1's inference is NOT dead code — it's used during legacy recording replay where
`getExecution()` returns metadata without `executor`. However, the inference is
**counterproductive**: it tries to produce subgraph keys (e.g.
`subgraph:parent:node:sub`) for legacy recordings, but the user navigates via sidebar
which produces `root:sub`. This creates the key mismatch for legacy recordings
specifically. Removing inference means legacy recordings would use `root:${graphId}`
keys, which **match** sidebar navigation — actually fixing a latent bug.

This function is called **on every node event** during execution (`setDataForNode`
calls it per event). For a graph with 50 nodes, that's 50+ calls per graph run.

### 3. Per-component `getGraphSelectionOptions` computation is redundant

Six component types independently compute `getGraphSelectionOptions()`:

```
VisualNode                 → getGraphSelectionOptions() + getSelectedProcessRun()
NormalVisualNodeContent    → getGraphSelectionOptions() + getSelectedProcessRun()
ZoomedOutVisualNodeContent → getGraphSelectionOptions() + getSelectedProcessRun()
NodeOutput                 → getGraphSelectionOptions() + filterProcessDataForSelection()
PortInfo                   → getGraphSelectionOptions() + getSelectedProcessData()
WireLayer                  → getGraphSelectionOptions() + getSelectedProcessData()
```

Each one independently reads the same 3 atoms and calls `getGraphSelectionOptions()`.
Within each component, this is wrapped in `useMemo`, so within a single component
instance it's cached. The redundancy is across the 6 component types — each one
computes the same result independently.

**Clarification**: The original plan overstated this as "6+ per visible node." In
reality, most components use `useMemo` so each component type computes it once per
render cycle. `WireLayer` computes it once and calls `getSelectedProcessData` per wire.
The real cost is 6 redundant `useMemo` computations + 6 redundant atom subscriptions to
the same 3 atoms, not 200+ computations. Still worth centralizing for code clarity and
reduced subscription overhead, but the performance claim should not be exaggerated.

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

### Tier 1: Centralize the graph selection computation (medium impact, low risk)

**Goal**: Compute `getGraphSelectionOptions()` once via a derived atom instead of
independently in 6 component types.

#### 1a. Create a derived atom for the resolved graph selection

```ts
// packages/app/src/state/selectors/executionSelectors.ts

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

#### 1b. Migrate components to use the derived atom

Replace the 3-atom reads + `useMemo(getGraphSelectionOptions(...))` in each of:
- `VisualNode.tsx`
- `NormalVisualNodeContent.tsx`
- `ZoomedOutVisualNodeContent.tsx`
- `PortInfo.tsx`
- `WireLayer.tsx`
- `NodeOutput.tsx` (both `NodeFullscreenOutput` and the inline output section)

Each component goes from reading 3 atoms + `useMemo` call to reading 1 atom.

**Important constraint — preserve existing data flow patterns**:

- `VisualNode` receives `lastRun` as a **prop** from `NodeCanvas` →
  `NodeCanvasViewport` → `DraggableNode`. Do NOT change this to atom reads; only
  replace the graph selection computation.
- `NodeOutput` reads `lastRunDataState(node.id)` directly and needs the full filtered
  array (for the pager), not a single resolved entry. A per-node derived atom would
  NOT work here — keep the array filtering, just share the selection input.
- `WireLayer` reads the entire `lastRunDataByNodeState` and iterates per wire. Keep
  this pattern; only replace the selection computation.

What this means: do NOT create a `resolvedNodeRunState` per-node atomFamily. The
components have heterogeneous data flow needs. Only centralize the selection
computation (`graphSelectionOptions`), which is uniform.

**Files changed**: 6 component files + `executionSelectors.ts`
**Lines removed**: ~30 lines of duplicated atom reads + useMemo wrappers
**Lines added**: ~8 lines (derived atom)
**Risk**: Low — pure refactor, behavior unchanged

---

### Tier 2: Eliminate `graphViewKey` from per-node data (medium impact, medium risk)

**Goal**: Stop storing and filtering by `graphViewKey` on `ProcessDataForNode`.
Filter by `graphRunId` only.

**Prerequisite**: Tier 3 (simplify `buildGraphViewKeyFromExecution`) should be done
first. Tier 2 removes most uses of `buildGraphViewKeyFromExecution`, and Tier 3
simplifies what remains. Doing Tier 3 first means the function is already small when
Tier 2 removes call sites.

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

Remove the `buildGraphViewKeyFromExecution` call from `setDataForNode`. Currently
called on every node event (50+ times per graph run for a 50-node graph). With
`graphViewKey` removed from the data model, this call is eliminated.

Also remove the `project` dependency from `setDataForNode` — it was only needed for
`buildGraphViewKeyFromExecution`.

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

**Why this is safe**: `getGraphRunsForView` already handles the key mismatch with its
broader search fallback. It resolves the correct `graphRunId` values for the current
view. Once the correct `graphRunId` is resolved, filtering node data by `graphRunId`
alone produces the same result as the current 3-stage pipeline.

#### 2d. Simplify `getGraphSelectionOptions`

Remove `graphId` and `graphViewKey` from the return value — they were only consumed by
the now-simplified `filterProcessDataForSelection` and `getSelectedProcessData`.

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

The current code matches by exact `graphViewKey` OR by `graphId`:

```ts
const graphViewMatches =
  graphViewKey === currentGraphView?.key ||
  (graphViewKey != null && execution?.graphId === currentGraphView?.graphId);
```

This already effectively matches by `graphId` (the `||` means graphId match always
triggers regardless of the exact key match). The simplified version removes the
`graphViewKey` computation entirely and matches by `graphId` directly:

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

This is a **no-op behavior change** — the current code already matches by `graphId` due
to the `||` in the condition. The effect of `setSelectedNodePageLatest` is to set the
node's page to `'latest'`, which means "show the most recent data." The `graphRunId`
filter in the data pipeline (not this function) controls which run's data is shown.

This eliminates the `buildGraphViewKeyFromExecution` call and the `project` dependency
from this function.

#### 2f. Remove `buildGraphViewKeyFromExecution` from `useNodeExecutionEvents.ts`

The `onPartialOutput` handler for split-run nodes calls `buildGraphViewKeyFromExecution`
to set `graphViewKey` on the process data. With `graphViewKey` removed from the data
model, this call is eliminated, along with the `project` import/atom read.

**Files changed**: `dataFlow.ts`, `executionSelectors.ts`, `useExecutionDataFlow.ts`,
`useNodeExecutionEvents.ts`, all 6 component files (type changes for
`getGraphSelectionOptions` return type)
**Lines removed**: ~60 lines of filtering logic + ~10 lines per event handler call
**Lines added**: ~10 lines (simplified filtering)
**Risk**: Medium — changes data model, needs testing with all execution paths

#### 2g. Update tests

Update `executionSelectors.test.ts`:
- Remove `graphViewKey` from test fixtures in `filterProcessDataForSelection` tests
- The test "filterProcessDataForSelection falls back to graphId when viewing subgraph
  via root context" becomes unnecessary (the fallback no longer exists). Replace with
  a test that verifies filtering by `graphRunId` alone.
- Other tests that don't use `graphViewKey` should pass unchanged.

---

### Tier 3: Simplify `buildGraphViewKeyFromExecution` (medium impact, low risk)

**Goal**: Remove the project-scanning inference logic. This should be done FIRST
(before Tiers 1-2) because it's the lowest risk and makes the function simpler
before the other tiers reduce its call sites.

After all tiers are done, `buildGraphViewKeyFromExecution` is only called from
`useGraphExecutionEvents.ts` (for graph-level events: `onGraphStart`, `onGraphFinish`,
`onGraphError`, `onGraphAbort`). These are called much less frequently (once per graph
invocation, not once per node event).

#### 3a. Remove `inferSubgraphViewContextFromProject`

This function scans the entire project to infer subgraph context when `executor` is
absent.

**Why removing this is safe (verified)**:

- For **live execution**: `executor` is absent only for root graph executions, where
  the correct key is `root:${graphId}`. Subgraph executions always have `executor`
  set by `#createSubProcessor` (the only code path that sets it, line 1440 of
  `GraphProcessor.ts`).

- For **new recording replay**: `RecordingPlayer.getExecution()` returns the original
  metadata verbatim when `recordedExecution` is present. Since new recordings always
  include `executor`, replay produces the same keys as live execution.

- For **legacy recording replay**: `getExecution()` returns
  `{ graphId, graphRunId, rootRunId }` without `executor`. The inference would try to
  produce a subgraph key, but this is **counterproductive** — the user navigates via
  sidebar (creating `root:${graphId}`), so a subgraph key causes the key mismatch.
  Without inference, legacy recordings use `root:` keys which match sidebar navigation.
  This actually **fixes** a latent key mismatch bug for legacy recordings.

#### 3b. Remove the parentGraphId-missing path

The path that scans project graphs to find the parent when `executor` exists but
`executor.parentGraphId` is missing is verified dead code. The `#executor` type in
`GraphProcessor` (lines 238-245) defines `parentGraphId: GraphId` as required, and
`#createSubProcessor` always sets it from `this.#graph.metadata!.id!`.

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

export function buildGraphViewKeyFromExecution(options: {
  execution: GraphExecutionMetadata;
}): GraphViewKey {
  return buildGraphViewContextFromExecution(options).key;
}
```

**93 lines → ~20 lines.**

The `project` parameter is removed from both functions, which simplifies all call sites
(they no longer need to pass `project` or hold a reference to it).

#### 3d. Update call sites

All call sites currently pass `{ execution, project }`. After this change, they pass
`{ execution }` only.

In `useGraphExecutionEvents.ts`: 4 call sites (`onGraphStart`, `onGraphFinish`,
`onGraphError`, `onGraphAbort`).

In `useExecutionDataFlow.ts`: 2 call sites (`setDataForNode`, `setSelectedNodePageLatest`).
Note: These call sites will be removed in Tier 2, so if Tier 3 is done first, they
get simplified temporarily before being removed.

In `useNodeExecutionEvents.ts`: 2 call sites (`onPartialOutput`).
Note: These will also be removed in Tier 2.

**Files changed**: `executionIdentity.ts`, `useGraphExecutionEvents.ts`,
`useExecutionDataFlow.ts`, `useNodeExecutionEvents.ts`
**Lines removed**: ~73 lines (inference function + dead code path)
**Lines added**: ~0
**Risk**: Low — verified dead/counterproductive code paths

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
   dead/counterproductive code, makes the codebase easier to reason about, and simplifies
   the function before Tier 2 removes most of its call sites
2. **Tier 1** second (centralize graph selection) — low effort, reduces subscription
   overhead and code duplication across 6 components
3. **Tier 2** third (remove `graphViewKey` from node data) — the most impactful
   simplification but also the most invasive

Tiers can be done independently. Each tier is a self-contained change that doesn't
require the others. But doing Tier 3 first makes the code cleaner for Tiers 1-2.

## Expected Results

After Tiers 1-3:

| Metric | Before | After |
|--------|--------|-------|
| `buildGraphViewKeyFromExecution` calls per 50-node run | 50+ (every node event) | 4 (graph-level events only) |
| `getGraphSelectionOptions` atom subscriptions | 18 (3 atoms × 6 components) | 6 (1 atom × 6 components) |
| Filtering stages for node data | 3 (viewKey → graphId fallback → graphRunId) | 1 (graphRunId only) |
| Key mismatch fallback locations | 3 | 1 (`getGraphRunsForView` only) |
| Lines in `executionIdentity.ts` | 93 | ~20 |
| Lines in `filterProcessDataForSelection` | 33 | ~15 |
| Per-component graph selection boilerplate | 3 atom reads + useMemo × 6 | 1 atom read × 6 |
| Net lines removed (estimate) | ~130 |  |

## What We're NOT Changing

- `GraphExecutionMetadata` type and generation in `GraphProcessor`
- `SubprocessorBridge` event forwarding
- `ExecutionRecorder` / `RecordingPlayer` (no changes needed — legacy fallback still
  works, just produces `root:` keys instead of inferred subgraph keys)
- `GraphRunRecord` / `graphRunHistoryByViewState` (still keyed by `GraphViewKey`)
- `GraphViewContext` / `GraphNavigationStack`
- `getGraphRunsForView()` fallback logic (this is the ONE correct place for it)
- `GraphExecutionSelectorBar` component
- The run switcher's selection model (`'latest'` vs specific `GraphRunId`)
- `NodeCanvas` → `NodeCanvasViewport` → `VisualNode` prop-passing pattern for `lastRun`

## Risk Assessment

- **Tier 3**: Removes verified dead code and a counterproductive inference path. Low
  risk. Verify with:
  - Live execution (browser + node) — subgraph data should use correct keys
  - Legacy recording replay — should produce `root:` keys (matching sidebar navigation)

- **Tier 1**: No behavior change, pure internal refactor. Very safe. Verify that Jotai's
  derived atom memoization behaves correctly (it should — Jotai atoms memoize by value).

- **Tier 2**: Changes the data model. Medium risk. Requires testing with:
  - Root graph execution (browser + node executor)
  - Single subgraph execution
  - Split-run subgraph execution
  - Recording playback (both new and legacy)
  - Sidebar navigation to subgraph after execution
  - "Go to subgraph" context menu after execution
  - Run switcher navigation between runs
  - Clear outputs command
  - Same graph used as both root and subgraph in one execution
  - Trivet test runs (data accumulation across tests)
