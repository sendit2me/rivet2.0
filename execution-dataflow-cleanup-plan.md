# Execution Dataflow Cleanup Plan

## Context

After the subgraph dataflow structural fix (#47) and the execution dataflow simplification
(#48), the system is functionally correct but still carries several kinds of unnecessary
complexity: duplicated logic between local and remote executors, repeated state mutation
patterns, redundant selector calls in the component tree, and dead code from previous
refactors. None of these affect behavior, but they increase maintenance cost and cognitive
load for anyone working in this area.

This plan targets only clear wins — duplicated code that should be shared, redundant
computations that should be passed as props, and dead code that should be removed. It
deliberately avoids restructuring the data storage model (deferred in the simplification
plan), changing the hook composition pattern from refactor #14, or touching the core engine
event model.

---

## 1. Deduplicate data preloading between local and remote executors

**Problem:** `preloadDependentDataForNode()` in `useLocalExecutor.ts` (lines 322-351) and
`getDependentDataForNodeForPreload()` in `remoteExecutorHelpers.ts` (lines 31-59) contain
nearly identical logic — iterate dependency nodes, validate data exists, restore values from
refs. The only difference is the final step: local calls `processor.preloadNodeData()` per
node, remote collects into a `Record<NodeId, Outputs>`.

**Fix:** Delete `preloadDependentDataForNode` from `useLocalExecutor.ts`. Use the existing
`getDependentDataForNodeForPreload` from `remoteExecutorHelpers.ts` to get the preload data
map, then loop over it calling `processor.preloadNodeData()`.

Also move `getDependencyNodesForRunFrom` call inline in `useLocalExecutor.ts` (it's currently
done differently — local calls `processor.getDependencyNodesDeep()` directly, remote calls
`getDependencyNodesForRunFrom()` which creates a throwaway `GraphProcessor` to do the same
thing).

**Files:**
- `packages/app/src/hooks/useLocalExecutor.ts` — delete `preloadDependentDataForNode`,
  use `getDependentDataForNodeForPreload` + loop
- `packages/app/src/hooks/remoteExecutorHelpers.ts` — no changes (already has the function)

**Lines removed:** ~25
**Risk:** Low — same logic, different wiring

---

## 2. Extract input/output sanitization helper

**Problem:** `onNodeStart` and `onNodeFinish` in `useNodeExecutionEvents.ts` have identical
6-line loops:

```typescript
const sanitized: Inputs = {};
for (const [key, value] of entries(data)) {
  const fixedValue = fixDataValueUint8Arrays(value) as DataValue;
  sanitized[key] = sanitizeDataValueForLength(fixedValue) as DataValue;
}
```

**Fix:** Extract `sanitizeInputsOrOutputs(data)` into `executionDataTransforms.ts`.

**Files:**
- `packages/app/src/utils/executionDataTransforms.ts` — add `sanitizeInputsOrOutputs`
- `packages/app/src/hooks/useNodeExecutionEvents.ts` — replace both loops with one-liner calls

**Lines removed:** ~8
**Risk:** Trivial

---

## 3. Extract graph run history update helper

**Problem:** Four graph event handlers (`onGraphAbort`, `onGraphError`, `onGraphFinish`,
`onGraphStart`) in `useGraphExecutionEvents.ts` all update `graphRunHistoryByViewState`
with near-identical `produce()` patterns:

```typescript
setGraphRunHistoryByView((prev) =>
  produce(prev, (draft) => {
    const run = draft[graphViewKey]?.find(r => r.graphRunId === execution.graphRunId);
    if (run) {
      run.finishedAt = Date.now();
      run.status = '...';
    }
  }),
);
```

**Fix:** Extract `updateGraphRunStatus(setter, graphViewKey, graphRunId, status)` into
`useGraphExecutionEvents.ts` (kept local — only used in this file). The `onGraphStart`
case is different (creates a new record), so extract that separately or handle with an
overload.

Concretely:

```typescript
function updateGraphRunStatus(
  setter: SetAtom<...>,
  graphViewKey: GraphViewKey,
  graphRunId: GraphRunId,
  status: GraphRunRecord['status'],
) {
  setter((prev) =>
    produce(prev, (draft) => {
      const run = draft[graphViewKey]?.find(r => r.graphRunId === graphRunId);
      if (run) {
        run.finishedAt = Date.now();
        run.status = status;
      }
    }),
  );
}
```

Then `onGraphAbort`, `onGraphError`, `onGraphFinish` each become one-liners calling this.

**Files:**
- `packages/app/src/hooks/useGraphExecutionEvents.ts` — extract helper, simplify 3 handlers

**Lines removed:** ~20
**Risk:** Trivial — pure extraction

---

## 4. Pass `selectedProcessRun` as prop instead of recomputing

**Problem:** `getSelectedProcessRun(lastRun, processPage, graphSelectionOptions)` is called
in three places with identical inputs:

1. `VisualNode.tsx` line 111 — uses result for CSS class flags
2. `NormalVisualNodeContent.tsx` line 83 — uses result for status display
3. `ZoomedOutVisualNodeContent.tsx` line 47 — uses result for status display

`VisualNode` already has the result and passes `lastRun` + `processPage` as props to the
child components, which then recompute the same value.

**Fix:** Pass `selectedProcessRun` as a prop from `VisualNode` to both child components.
Remove the `resolvedGraphSelectionState` atom read and `getSelectedProcessRun` call from
both children.

**Files:**
- `packages/app/src/components/VisualNode.tsx` — pass `selectedProcessRun` prop
- `packages/app/src/components/visualNode/NormalVisualNodeContent.tsx` — receive prop,
  remove atom read + selector call, remove `lastRun`/`processPage` props
- `packages/app/src/components/visualNode/ZoomedOutVisualNodeContent.tsx` — same

**Lines removed:** ~10 (atom reads + imports)
**Subscriptions removed:** 2 redundant `resolvedGraphSelectionState` subscriptions
**Risk:** Low — same data, different wiring

---

## 5. Inline `getNodeExecutionStatus`

**Problem:** `getNodeExecutionStatus(runData)` is `return runData?.status?.type` — a
single optional chain. It's only called from `getNodeExecutionClassFlags` in the same file.
It's exported and tested, but the test just verifies `undefined?.status?.type === undefined`.

**Fix:** Inline the optional chain into `getNodeExecutionClassFlags`. Remove the export and
update the test to test `getNodeExecutionClassFlags` directly (which it already does too).

**Files:**
- `packages/app/src/state/selectors/executionSelectors.ts` — inline, remove function
- `packages/app/src/state/selectors/executionSelectors.test.ts` — remove the
  `getNodeExecutionStatus` test case (it's already covered by the classFlags test)

**Lines removed:** ~5
**Risk:** Trivial

---

## 6. Remove dead code

**6a. Dead re-export in useCurrentExecution.ts**

`useCurrentExecution.ts` line 5: `export { fixDataValueUint8Arrays } from '../utils/executionDataTransforms'`

Nobody imports `fixDataValueUint8Arrays` from `useCurrentExecution`. The only consumer
(`useNodeExecutionEvents.ts`) imports directly from `executionDataTransforms`.

**6b. Unused import in ChatViewer.tsx**

`ChatViewer.tsx` line 33: `import { useCurrentExecution } from '../hooks/useCurrentExecution'`

The import is present but `useCurrentExecution` is never called in the file.

**Files:**
- `packages/app/src/hooks/useCurrentExecution.ts` — remove re-export line
- `packages/app/src/components/ChatViewer.tsx` — remove unused import

**Lines removed:** 2
**Risk:** None

---

## 7. Combine execution status atoms

**Problem:** Three related atoms track execution status independently:
- `graphRunningState` (boolean)
- `graphStartTimeState` (number | undefined)
- `graphPausedState` (boolean)

These are always set together in `onStart` (set running + time + clear paused), `stopAll`
(clear running + paused), and individually for pause/resume. Having them separate makes it
possible to get into inconsistent states (e.g. paused but not running).

**Fix:** Combine into a single `graphExecutionStatusState` atom:

```typescript
type GraphExecutionStatus =
  | { type: 'idle' }
  | { type: 'running'; startedAt: number }
  | { type: 'paused'; startedAt: number };

export const graphExecutionStatusState = atom<GraphExecutionStatus>({ type: 'idle' });
```

**Writer:** `useGraphExecutionEvents.ts` — the only file that sets all three atoms.

**Readers** (4 files):
- `ActionBar.tsx` — reads `graphRunning` + `graphPaused`
- `ChatViewer.tsx` — reads `graphRunning`
- `StatusBar.tsx` — reads `graphRunning` + `graphStartTime`
- `executionSelectors.ts` — `getActionBarExecutionState` takes `graphRunning` + `graphPaused`

Each reader would change from `useAtomValue(graphRunningState)` to deriving from the
status type: `status.type !== 'idle'` for running, `status.type === 'paused'` for paused,
`'startedAt' in status ? status.startedAt : undefined` for start time.

**Trade-off:** The read side becomes slightly more verbose (discriminated union vs. bare
boolean). The write side becomes simpler and impossible states are prevented. Net code
change is roughly neutral. If this feels like churn over style, skip it.

**Files:**
- `packages/app/src/state/dataFlow.ts` — replace 3 atoms with 1
- `packages/app/src/hooks/useGraphExecutionEvents.ts` — update setter calls
- `packages/app/src/components/ActionBar.tsx` — derive from status
- `packages/app/src/components/ChatViewer.tsx` — derive from status
- `packages/app/src/components/StatusBar.tsx` — derive from status
- `packages/app/src/state/selectors/executionSelectors.ts` — update parameter types

**Lines removed:** ~5 (net)
**Risk:** Medium — touches 6 files for a modest improvement

---

## What we're NOT changing

- **Hook composition pattern** (`useCurrentExecution` spreading 3 hooks) — deliberately
  created in refactor #14
- **`createProcessEventDispatcher`** — the type casting is necessary for untyped WebSocket
  messages; the 17-function object is verbose but readable and correct
- **Data storage model** (`lastRunDataByNodeState` as `Record<NodeId, ProcessDataForNode[]>`)
  — explicitly deferred as Tier 4 in the simplification plan
- **`getGraphRunsForView` fallback logic** — the one correct place for key mismatch handling
- **Core engine event model** (`GraphExecutionMetadata`, `SubprocessorBridge`, `ProcessEvents`)
- **`resolvedGraphSelectionState` derived atom** — centralized in refactor #48
- **`onPartialOutput` inline produce for split-run** — the split-run path is genuinely
  different from `setDataForNode` (stores in `splitOutputData[index]` vs `outputData`);
  making `setDataForNode` handle both would increase its complexity rather than reduce it
- **`getSelectedProcessRun` wrapper** — 3 call sites use it; inlining `.data` would save
  nothing meaningful
- **`getGraphSelectionOptions` wrapper** — used by the derived atom; inlining would make the
  atom harder to read

---

## Implementation order

1. **Item 6** (dead code removal) — zero risk, clean up noise first
2. **Item 5** (inline `getNodeExecutionStatus`) — trivial, shrinks selector file
3. **Item 2** (sanitization helper) — simple extraction
4. **Item 3** (graph run history helper) — simple extraction
5. **Item 1** (deduplicate preloading) — slightly more involved wiring
6. **Item 4** (pass `selectedProcessRun` as prop) — touches 3 component files
7. **Item 7** (combine execution status atoms) — widest blast radius, do last

---

## Verification

- `npx vitest --project app run` — all app tests pass
- `npx vitest --project core run` — all core tests pass
- `npx tsc --noEmit` from `packages/app` and `packages/core` — clean
- Manual: run a graph in Browser mode — verify running indicators and dataflow display
- Manual: run a graph in Node mode — verify same behavior
- Manual: run a split-sequential subgraph — verify run switcher and per-run data display
