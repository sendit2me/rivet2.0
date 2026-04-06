# Remember Per-Project Editor View On Reopen

## Summary

The repo already partially implements this, but the behavior is split across the wrong places and misses key restore paths.

What exists today:

- the current graph object itself is persisted through `graphState`
- the current project is persisted through `projectState`
- the currently open graph id is shadowed into `projectsState.openedProjects[projectId].openedGraph`
- canvas pan/zoom is cached in `lastCanvasPositionByGraphState`

Why it still fails “from time to time”:

1. `openedGraph` is tied to open tabs, so it is lost when a project tab is closed.
2. canvas positions are keyed only by `graphId`, not by project, so they can bleed across files that reuse graph ids.
3. subgraph drill-in context is not persisted at all; `graphNavigationStackState` is in-memory only.
4. startup does not go through the same restore path as `loadProject()` / `switchGraph()`, so pan/zoom and navigation stack are not reliably reconstructed on app boot.
5. hybrid storage writes are debounced, so a save followed by a quick close/reopen can lose the latest editor state even if the feature is otherwise “implemented”.
6. the current viewport cache is updated only from canvas pan/zoom mouse handlers, so programmatic camera changes such as center-on-graph, focus-on-node, or other direct `setPosition(...)` paths are not persisted consistently.
7. a naïve “sync current editor state” hook would race startup and overwrite the good persisted editor state with the boot-time empty navigation stack and default canvas position before restore completes.

The implementation should stay editor-side only. Do not add this to the project file.

Chosen product decisions:

- persist editor state by `project.metadata.id`
- restore the exact graph navigation context, not just the visible graph id
- keep this state outside the saved `.rivet-project` file
- guarantee that explicit project save durably persists the latest editor view state before the save completes
- startup restore should be lightweight and should not re-run the full `loadProject()` side-effect path

## Important Internal Changes

No project-file schema changes. No core/runtime protocol changes.

Add a new app-side persisted editor-state model, keyed by project id:

```ts
type PersistedCanvasPosition = {
  x: number;
  y: number;
  zoom: number;
};

type ProjectEditorState = {
  navigationStack: GraphNavigationStack;
  canvasPositionsByGraph: Record<GraphId, PersistedCanvasPosition | undefined>;
};

type ProjectEditorStateByProjectId = Record<ProjectId, ProjectEditorState | undefined>;
```

Add a new persisted atom in a new module:

- [projectEditor.ts](/d:/Programming/Rivet2.0/packages/app/src/state/projectEditor.ts)

Recommended exports:

```ts
export const projectEditorStateByProjectIdState = atomWithStorage<ProjectEditorStateByProjectId>(...);
export const projectEditorHydratedState = atom(false);
```

Important storage boundary:

- store `projectEditorStateByProjectIdState` in the existing grouped `project` hybrid storage, not a separate top-level storage namespace, so project-tab metadata and editor-view state can be flushed durably together

Add pure restore/sanitize helpers in a new module:

- [projectEditorState.ts](/d:/Programming/Rivet2.0/packages/app/src/utils/projectEditorState.ts)

Recommended helpers:

```ts
sanitizeNavigationStackForProject(...)
getActiveGraphView(...)
getActiveGraphId(...)
buildCurrentProjectEditorStateSnapshot(...)
resolveProjectEditorRestoreTarget(...)
pruneCanvasPositionsForProject(...)
```

Extend grouped hybrid storage with an explicit flush API:

- [hybridStorage.ts](/d:/Programming/Rivet2.0/packages/app/src/state/storage/hybridStorage.ts)

Recommended export:

```ts
flushHybridStorageGroup(mainKey: string): Promise<void>;
```

This must cancel any pending debounced write for that group and persist the current in-memory grouped value immediately.

## Implementation

### DONE — 1. Add a dedicated per-project editor-state store

Create [projectEditor.ts](/d:/Programming/Rivet2.0/packages/app/src/state/projectEditor.ts) and make it the new source of truth for reopen behavior.

Store:

- exact `graphNavigationStackState` shape
- per-graph canvas positions for that project

Important rules:

- key by `ProjectId`, not by file path
- keep state even when a project tab is closed
- do not delete this state from `handleCloseProject(...)`
- do not put any of this into `Project.metadata` or serialized project output

This store is the correct boundary because the requested behavior is editor state, not project data.

### DONE — 2. Make restore logic project-scoped and exact

Create [projectEditorState.ts](/d:/Programming/Rivet2.0/packages/app/src/utils/projectEditorState.ts) with pure logic for restore resolution.

That logic must:

- sanitize a saved navigation stack against the current project graphs
- drop stack entries whose `graphId` no longer exists
- drop stack entries whose `parent.parentGraphId` no longer exists
- drop stack entries whose `parent.parentNodeId` no longer exists in the parent graph
- clamp or repair `index` into the valid stack range
- derive the active graph/view from the sanitized stack
- prune `canvasPositionsByGraph` to graphs that still exist in the project

Restore precedence must be:

1. explicit load target supplied by the caller
2. sanitized persisted project editor state
3. legacy `openedGraph` fallback from `OpenedProjectInfo`
4. existing main-graph fallback
5. existing sorted-graph fallback
6. empty graph fallback

Viewport precedence for the chosen graph must be:

1. persisted project-scoped canvas position
2. legacy `lastCanvasPositionByGraphState` fallback during migration only
3. existing `center` / `reset` behavior

### DONE — 3. Persist navigation stack continuously, not just the graph id

Add a new hook:

- [useSyncCurrentProjectEditorState.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useSyncCurrentProjectEditorState.ts)

This hook should mirror current editor state into `projectEditorStateByProjectIdState` for the active project.

It should watch:

- current project id
- `graphNavigationStackState`
- current graph id
- current canvas position
- current project graph set

Behavior:

- do nothing until `projectEditorHydratedState` is `true`
- ensure the active project has a `ProjectEditorState` entry
- write the full current `graphNavigationStackState`
- update `canvasPositionsByGraph[currentGraphId]` from the current `canvasPositionState`
- prune stale graph ids when graphs are removed or renamed away

Implementation rule:

- persist from shared state atoms, not from canvas input handlers
- this hook must observe `canvasPositionState` directly so that all camera changes are captured, including mouse pan/zoom, `centerViewOnGraph(...)`, `useGoToNode(...)`, `useFocusOnNodes(...)`, and restored positions from graph/project transitions
- do not make NodeCanvas mouse handlers the primary persistence path

Keep [useSyncCurrentStateIntoOpenedProjects.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useSyncCurrentStateIntoOpenedProjects.ts), but downgrade `openedGraph` to compatibility/fallback only. It should no longer be the primary restore source.

### DONE — 4. Stop relying on global `graphId`-only viewport persistence for reopen

Keep [graphBuilder.ts](/d:/Programming/Rivet2.0/packages/app/src/state/graphBuilder.ts)’s `lastCanvasPositionByGraphState` only as a migration/runtime compatibility fallback in this pass.

Primary behavior must move to the new project-scoped editor state.

Safe implementation choice:

- dual-write during this pass
- keep writing `lastCanvasPositionByGraphState` so existing same-session graph-switch behavior does not regress while the new store is adopted
- have the new sync/snapshot path also backfill project-scoped positions from the legacy `lastCanvasPositionByGraphState` when no project-scoped position exists yet
- use project-scoped state as the primary restore source in load/startup flows

This keeps the rollout safe while eliminating cross-project restore collisions.

### DONE — 5. Make startup go through the same restore path as normal project loads

Add a bootstrap hook:

- [useRestorePersistedWorkspace.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useRestorePersistedWorkspace.ts)

Call it from [RivetApp.tsx](/d:/Programming/Rivet2.0/packages/app/src/components/RivetApp.tsx).

Responsibilities:

- run once after the app has mounted and storage has been initialized
- if a current persisted project exists, restore only the missing workspace-view state using the same pure restore-resolution rules as normal project-open flows
- restore:
  - active graph/subgraph context from persisted `ProjectEditorState.navigationStack`
  - canvas position and zoom for the active graph
- mark `projectEditorHydratedState` `true` only after this restore decision has been applied
- avoid fighting later user actions:
  - only run once per app boot
  - do not keep re-applying state after the initial restore

Important implementation constraint:

- do not call `workspaceTransitions.loadProject()` or otherwise re-run full project-load side effects from this boot hook
- the current project is already present through persisted `projectState`
- use the existing current project plus the shared restore helper to set only:
  - `graphNavigationStackState`
  - `canvasPositionState`
  - `graphState` if, and only if, the resolved active graph id differs from the currently persisted `graphState.metadata?.id` or the current graph is invalid for the current project
- if the resolved active graph id already matches the current `graphState`, leave `graphState` untouched so boot restore does not clobber unsaved graph edits that currently survive through persisted `graphState`

This closes the current startup gap where `graphState` survives but `canvasPositionState` and `graphNavigationStackState` do not.

### DONE — 6. Make save durably persist editor state before the save completes

Extend [hybridStorage.ts](/d:/Programming/Rivet2.0/packages/app/src/state/storage/hybridStorage.ts) with `flushHybridStorageGroup(mainKey)`.

Implementation requirements:

- grouped storage instances must register enough metadata to be flushable later
- flushing must write `memoryStorage.get(mainKey)` directly to the async backend
- flushing must cancel any pending debounced write for that same group to avoid stale out-of-order persistence
- registration must be idempotent per `mainKey`, because tests or multiple modules may create grouped storage for the same key

Then update [useWorkspaceTransitions.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useWorkspaceTransitions.ts):

Before either `saveProjectData(...)` or `saveProjectDataNoPrompt(...)`:

1. persist the current project editor snapshot into `projectEditorStateByProjectIdState`
2. flush the `project` storage group
3. continue with file save

This is the critical reliability fix for the user’s “I saved, then reopened, and it wasn’t remembered” complaint.

### DONE — 7. Make all reopen flows consult the new editor state

Update these flows to use the new restore resolution:

- [useWorkspaceTransitions.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useWorkspaceTransitions.ts)
- [workspaceTransitions.ts](/d:/Programming/Rivet2.0/packages/app/src/utils/workspaceTransitions.ts)
- [useLoadProject.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useLoadProject.ts)
- [useLoadProjectWithFileBrowser.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useLoadProjectWithFileBrowser.ts)

Specific behavior:

- `loadProject()` should restore the exact saved navigation stack if no explicit graph/view override was requested
- `createProjectLoadTransition(...)` must support an explicit restored navigation stack, not always rebuild a one-entry root stack
- selecting a project tab must restore the saved subgraph context and viewport for that project
- reopening a previously closed project from disk must also restore the saved context because the new store is independent of open tabs
- callers that only want “default reopen behavior” must stop pre-resolving `graphToLoad` too early, because that would bypass persisted editor-state restore
  - [useLoadProjectWithFileBrowser.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useLoadProjectWithFileBrowser.ts) should let `loadProject()` resolve from persisted editor state by default
  - [useLoadProject.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useLoadProject.ts) should do the same for reopened tabs/snapshots
  - [useNewProject.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useNewProject.ts) and [useNewProjectFromTemplate.ts](/d:/Programming/Rivet2.0/packages/app/src/hooks/useNewProjectFromTemplate.ts) may still pass an explicit initial graph because they are creating a fresh workspace, not reopening an existing remembered one

Do not leave graph restore split between:
- `OpenedProjectInfo.openedGraph`
- `graphState`
- `lastCanvasPositionByGraphState`

After this change, those are fallback/compatibility inputs, not the main restore model.

### DONE — 8. Keep project-close semantics safe

Update [ProjectSelector.tsx](/d:/Programming/Rivet2.0/packages/app/src/components/ProjectSelector.tsx) so closing a project tab:

- still removes the tab entry
- still removes transient in-memory snapshot state
- does not remove persisted `ProjectEditorState`

Before switching away or closing the current project, persist the latest current project editor snapshot first.

This avoids losing the latest active view because of effect timing.

## Testing

### Pure tests

Add [projectEditorState.test.ts](/d:/Programming/Rivet2.0/packages/app/src/utils/projectEditorState.test.ts) covering:

- valid navigation stack stays intact
- invalid graph ids are removed
- invalid parent graph ids are removed
- invalid parent node ids are removed
- invalid stack index is clamped/repaired
- active graph resolves from sanitized stack
- stale canvas positions are pruned
- restore precedence:
  - explicit graph/view override
  - saved editor state
  - legacy openedGraph fallback
  - main graph
  - sorted graph
  - empty graph
- boot restore preserves the existing persisted `graphState` when its graph id already matches the resolved active graph

### Storage tests

Extend [hybridStorage.test.ts](/d:/Programming/Rivet2.0/packages/app/src/state/storage/hybridStorage.test.ts) to cover:

- grouped writes remain buffered in memory before debounce
- `flushHybridStorageGroup('project')` immediately persists the current grouped value
- flushing after multiple rapid writes persists the latest grouped snapshot
- a pending debounced write does not overwrite the flushed latest value afterward
- registering the same grouped key more than once remains safe and still flushes the latest value

### Transition tests

Extend [workspaceTransitions.test.ts](/d:/Programming/Rivet2.0/packages/app/src/utils/workspaceTransitions.test.ts) with:

- project load restores saved project-scoped viewport
- project load restores saved navigation stack instead of forcing a root stack
- invalid saved editor state falls back cleanly
- explicit load target still overrides saved editor state
- boot restore uses the same pure resolution logic without going through the full project-load side effects

### Focused integration/static tests

Add or extend tests around:

- [openedProjects.test.ts](/d:/Programming/Rivet2.0/packages/app/src/utils/openedProjects.test.ts)
  - only if needed to lock `openedGraph` as fallback-only compatibility behavior
- new hook tests only if the repo already has a stable harness for these hooks

Do not spend this pass on brittle DOM-heavy tests for canvas motion.

## Manual Verification

1. Open a project, switch to a non-main graph, pan and zoom, save, close the app, reopen the app.
   - The same project is active.
   - The same graph is visible.
   - The same pan/zoom is restored.

2. Open a project, drill into a subgraph, pan and zoom, save, reopen.
   - The same subgraph is open.
   - Back/forward graph navigation still reflects the prior drill-in context.
   - The same pan/zoom is restored.

3. Open project A and B, change graph/view in A, switch to B, then back to A.
   - A restores the same graph context and viewport.

4. Close a project tab after saving, then reopen that same file from disk.
   - The same graph/subgraph and viewport are restored.

5. Save, then immediately close and reopen the app.
   - The latest graph/view state is still restored.
   - This specifically verifies the new `project`-group flush-on-save behavior.

6. Delete or rename the previously active graph/subgraph path, then reopen.
   - Restore falls back safely to a valid graph.
   - No crash, no invalid navigation stack.

7. Open two distinct files that intentionally share the same `project.metadata.id`.
   - Editor state is shared between them.
   - This is expected because persistence is keyed by project id by explicit product decision.

## Assumptions And Defaults

- No project-file format change. This is editor-side state only.
- Persistence is keyed by `project.metadata.id`, not file path.
- Exact subgraph drill-in context should be restored, not just the visible graph id.
- Closed-project tabs should not erase remembered editor state.
- Save must durably persist the latest editor state before the save completes.
- `OpenedProjectInfo.openedGraph` remains only as a migration/compatibility fallback in this pass.
- `lastCanvasPositionByGraphState` remains temporarily as a fallback/runtime compatibility mechanism in this pass, but the new project-scoped editor state becomes the primary restore source.
- Startup restore must be hydration-gated so the sync hook cannot overwrite persisted editor state with boot-time defaults.
- Boot restore must be view-only; it must not clobber valid persisted `graphState` content just to rebuild navigation/camera state.
