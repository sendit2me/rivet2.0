# Desktop App Architecture (`@ironclad/rivet-app`)

> Detailed internal reference for refactoring the desktop app.
> Verified against `packages/app`, `packages/app/src-tauri`, and the current hooks/state modules.

## Purpose

`@ironclad/rivet-app` is the interactive IDE layer of the monorepo. It is responsible for:

- project loading and saving
- graph editing
- node rendering and canvas interaction
- graph execution orchestration
- plugin loading and plugin management UI
- Trivet test execution UI
- prompt-designer UI
- dataset/community/debugger/update overlays
- bridging browser code to Tauri-native capabilities

The app is not just a thin client over `rivet-core`. A large amount of product behavior lives here in React components, Jotai state, commands, and hooks.

## Stack

Current major libraries:

- React 18
- Vite 6
- Tauri 1.x
- Jotai 2
- Emotion
- Atlaskit
- `@dnd-kit`
- TanStack React Query
- Monaco Editor
- `react-toastify`
- `use-async-effect`
- `immer`

## Source Layout

```text
packages/app/src/
  components/   Main UI tree, canvas, overlays, editors
  commands/     Undo/redo command implementations
  hooks/        Execution, loading, graph editing, view logic
  io/           Browser/Tauri/legacy project I/O adapters
  model/        App-specific runtime helpers
  providers/    Context providers for IO, datasets, audio, etc.
  state/        Jotai atoms, selectors, storage helpers
  utils/        Shared helpers
packages/app/src-tauri/
  Rust backend for native dialogs, env, plugin extraction, packaging, updater
```

Key entry points:

- [`packages/app/src/App.tsx`](../packages/app/src/App.tsx)
- [`packages/app/src/components/RivetApp.tsx`](../packages/app/src/components/RivetApp.tsx)
- [`packages/app/src/components/GraphBuilder.tsx`](../packages/app/src/components/GraphBuilder.tsx)
- [`packages/app/src/components/NodeCanvas.tsx`](../packages/app/src/components/NodeCanvas.tsx)

## Top-Level Composition

The root visible shell is built in `RivetApp.tsx`.

There are two major render modes:

### No-project mode

Rendered when `openedProjectsSortedIdsState` is empty.

Includes:

- `NoProject`
- `NewProjectModalRenderer`
- `SettingsModal`
- `HelpModal`
- global toast containers

### Full IDE mode

Rendered when at least one project is open.

Current composition:

```text
RivetApp
|- ProjectSelector
|- OverlayTabs
|- ActionBar
|- StatusBar
|- DebuggerPanelRenderer
|- LeftSidebar
|  |- GraphList
|  |- GraphInfoSidebarTab
|  `- ProjectInfoSidebarTab
|- GraphBuilder
|  |- NodeCanvas
|  |- NodeEditorRenderer
|  |- NavigationBar
|  |- GraphExecutionSelectorBar
|  |- HistoricalGraphNotice
|  |- UserInputModal
|  |- NodeChangesModalRenderer
|  |- AiGraphCreatorInput
|  `- AiGraphCreatorToggle
|- SettingsModal
|- PromptDesignerRenderer
|- TrivetRenderer
|- ChatViewerRenderer
|- DataStudioRenderer
|- PluginsOverlayRenderer
|- UpdateModalRenderer
|- NewProjectModalRenderer
|- CommunityOverlayRenderer
|- HelpModal
`- ToastContainer(s)
```

This is important for refactors because many "global" behaviors are actually distributed across overlay renderers rather than centralized in a router or modal manager.

## Main Architectural Areas

The app can be thought of as six cooperating subsystems:

1. Shell and project/workspace UI
2. Graph editor and canvas
3. State/persistence layer
4. Execution layer
5. Plugin and extension layer
6. Native/platform integration

## Shared async UI helper boundary

The app now uses small shared async helpers for a subset of UI work:

- `wrapAsync(...)` for routine async UI handlers that only need consistent error reporting
- `useHandledMutation(...)` for React Query mutations that share the same error/invalidation/completion shape
- `syncWrapper(...)` only as a compatibility alias over `wrapAsync(...)`

These helpers are intentionally scoped.

They are a good fit for:

- utility buttons
- browse/open actions
- straightforward form submissions
- template/profile/community mutations with ordinary invalidation and toast/error handling
- dataset actions that are just "persist then reload"

They are not a good fit for flows that also own:

- rollback or partial-failure handling
- cross-store coordination
- multi-step workspace transitions
- executor/session orchestration
- recovery behavior that must stay explicit at each step

Within `useHandledMutation(...)`, callback timing also matters:

- `onMutate` is for optimistic or pre-request work that may happen before the network call settles
- `onSuccess` is for success-only follow-up such as closing dialogs, dismissing publish flows, or showing completion-only UI state

If a mutation still performs a multi-step operation inside `mutationFn` itself, any rollback or cleanup for partially completed work should stay explicit inside that mutation body rather than being delegated to the shared helper.

In those cases the app should keep explicit `try/catch` structure close to the orchestration logic instead of hiding control flow behind a generic wrapper.

## Shell and Workspace UI

### `ProjectSelector`

Handles open-project switching and the top-of-window project context.

Current workspace behavior:

- creating a new blank project or template project adds a new open-project tab instead of replacing the existing open-project set
- a new blank project now starts with one real saved graph named `Untitled Graph`, and that graph is also seeded as the project's `mainGraphId`
- `projectsState` is the canonical multi-project tab store; `openedProjectsState` and `openedProjectsSortedIdsState` are compatibility projections over it
- `projectsState` stores only lightweight tab metadata: `projectId`, title, `fsPath`, and `openedGraph`
- `openedGraph` is now a compatibility/fallback hint for project-open flows, not the primary source of remembered editor view state
- exact editor-view restore state lives in `projectEditorStateByProjectIdState`, keyed by `project.metadata.id` and persisted under the grouped `project` storage namespace
- `useSyncCurrentStateIntoOpenedProjects` keeps tab metadata and inactive-project content snapshots in sync, while `useSyncCurrentProjectEditorState` mirrors the active project's navigation stack and canvas positions into `projectEditorStateByProjectIdState` after boot hydration
- successful project saves clear any persisted inactive-project snapshot for that project and flush the grouped `project` storage so tab metadata and editor-view state are durable together
- closing/reordering project tabs still lives in `ProjectSelector.tsx`, and closing a background tab no longer triggers a neighbor-project load

### `ActionBar`

Surface for run, test, pause, resume, abort, and related execution actions. It delegates actual behavior to `useGraphExecutor`.

### `SettingsModal`

The settings UI is still coordinated by [`packages/app/src/components/SettingsModal.tsx`](../packages/app/src/components/SettingsModal.tsx), but the page content is no longer kept in one large component file.

Current structure:

- [`packages/app/src/components/settings/SettingsPages.tsx`](../packages/app/src/components/settings/SettingsPages.tsx) is now just a barrel export
- individual settings pages live under [`packages/app/src/components/settings/pages/`](../packages/app/src/components/settings/pages)
- shared plugin-config form rendering for the plugin pages lives in [`packages/app/src/components/settings/pages/PluginSettingsSection.tsx`](../packages/app/src/components/settings/pages/PluginSettingsSection.tsx)

This is a better refactor seam because settings page changes no longer require editing one large file that mixes general preferences, OpenAI settings, plugin settings, custom plugin pages, and update behavior.

### `LeftSidebar`

A fixed left rail controlled by `sidebarOpenState`.

Tabs:

- `Graphs`
- `Graph Info`
- `Project`

The `Graphs` tab hosts `GraphList`, which is no longer a single all-in-one implementation. Graph CRUD and drag/drop logic have been split into hooks.

### `OverlayTabs`

Acts as the switchboard for overlay-like product areas such as prompt designer, Trivet, chat viewer, community, and other auxiliary surfaces.

## Graph Editor

The graph editor is the heaviest interactive part of the app.

Main chain:

```text
GraphBuilder
`- NodeCanvas
   |- DraggableNode (per visible node)
   |  `- VisualNode
   |     |- NormalVisualNodeContent
   |     `- ZoomedOutVisualNodeContent
   |- DragOverlay
   |- ContextMenu
   |- WireLayer
   |- Selection box
   `- PortInfo tooltip
```

### `GraphBuilder`

`GraphBuilder` is the orchestrator around the canvas rather than the canvas itself.

Current responsibilities:

- read/write nodes and connections through Jotai
- drive selection and editing state
- install graph-history mouse navigation
- trigger project-plugin loading with `useProjectPlugins`
- reload project references
- attach dataset lifecycle hooks
- host user-input modal behavior
- show read-only or recording borders
- host secondary canvas-adjacent UI like navigation bar and graph execution selector

Notable detail: user-input flow is not owned by the executor hooks alone. `GraphBuilder` also participates by reading `userInputModalQuestionsState`, showing the modal, and passing results back through `submitUserInputAnswers(...)`.
The AI graph-builder path now also depends on extracted plain helpers in [`packages/app/src/hooks/aiGraphBuilderHelpers.ts`](../packages/app/src/hooks/aiGraphBuilderHelpers.ts); those helpers must resolve port connectivity relative to the requested node, not just by shared port ids like `input` or `output`, or graph review/edit operations can report the wrong edges.

### `NodeCanvas`

`NodeCanvas` is the actual interactive viewport.

Current responsibilities:

- pan/zoom interaction
- selection-box interaction
- drag-to-connect wires
- node drag integration via `@dnd-kit`
- per-node rendering and visibility filtering
- context menu display and dispatch
- hotkeys for delete, copy, search, and canvas actions
- port-position tracking for wire rendering
- zoomed-out rendering decisions
- drag overlay rendering

The component is still one of the heavier files, but it is no longer one all-in-one render surface.

Current structure:

- [`packages/app/src/components/NodeCanvas.tsx`](../packages/app/src/components/NodeCanvas.tsx) now coordinates canvas state, hotkeys, and command wiring
- viewport transform application and node/drag-overlay rendering live in [`packages/app/src/components/nodeCanvas/NodeCanvasViewport.tsx`](../packages/app/src/components/nodeCanvas/NodeCanvasViewport.tsx)
- context menu, selection box, wire layer, and port tooltip rendering live in [`packages/app/src/components/nodeCanvas/NodeCanvasOverlays.tsx`](../packages/app/src/components/nodeCanvas/NodeCanvasOverlays.tsx)
- mouse pan/zoom/selection-box/context-menu handlers live in [`packages/app/src/components/nodeCanvas/useNodeCanvasInteractions.ts`](../packages/app/src/components/nodeCanvas/useNodeCanvasInteractions.ts)
- canvas styling lives in [`packages/app/src/components/nodeCanvas/nodeCanvasStyles.ts`](../packages/app/src/components/nodeCanvas/nodeCanvasStyles.ts)

This keeps the top-level component closer to an orchestration layer and makes viewport math, overlay rendering, and interaction sequencing reviewable in isolation.

### Extracted hook seams in `NodeCanvas`

These are important refactor boundaries because they represent work already separated from the monolith:

- `useSelectionBox`
- `usePortHoverTooltip`
- `useDraggingNode`
- `useDraggingWire`
- `useCanvasPositioning`
- `useViewportBounds`
- `useWireDragScrolling`
- `useNodePortPositions`
- `useCanvasHotkeys`
- `useSearchGraph`
- `useVisibleCanvasNodes`
- `useAutoLayoutGraph`

This means refactors should usually start in those hooks before pushing more logic back into `NodeCanvas`.

`useDraggingNode` now owns more than a thin `@dnd-kit` bridge. It is the drag-session state machine for node moves and `Alt`-drag duplication:

- initial duplicate intent is captured from the node drag handle rather than inferred from `DragStartEvent`
- live `Alt` press/release during a drag switches the session between move and duplicate mode
- the drag cohort is canonicalized against `nodesById`, so stale selected node ids are filtered out before drop handling
- the hook exposes explicit overlay policy through `draggingNodes` and `draggingConnectionSourceNodeIds` instead of relying on implicit render-side behavior

### Canvas edit history and wire-preview model

Standard canvas edits are now expected to be command-backed rather than direct graph mutations.

The current command-backed canvas surface includes:

- add node
- delete node(s)
- move node(s)
- edit node / commit resize
- make connection
- break connection
- rewire connection
- duplicate node / dragged node cohort
- paste nodes
- auto-layout

Node resize has a narrower contract than that generic list might imply:

- normal node resize is width-only; height remains body/output-driven rather than user-persisted
- the live drag path updates `visualData.x` and `visualData.width` together so left-edge resizes preserve the right edge
- the committed resize still goes through `editNode`, so undo/redo treats the whole edge-resize gesture as one command
- edge handles live just outside the node border and the port layer sits above them, so connector hit targets keep winning over resize cursors

Per-graph undo/redo stacks still live in [`packages/app/src/commands/Command.ts`](../packages/app/src/commands/Command.ts).
That history is intentionally scoped to the canvas editing surface. Flows that replace the
current graph's `nodes` or `connections` without going through commands, such as AI graph
rewrites, historical-graph swaps, or prompt-designer graph mutations, should clear the
current graph's history rather than leaving stale commands behind.

Wire dragging now has an important transactional invariant:

- dragging from an already-connected input must not mutate `connectionsState` on drag start
- `draggingWireState` carries `originalConnection` and `rewireSourceInput` metadata for input-origin rewires
- drop resolution flows through [`packages/app/src/domain/graphEditing/wireDragActions.ts`](../packages/app/src/domain/graphEditing/wireDragActions.ts), which resolves a gesture into one semantic action: make connection, rewire connection, break connection, or no-op
- a completed rewire or disconnect is therefore one undo step

Canvas rendering during a rewire uses preview selectors instead of temporarily mutating the
real graph:

- [`packages/app/src/state/selectors/canvasGraphSelectors.ts`](../packages/app/src/state/selectors/canvasGraphSelectors.ts) exposes `canvasPreviewConnectionsState`
- `canvasPreviewConnectionsState` hides the original wire during an input-origin rewire preview
- the same module exposes `canvasIoDefinitionsForNodeState`, which derives preview-aware port definitions for canvas consumers
- the active rewire source node keeps its real node-local connections for IO derivation so connection-count-driven ports do not collapse under the cursor during preview

When changing canvas behavior, wires, connected-port badges, hover targeting, and port tooltips
should stay on the same preview-aware selector path. Mixing raw `connectionsState` with
preview-aware canvas selectors is a regression risk because dynamic ports can diverge from what
the wire layer is showing.

### Viewport model

Viewport state lives in `canvasPositionState` and uses:

```ts
type CanvasPosition = { x: number; y: number; zoom: number; fromSaved?: boolean };
```

`NodeCanvas` applies the viewport via a CSS transform on `.canvas-contents` and also adjusts the grid background size/position independently.

Important rendering constraint:

- keep the viewport transform 2D; `translateZ(...)` / forced 3D layer promotion on `.canvas-contents` causes visible text/icon anti-aliasing shifts when hovered nodes repaint
- the current viewport path intentionally avoids `translateZ(...)` and `will-change: transform` for that reason

Durable viewport/navigation restore now lives in `projectEditorStateByProjectIdState`, which stores:

- the current `graphNavigationStackState`
- project-scoped `canvasPositionsByGraph`

Important nuance:

- this state is keyed by `project.metadata.id`, not just `graphId`, so different projects that reuse graph IDs do not bleed viewport state into each other
- `useSyncCurrentProjectEditorState` persists from `canvasPositionState` and `graphNavigationStackState` rather than from mouse handlers, so programmatic camera moves such as focus/center operations are also captured
- `useRestorePersistedWorkspace` performs a one-shot boot restore of graph view and viewport without re-running the full project-load path
- `projectEditorHydratedState` gates the active-project sync hook so boot-time defaults do not overwrite persisted editor state before restore runs
- `lastCanvasPositionByGraphState` still exists as a same-session/compatibility cache and migration fallback, but it is no longer the primary reopen source

### Rendering strategy

Key current behaviors:

- nodes outside the visible viewport are skipped via `useVisibleCanvasNodes`
- wires are only rendered above a zoom threshold
- nodes use a distinct zoomed-out content renderer below zoom thresholds
- move drags remove source nodes from the main render pass and show them via `DragOverlay`
- duplicate drags keep the source nodes visible in place and show duplicate preview nodes in `DragOverlay`
- drag-overlay wires only follow move drags; duplicate preview is intentionally node-only today
- hover styling is a distinct render path from true selection; hovered nodes get lightweight visual treatment without reusing the stronger selected-node styling

### Contexts instead of prop drilling

`NodeCanvas` provides two React contexts via [`CanvasContext.tsx`](../packages/app/src/components/CanvasContext.tsx):

- `CanvasViewContext`
- `CanvasHandlersContext`

These carry view-state and interaction callbacks down into `VisualNode`, `NormalVisualNodeContent`, `ZoomedOutVisualNodeContent`, and ports.

This is a major structural point: event handlers are no longer passed as a large prop bag through multiple levels.

### `VisualNode`

`VisualNode` is the boundary between canvas-level behavior and per-node UI rendering.

Current responsibilities:

- derive CSS variables from node colors
- choose between normal and zoomed-out rendering
- reflect execution state classes (`success`, `error`, `running`, `not-ran`)
- reflect graph/history state (`selected`, changed, output-expanded, disabled, conditional, split)
- reflect hover state separately from selection state
- start node editing on double-click for known node types

It also depends on both:

- `useCanvasViewContext`
- `useCanvasHandlersContext`

That makes it a key seam when changing how interaction is propagated through the node tree.

Hover targeting is intentionally driven by `mouseenter` / `mouseleave` semantics at the node boundary rather than bubbling `mouseover` / `mouseout`. Regressing that distinction makes hover state flap while moving across child content inside the same node.

## Graph List and Sidebar Graph Management

The sidebar graph tree is no longer just a flat list of graphs.

The app now also has a small internal graph-editing domain layer under:

- [`packages/app/src/domain/graphEditing/nodeActions.ts`](../packages/app/src/domain/graphEditing/nodeActions.ts)
- [`packages/app/src/domain/graphEditing/connectionActions.ts`](../packages/app/src/domain/graphEditing/connectionActions.ts)
- [`packages/app/src/domain/graphEditing/navigationActions.ts`](../packages/app/src/domain/graphEditing/navigationActions.ts)
- [`packages/app/src/domain/graphEditing/graphListActions.ts`](../packages/app/src/domain/graphEditing/graphListActions.ts)

Those modules hold plain graph-editing sequences and state-transition helpers that are reused by commands and hooks.
They also now encode a couple of important behavior invariants that callers rely on:

- node duplication helpers must return structurally independent node data so editing a duplicate does not mutate the original node through shared nested references
- multi-node duplication helpers must preserve the duplicated cohort's internal connections and duplicated incoming connections from external source nodes
- graph-list folder creation helpers must return unique folder paths within the target parent so repeated "new folder" actions do not collide with existing graph or folder names
- folder rename/delete helpers should only rewrite or clear the active graph when the active graph is actually inside the affected folder subtree

### `GraphList`

Responsibilities:

- search UI
- context menu UI for graphs/folders/list root
- DnD container for graph/folder moves
- rendering `FolderItem` recursively

### `useGraphOperations`

Owns graph/folder operations previously bundled into the component:

- search text
- filtered/folderized graph set
- rename in-progress state
- transient folder-name preservation
- new graph creation
- new folder creation
- delete graph
- delete folder
- duplicate graph
- import graph
- rename graph/folder path updates
- graph selection and optional run action

Current boundary:

- `useGraphOperations` is now mostly a UI adapter over `graphListActions.ts`
- graph/folder naming, deletion, and path-rename sequencing are kept out of the React hook body
- command-oriented graph editing behavior can now reuse the same domain helpers instead of rebuilding folder/path logic inline

### `useGraphListDragDrop`

Owns graph/folder drag state:

- active dragged item path
- hovered folder path
- drag start/end/over handlers

This split is a current architectural fact and should be preserved or expanded rather than collapsed during refactors.

## Prompt Designer

The prompt-designer area is still feature-rich, but it has also already been partially decomposed.

### `PromptDesigner`

Current responsibilities:

- overlay lifecycle
- attach to a chat node selected in prompt-designer state
- hydrate prompt-designer config from the attached node
- hydrate initial message list from prior node execution input data
- edit the attached node's test groups
- run ad-hoc chat requests
- run prompt-designer test groups
- show either the current response or test-group results

### Extracted pieces

- `usePromptDesignerMessages`
- `usePromptDesignerAttachedNode`
- `usePromptDesignerRunActions`
- `PromptDesignerConfigPanel`
- `PromptDesignerTestPanel`
- `PromptDesignerMessageList`
- `PromptDesignerResponsePane`
- `PromptDesignerComponents`
- `PromptDesignerTestRunner`

Current architectural detail:

- [`packages/app/src/components/PromptDesigner.tsx`](../packages/app/src/components/PromptDesigner.tsx) now acts as the overlay shell and high-level coordinator
- attached-node syncing, config hydration, and test-group mutation logic live in [`packages/app/src/components/promptDesigner/usePromptDesignerAttachedNode.ts`](../packages/app/src/components/promptDesigner/usePromptDesignerAttachedNode.ts)
- ad-hoc run/test orchestration and abort handling live in [`packages/app/src/components/promptDesigner/usePromptDesignerRunActions.ts`](../packages/app/src/components/promptDesigner/usePromptDesignerRunActions.ts)
- the left and center panes are rendered through [`packages/app/src/components/promptDesigner/PromptDesignerMessageList.tsx`](../packages/app/src/components/promptDesigner/PromptDesignerMessageList.tsx) and [`packages/app/src/components/promptDesigner/PromptDesignerResponsePane.tsx`](../packages/app/src/components/promptDesigner/PromptDesignerResponsePane.tsx)

This keeps prompt-designer overlay composition separate from chat-node syncing and run/test execution state, which makes future changes easier to localize.

## State Model

The app uses Jotai heavily. State is spread across domain files rather than a single store.

### Graph state

Primary graph state is re-exported through [`packages/app/src/state/graph.ts`](../packages/app/src/state/graph.ts).

Important pieces:

- `graphState`
- `nodesState`
- `connectionsState`
- `graphMetadataState`
- `historicalGraphState`
- `historicalChangedNodesState`
- `isReadOnlyGraphState`
- lookup/selectors such as `nodesByIdState`, `nodeByIdState`, `nodeInstanceByIdState`, and IO-definition selectors

Important nuance:

- `graphState` lives in the grouped `graph` hybrid-storage namespace and represents the active editable graph, not an always-live mirror of `projectState.graphs`
- save, graph-switch, and local-execution paths explicitly merge the latest `graphState` back into the project when they need an authoritative project payload

Maintenance-critical detail:

- `cleanupNodeAtomFamilies(nodeIds)` clears node-keyed atom families in graph state, execution state, and graph-builder state.

That cleanup runs during graph/project switching and is explicitly there to prevent leaked/stale atom-family state.

### Graph-builder state

[`packages/app/src/state/graphBuilder.ts`](../packages/app/src/state/graphBuilder.ts) owns canvas/editor interaction state:

- selected nodes
- editing node
- canvas position
- remembered canvas positions per graph
- dragging nodes
- dragging wire, including transactional rewire metadata
- closest valid port during wire drag
- graph navigation stack
- nodes with expanded inline output
- search/go-to UI state
- hovered node
- sidebar visibility
- viewing node changes

### Saved-project state

[`packages/app/src/state/savedGraphs.ts`](../packages/app/src/state/savedGraphs.ts) is broader than the filename suggests.

It owns:

- `projectState`
- referenced projects
- project static data
- loaded project path state
- graph list derived from the project
- project plugin specs
- open-project workspace state
- per-project context values

Important nuance:

- `projectState` is stored as `Omit<Project, 'data'>`
- `savedGraphsState` is a project-backed view over `projectState.graphs`
- active graph edits can exist in `graphState` before they are merged back into `projectState.graphs`; that sync boundary is owned by `useSaveCurrentGraph` and the workspace transition layer
- large attached static data is held separately in `projectDataState`
- per-project context values are persisted separately via `projectContextState(projectId)`
- open-project tab state is persisted separately in `projectsState` but now stores only lightweight tab metadata rather than a full project payload
- full restoration payloads for inactive tabs live in `openedProjectSnapshotsState` and are treated as explicit restoration artifacts instead of the canonical tab model
- when replacing the current project, `projectDataState` is replaced for the new project and the IndexedDB static-data cache is cleared before loading the new project's data

Per-project editor-view persistence now lives in [`packages/app/src/state/projectEditor.ts`](../packages/app/src/state/projectEditor.ts).

That layer owns:

- `projectEditorStateByProjectIdState`
- `projectEditorHydratedState`

Important nuance:

- this is editor-only state and is not serialized into `.rivet-project`
- it stores exact graph-navigation context plus per-graph canvas positions
- it shares the grouped `project` hybrid-storage namespace so save-time flushes persist project tabs and remembered editor view together

### Execution and data-flow state

Execution state is split between:

- `execution.ts`
- `dataFlow.ts`

`execution.ts` owns remote-debugger config and recording pointers.

Important nuance:

- the persisted debugger config still lives in `execution.ts`
- compatibility booleans like `started`/`reconnecting` are still exposed there for older consumers
- the authoritative runtime socket/session lifecycle now lives in `executorSession.ts`

`dataFlow.ts` owns:

- last-run data per node
- running graph IDs
- root graph ID
- graph running/paused flags
- selected process page per node

The app now also has a small selector/helper layer for canonical execution-state derivation:

- [`packages/app/src/state/selectors/executionSelectors.ts`](../packages/app/src/state/selectors/executionSelectors.ts)

That layer centralizes:

- selected process/run lookup for paged node output
- node status-to-class derivation (`success`, `error`, `running`, `not-ran`)
- action-bar run/debugger visibility decisions derived from executor session state

UI consumers such as `ActionBar`, `VisualNode`, `NodeOutput`, `PortInfo`, and the visual-node content renderers should prefer those helpers over recomputing execution semantics locally.

The per-node run data model is rich enough to store:

- input data
- output data
- split-run output data
- start/finish timestamps
- status variants like ok/error/running/interrupted/not-ran

This state directly drives node output rendering and process-page selection in the canvas.

### Graph-view-aware navigation and execution state

The graph navigation stack is no longer just a `GraphId[]` history. It stores graph-view-aware `GraphViewContext` entries from [`navigationActions.ts`](../packages/app/src/domain/graphEditing/navigationActions.ts):

- root graph views use `root:${graphId}` keys
- subgraph views use keys derived from the caller graph and caller node
- two different call sites into the same subgraph definition must remain distinct navigation entries
- backward/forward navigation restores both the graph definition and the graph-view context

`dataFlow.ts` also owns graph-view-aware execution state:

- `currentGraphViewState` derived from the navigation stack
- `graphRunHistoryByViewState`
- `selectedGraphRunByViewState`

This changes the execution selection model in an important way:

- selectors resolve graph runs per view through `getGraphRunsForView(...)`, including the root-view fallback for subgraph history reached from sidebar navigation
- once a run is resolved, node history is filtered by `graphRunId`, not by a stored `graphViewKey`
- if a stored selected graph run becomes stale, selectors fall back to the latest available run for that graph view instead of mixing runs together
- node history entries carry execution identity such as `rootRunId`, `graphRunId`, and `graphId`, so the app does not reconstruct nested execution identity from array position

The execution UI is now intentionally graph-view-aware:

- `GraphExecutionSelectorBar` selects graph runs for the current graph view
- `NodeOutput`, `PortInfo`, `VisualNode`, and `WireLayer` resolve visible execution data through the current graph view plus selected graph run
- follow mode only auto-selects `latest` when the current graph view is still following `latest`; explicit historical selections must not be overwritten by later events

### Settings state

`settings.ts` stores:

- API/settings payload (`settingsState`)
- theme
- record-execution toggle
- default executor
- node-history retention count
- casing preference
- update preferences/state
- zoom sensitivity
- remote debugger default URL

Important distinction:

- `defaultExecutorState` picks browser vs node sidecar by default
- `debuggerDefaultUrlState` is the persisted external debugger URL default
- the internal executor connection still uses `ws://localhost:21889/internal`

### Overlay and UI state

The app also uses other state files such as `ui.ts`, `trivet.ts`, `promptDesigner.ts`, `userInput.ts`, `plugins.ts`, `community.ts`, and `dataStudio.ts` to drive overlay-specific behavior.

## Project Loading and Saving

### `useLoadProject`

Current sequence:

1. snapshot the current project's editor-view state and inactive-tab payload when switching away from an already-loaded project
2. resolve the target graph, graph-view context, navigation stack, and viewport through `resolveProjectEditorRestoreTarget(...)`
3. replace `projectState`
4. apply the resolved navigation stack
5. cleanup old graph node atom families
6. clear read-only/historical state and replace `graphState`
7. hydrate the compatibility `lastCanvasPositionByGraphState` cache from any persisted project-scoped canvas positions
8. restore the resolved viewport or center/reset the canvas
9. clear prior static-data state and load the new project's static data into app state/IndexedDB
10. persist loaded filesystem path
11. load Trivet data if the IO provider supports path-based reads

This hook is a critical refactor seam because it couples project replacement, graph replacement, atom-family cleanup, and Trivet hydration.

Current architectural update:

- `useLoadProject` is now a thin adapter over the shared workspace transition layer
- the transition sequencing itself lives in [`packages/app/src/hooks/useWorkspaceTransitions.ts`](../packages/app/src/hooks/useWorkspaceTransitions.ts)
- pure transition planning lives in [`packages/app/src/utils/workspaceTransitions.ts`](../packages/app/src/utils/workspaceTransitions.ts)
- `workspaceTransitions.loadProject(...)` now reports `true`/`false` so callers that own surrounding UI state can distinguish a completed transition from a handled failure

### `useLoadGraph`

Current sequence:

1. save the current graph back into the project when it represents a real persisted graph
2. cleanup old graph atom families if changing graph IDs
3. replace `graphState`
4. clear selection, historical state, and read-only mode
5. optionally push onto graph navigation history
6. restore last viewport or center on the graph

This hook is the authoritative graph-switch path.

Current architectural update:

- `useLoadGraph` now delegates the shared sequencing to the workspace transition layer
- viewport restoration/centering decisions are derived from transition output rather than repeated inline logic
- current-graph persistence rules now live in [`packages/app/src/utils/currentGraphSave.ts`](../packages/app/src/utils/currentGraphSave.ts) instead of inline "is this graph empty?" checks
- empty graphs are still persisted when they already belong to the project; only the detached `emptyNodeGraph()` placeholder is skipped

### `useSaveProject`

Current behavior:

- saves the current in-memory graph back into the project before persisting
- builds the persisted project payload from the latest Jotai store values at call time rather than relying on render-time snapshots
- persists an existing graph even if the current edit reduced it to zero nodes and zero connections
- uses `saveProjectDataNoPrompt` when a path already exists
- falls back to save-as when needed
- persists Trivet test-suite data alongside the project
- keeps the current open-project tab metadata intact when save/save-as updates the project's persisted path
- shows slow-save toast feedback for large saves

Current architectural update:

- `useSaveProject` is now a thin adapter over the workspace transition layer
- the transition layer owns graph-to-project syncing and the split between save-in-place and save-as
- `useSaveCurrentGraph` now reads Jotai state at invocation time, so save/save-as and graph-switch transitions do not depend on stale render-closure graph data

### Shared workspace transition layer

The app now has a dedicated workspace transition layer under:

- [`packages/app/src/hooks/useWorkspaceTransitions.ts`](../packages/app/src/hooks/useWorkspaceTransitions.ts)
- [`packages/app/src/utils/workspaceTransitions.ts`](../packages/app/src/utils/workspaceTransitions.ts)

Responsibilities are split intentionally:

- `workspaceTransitions.ts` holds pure transition planning and reusable workspace-state helpers
- `useWorkspaceTransitions.ts` binds those transitions to Jotai state, static-data persistence, viewport updates, and optional path-based IO

This matters for future work because it keeps path-based persistence concerns separate from the in-memory workspace flow that a future browser client would also need.

Current boundary:

- load-project, graph-switch, save/save-as, and new blank/template project initialization all reuse this sequencing
- blank-project initialization now goes through the same transition layer with a real project-owned default graph instead of loading a detached placeholder graph into `graphState`
- graph switching now always routes current-graph persistence through `useSaveCurrentGraph` and `currentGraphSave.ts`; the helper decides whether to skip only the detached placeholder graph
- project-tab closing/reordering and active-tab metadata syncing still live outside this layer in `ProjectSelector.tsx` and `useSyncCurrentStateIntoOpenedProjects.ts`
- exact remembered editor view is resolved through `projectEditorState.ts`, synced by `useSyncCurrentProjectEditorState.ts`, and boot-restored by `useRestorePersistedWorkspace.ts`
- boot restore is intentionally view-only: it rehydrates navigation/camera state for the already-loaded project instead of re-running full `loadProject(...)` side effects
- save/save-as flush both the grouped `graph` and `project` storage before completion so edited graph contents, open-project metadata, and remembered graph/subgraph/viewport state survive immediate close-and-reopen paths
- save payload assembly reads the latest `projectState`, `loadedProjectState`, and current graph data from the Jotai store at call time, which avoids stale render-time state during explicit save actions
- external UI state that depends on a completed load, such as adding an opened-project tab or closing the new-project modal, must stay outside the transition layer and only run after `loadProject(...)` resolves `true`
- `loadProject(...)` handles/logs its own transition failures and returns `false` instead of throwing for those transition-stage errors, so callers should branch on the boolean result rather than assume success after awaiting it

## File I/O and Runtime Abstraction

The app has an IO abstraction under `src/io/`:

- `TauriIOProvider`
- `BrowserIOProvider`
- `LegacyBrowserIOProvider`

That abstraction is used so the same app code can work in:

- Tauri desktop mode
- browser environments with modern file APIs
- fallback browser flows

The app also keeps separate provider abstractions for datasets, audio, and related execution-time services through React providers.

## Platform Capability Boundary

The app now has an explicit platform adapter layer under:

- [`packages/app/src/utils/platform/core.ts`](../packages/app/src/utils/platform/core.ts)
- [`packages/app/src/utils/platform/shell.ts`](../packages/app/src/utils/platform/shell.ts)
- [`packages/app/src/utils/platform/app.ts`](../packages/app/src/utils/platform/app.ts)
- [`packages/app/src/utils/platform/window.ts`](../packages/app/src/utils/platform/window.ts)
- [`packages/app/src/utils/platform/dialog.ts`](../packages/app/src/utils/platform/dialog.ts)
- [`packages/app/src/utils/platform/fs.ts`](../packages/app/src/utils/platform/fs.ts)
- [`packages/app/src/utils/platform/path.ts`](../packages/app/src/utils/platform/path.ts)
- [`packages/app/src/utils/platform/http.ts`](../packages/app/src/utils/platform/http.ts)
- [`packages/app/src/utils/platform/updater.ts`](../packages/app/src/utils/platform/updater.ts)

Responsibilities are now split by capability rather than by current desktop implementation:

- `core.ts`: environment detection and native command invocation
- `shell.ts`: external URLs, commands, and sidecars
- `app.ts`: app lifecycle/version helpers
- `window.ts`: window handles and global shortcuts
- `dialog.ts`: open/save dialogs
- `fs.ts`: filesystem reads/writes
- `path.ts`: app data/log paths plus cross-platform path helpers used by revision/project flows and plugin installation paths
- `http.ts`: native/browser HTTP helpers
- `updater.ts`: updater status, install, and event subscription

This is an architectural boundary, not just a file split:

- product hooks/components should depend on the narrow capability they need
- direct `@tauri-apps/api/*` imports are isolated to the platform adapter modules
- browser-safe code paths can continue to import app logic without taking a broad desktop-only dependency at top level
- the browser app build also aliases the deprecated `@google-cloud/vertexai` path to a stub so browser bundles do not pull in node-only Google auth SDKs
- the old `nativeApp.ts` compatibility barrel has been removed, so new desktop integrations must choose a capability-specific module instead of reintroducing one broad native import surface

## Execution Architecture

Execution is orchestrated from `useGraphExecutor`.

### `useGraphExecutor`

This hook decides whether to use:

- `useLocalExecutor`
- `useRemoteExecutor`

based on:

- `defaultExecutorState`
- whether the remote debugger/sidecar connection is active

The app shell now bootstraps execution through `useExecutorSession`, which centralizes:

- Node-executor sidecar enablement
- internal executor websocket bootstrap
- disconnect cleanup when executor mode changes

Current architectural detail:

- `RivetApp` mounts `useExecutorSession` once so executor session ownership does not follow every `useGraphExecutor` consumer
- `useGraphExecutor` is now thinner and mainly selects local vs remote execution from shared session state
- sidecar/socket session ownership no longer lives directly in `useGraphExecutor`
- the app still expects one internal sidecar process, not one sidecar per consumer
- in browser executor mode, a `connecting` or `reconnecting` remote session does not preempt local browser execution; remote execution is only selected once the shared session is actually `ready`

### Local executor

`useLocalExecutor` runs `GraphProcessor` in-process.

Current responsibilities:

- save current graph before execution
- build a temporary project including unsaved current-graph changes
- attach event handlers to `GraphProcessor`
- wire `userInput` callbacks into UI state
- optionally record executions
- support replaying loaded recordings
- support run-to and run-from execution
- preload dependent outputs for partial reruns
- provide browser-mode Trivet execution

It also fills missing settings from environment variables before execution and injects app-side providers such as:

- `TauriNativeApi`
- dataset provider
- audio provider
- tokenizer
- project reference loader

The run-from preload path is intentionally shared with remote execution through helpers in
[`packages/app/src/hooks/remoteExecutorHelpers.ts`](../packages/app/src/hooks/remoteExecutorHelpers.ts)
rather than keeping separate local-only preload derivation logic.

### Remote executor

`useRemoteExecutor` runs graphs through the remote-debugger protocol, usually talking to the internal sidecar.

Current responsibilities:

- reconnect to the internal executor when appropriate
- bridge remote debugger events into `useCurrentExecution`
- upload dynamic project/settings/static data when remote upload is enabled
- send preload data for run-from execution
- send `run`, `pause`, `resume`, `abort`, and `user-input` messages
- provide Trivet execution by awaiting request-scoped remote completion through the shared executor-session pending-run API

Current architectural detail:

- `useRemoteExecutor` no longer owns the websocket/session lifecycle directly
- it consumes a shared executor session that owns connection state and pending remote run coordination
- this keeps run/test behavior separate from transport/session behavior
- remote graph/test runs now carry request IDs through the debugger protocol so multiple pending remote runs can resolve independently
- read-only UI consumers should use shared session/debugger state directly rather than mounting `useRemoteExecutor`, because that hook still owns remote event subscriptions and execution side effects
- plain run/test orchestration helpers now live in [`packages/app/src/hooks/remoteExecutorHelpers.ts`](../packages/app/src/hooks/remoteExecutorHelpers.ts)
- that helper module holds context-value shaping, run-from dependency/preload derivation, event-dispatch fan-out, and test-suite selection without depending on React state
- shared execution data transforms now live in [`packages/app/src/utils/executionDataTransforms.ts`](../packages/app/src/utils/executionDataTransforms.ts), so node-event persistence does not duplicate input/output sanitization work across event branches
- app-layer read/restore helpers for stored execution data now live in [`packages/app/src/utils/executionDataReaders.ts`](../packages/app/src/utils/executionDataReaders.ts), which keeps displayed-output restore, port-level restore/coercion, and warnings extraction out of individual UI surfaces
- display-oriented node-output copy projection now lives in [`packages/app/src/utils/executionDataCopyValue.ts`](../packages/app/src/utils/executionDataCopyValue.ts), while node-specific visible-output overrides for copy behavior live in [`packages/app/src/utils/nodeOutputCopyValueProjectors.ts`](../packages/app/src/utils/nodeOutputCopyValueProjectors.ts)
- large execution payloads are now stored preview-first through that same transform layer: oversized `string`, `string[]`, `object`, `any`, and media outputs can be moved into `globalDataRefs` under stable execution-scoped ref ids instead of being kept inline in reactive node state
- new runs and output-clearing paths are also responsible for clearing those execution-scoped refs so stale large payloads do not accumulate in the in-memory cache

### Shared executor session

The app now has a dedicated shared session layer under:

- [`packages/app/src/hooks/executorSession.ts`](../packages/app/src/hooks/executorSession.ts)
- [`packages/app/src/hooks/useExecutorSession.ts`](../packages/app/src/hooks/useExecutorSession.ts)
- [`packages/app/src/providers/ExecutorSessionContext.tsx`](../packages/app/src/providers/ExecutorSessionContext.tsx)

This session layer owns:

- websocket/socket reference
- explicit session status (`idle`, `connecting`, `ready`, `reconnecting`)
- reconnect policy
- dataset request handling over the executor protocol
- pending remote graph completion bridging
- socket generation ownership so stale close/message events from replaced sockets are ignored
- disconnect lifecycle signaling for both explicit teardown and unexpected drops
- fan-out delivery of executor protocol messages to multiple subscribers instead of one global handler owner
- per-socket capability state such as `remoteUploadAllowed`, which is cleared when replacing the active connection
- compatibility mapping back to the older `started`/`reconnecting` flags consumed by some UI/state code

Current ownership detail:

- `useExecutorSession` should be mounted from a stable app-shell surface
- `ExecutorSessionProvider` now creates the shared runtime once at the app shell boundary and owns dataset access plus debugger/session atom wiring
- `useExecutorSession` now controls connection lifecycle against that provider-owned runtime instead of binding a process-global singleton
- read-only consumers such as `useGraphExecutor` and `ActionBarMoreMenu` should observe session state through `useExecutorSessionState`
- controller consumers such as `useRemoteExecutor`, `ActionBar`, `DebuggerConnectPanel`, and `GentraceInteractors` should use `useRemoteDebugger` for connect/disconnect/send operations without taking over session binding or teardown

`useRemoteDebugger` is now a thin controller/subscription hook over the shared session layer rather than another owner of executor-session wiring.

### Internal sidecar vs external debugger

There are two related but different concepts:

- internal sidecar executor: `ws://localhost:21889/internal`
- configurable remote debugger endpoint: default persisted as `ws://localhost:21888`

Conflating those will produce wrong behavior and wrong docs.

The session layer keeps those paths explicit so desktop Node execution does not become the architectural default for every future client.

## Core Runtime Boundary

The desktop app still depends heavily on `@ironclad/rivet-core`, but `GraphProcessor` is less monolithic than before.

Relevant current seams in core:

- [`packages/core/src/model/NodeExecutionPlanner.ts`](../packages/core/src/model/NodeExecutionPlanner.ts)
- [`packages/core/src/model/SubprocessorBridge.ts`](../packages/core/src/model/SubprocessorBridge.ts)
- [`packages/core/src/model/GraphProcessor.ts`](../packages/core/src/model/GraphProcessor.ts)

Current architectural detail:

- `GraphProcessor` remains the public evented execution surface
- graph-topology and scheduling helpers have been extracted into `NodeExecutionPlanner`
- child-processor event/lifecycle wiring has been extracted into `SubprocessorBridge`

## Plugin Architecture in the App

### `useProjectPlugins`

This hook is the main project-plugin loading pipeline.

Current sequence:

1. read plugin specs from `projectPluginsState`
2. seed `pluginsState` with one loading entry per spec
3. start a generation-tracked async load pass so stale completions from an older plugin set cannot overwrite the current UI state or active project registry
4. call `assembleRegistry(specs, loadPlugin)` from core's `RegistryAssembly.ts` — this creates a fresh built-in registry and loads each plugin via a caller-provided loader
5. mark per-plugin success/failure in app plugin state as results arrive
6. ignore the finished result completely if a newer generation has superseded it
7. show aggregated failure toasts for the active generation
8. publish the assembled registry into `projectNodeRegistryState`
9. bump the plugin refresh counter

Supported load paths (inside the `loadPlugin` callback):

- built-in plugin via `resolveBuiltInPlugin(id)` from `RegistryAssembly.ts`
- URI plugin via dynamic import, with initializer resolution that tolerates wrapped `default` exports from CJS/ESM interop
- package plugin via `useLoadPackagePlugin`, using the same initializer-resolution behavior after loading the installed module

This matters for refactors because node availability in the editor is partially rebuilt from scratch whenever project plugins change. The generation guard is part of the behavioral contract now: plugin retries or rapid project/plugin switching must not let an older async load pass replace newer plugin state or the active project registry. The `assembleRegistry()` helper is shared with the sidecar, so registry construction logic stays in one place.

### `PluginsOverlay`

The plugin browser/install overlay is still launched through [`packages/app/src/components/PluginsOverlay.tsx`](../packages/app/src/components/PluginsOverlay.tsx), but it no longer keeps catalog rendering and modal rendering in one large file.

Current structure:

- overlay-level install/search state stays in `PluginsOverlay.tsx`
- catalog rendering lives in [`packages/app/src/components/pluginsOverlay/PluginCatalog.tsx`](../packages/app/src/components/pluginsOverlay/PluginCatalog.tsx)
- per-plugin row rendering lives in [`packages/app/src/components/pluginsOverlay/PluginCatalogItem.tsx`](../packages/app/src/components/pluginsOverlay/PluginCatalogItem.tsx)
- install/log modals live in [`packages/app/src/components/pluginsOverlay/PluginInstallModals.tsx`](../packages/app/src/components/pluginsOverlay/PluginInstallModals.tsx)
- shared overlay styles live in [`packages/app/src/components/pluginsOverlay/pluginsOverlayStyles.ts`](../packages/app/src/components/pluginsOverlay/pluginsOverlayStyles.ts)

This keeps plugin search/install orchestration separate from the catalog UI and modal UI, which makes later changes to install flows or overlay presentation easier to review.

### `NodeEditor`

[`packages/app/src/components/NodeEditor.tsx`](../packages/app/src/components/NodeEditor.tsx) still owns the editor panel lifecycle, variant/test helpers, and panel shell, but it no longer mixes all rendering concerns in one file.

Current structure:

- `NodeEditor.tsx` owns editor selection/fallback rendering and the editor panel shell
- node metadata, split-run, variant, and conditional controls live in [`packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx`](../packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx)
- default field dispatch still flows through [`packages/app/src/components/editors/DefaultNodeEditorField.tsx`](../packages/app/src/components/editors/DefaultNodeEditorField.tsx), which routes `type: 'code'` editor definitions through [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx)

This keeps the real boundary in place without preserving a thin wrapper file that only forwarded editor props.

Current node-editor Monaco rules that matter for editor changes:

- `CodeEditorDefinition.enableFolding` is an explicit opt-in capability on core editor definitions; folding is intentionally enabled only for selected built-in code/JSON node-editor fields, not for every Monaco surface in the app
- the shared Monaco wrapper in [`packages/app/src/components/CodeEditor.tsx`](../packages/app/src/components/CodeEditor.tsx) is generic and create-once; it should treat its `theme` prop as an already-resolved Monaco theme id instead of reading app theme state itself
- node-editor-specific structural identity is owned by the node-editor wrapper in [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx); it uses an inline mount key based on node, field, language, resolved theme, and folding mode so Monaco remounts only when editor identity actually changes
- prompt-interpolation theme expansion should go through `resolveMonacoTheme(...)` in [`packages/app/src/components/codeEditorTheme.ts`](../packages/app/src/components/codeEditorTheme.ts); both the node-editor code path and [`packages/app/src/components/ColorizedPreformattedText.tsx`](../packages/app/src/components/ColorizedPreformattedText.tsx) share that helper instead of duplicating prompt-theme resolution
- node-editor viewport resizing for Monaco code fields is intentionally narrower than "all `type: 'code'` editors": only `javascript` and `json` node-editor fields use the explicit resizable viewport shell
- remembered node-editor code viewport heights live in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) as app-level UI state keyed by `node.type`, not in project data and not per node instance or field
- the node-editor wrapper in [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx) owns resize persistence and drag behavior through [`packages/app/src/components/editors/useNodeEditorCodeViewportHeight.ts`](../packages/app/src/components/editors/useNodeEditorCodeViewportHeight.ts); that hook centralizes `RESIZABLE_LANGUAGES`, height validation, drag-state handling, and final persisted-height resolution while the shared Monaco wrapper stays free of node-editor-specific persistence logic
- viewport height must not be included in the structural Monaco remount key because resizing should preserve cursor, selection, and editor state during layout-only changes
- out-of-scope node-editor code fields such as markdown, prompt-like text, `jsonpath`, and `regex` should keep the non-resizable static layout path instead of reading or writing the persisted per-node-type viewport height
- non-node Monaco consumers such as Trivet, project MCP configuration, dataset editing, and copy/test-case modals should stay outside the folding opt-in path unless they deliberately add their own product requirement for it

### Output rendering

Output rendering is also less centralized than before.

Current structure:

- [`packages/app/src/components/NodeOutput.tsx`](../packages/app/src/components/NodeOutput.tsx) now focuses on output panel orchestration
- process-page controls are kept local to `NodeOutput.tsx`
- the inline `Show Full Output` toggle now lives in the node output action bar next to copy/fullscreen controls, not in the node header
- inline compact-vs-full selection is resolved through [`packages/app/src/components/nodeOutput/nodeOutputPreviewMode.ts`](../packages/app/src/components/nodeOutput/nodeOutputPreviewMode.ts) so callers do not re-encode that policy ad hoc
- fullscreen header controls for expanded node output now render through [`packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx`](../packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx), which stays presentational
- output body selection lives in [`packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx`](../packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx)
- copy-button side effects for node output live in [`packages/app/src/components/nodeOutput/nodeOutputCopyActions.ts`](../packages/app/src/components/nodeOutput/nodeOutputCopyActions.ts)
- fullscreen output search state, hotkey interception, provider registration, and active-match orchestration live in [`packages/app/src/components/nodeOutput/useFullscreenOutputSearch.ts`](../packages/app/src/components/nodeOutput/useFullscreenOutputSearch.ts), which uses a single two-phase layout pass so navigation can retarget the active match without rebuilding all highlights on every step
- fullscreen output search block construction, provider constants, DOM traversal, highlight application, and match projection now live together in [`packages/app/src/components/nodeOutput/fullscreenOutputSearch.ts`](../packages/app/src/components/nodeOutput/fullscreenOutputSearch.ts)
- [`packages/app/src/components/RenderDataValue.tsx`](../packages/app/src/components/RenderDataValue.tsx) is narrower and delegates renderer-specific work
- scalar/type renderer setup lives in [`packages/app/src/components/renderDataValue/createScalarRenderers.tsx`](../packages/app/src/components/renderDataValue/createScalarRenderers.tsx)
- full data-type dispatch now lives in [`packages/app/src/components/renderDataValue/createDataValueRendererMap.tsx`](../packages/app/src/components/renderDataValue/createDataValueRendererMap.tsx)
- chat-part rendering lives in [`packages/app/src/components/renderDataValue/RenderChatMessagePart.tsx`](../packages/app/src/components/renderDataValue/RenderChatMessagePart.tsx)
- shared output-rendering styles live in [`packages/app/src/components/renderDataValue/renderDataValueStyles.ts`](../packages/app/src/components/renderDataValue/renderDataValueStyles.ts)

This keeps output selection logic separate from data-type rendering without preserving a separate pager file that only forwarded a few props. The top-level render component is now a thin adapter over a table-driven renderer registry instead of mixing array/function/scalar dispatch inline, and that registry is built as a module-level lazy singleton rather than per `RenderDataValue` instance.

Current output-rendering rules that matter for performance-sensitive changes:

- hover-only inline output is preview-first; simple hover expansion should stay on the compact preview path
- the `Show Full Output` node action is the explicit inline opt-in to `renderMode: 'full'`
- expanded inline output must still honor the large-output safety path in `LargeStoredValuePreview` rather than forcing unbounded raw text rendering
- the inline full-output toggle should render the real full-output path for normal-sized values; it must not just restyle or resize the compact preview
- nodes with expanded inline output stay visible through viewport culling so the expanded output surface does not disappear while active
- ref-backed large text/JSON-like values render through `LargeStoredValuePreview` and default to `compact` or `expanded-preview` modes before any explicit full inspection
- preview truncation rules for string/object-like output should stay shared through [`packages/app/src/utils/textPreview.ts`](../packages/app/src/utils/textPreview.ts) so inline previews and stored ref-backed previews agree on when truncation happened
- when compact preview truncation occurs, the ellipsis marker is part of the preview text and stays on its own line (`\n...`) rather than being inferred from hover height alone
- fullscreen node output opens in `expanded-preview` mode, not raw full render mode
- fullscreen node-output search is intentionally scoped to the expanded-preview modal only; compact node output should stay unchanged
- fullscreen node-output search scope is the currently selected process-history page only, including split outputs on that page but not other history pages
- `Ctrl/Cmd+F` interception for fullscreen output search must stay modal-scoped and capture-phase so it beats both canvas search and browser/webview find only while the fullscreen modal is open
- search semantics should follow what the user currently sees, including markdown-toggle differences between rendered markdown text and raw text/JSON preview
- copy/export actions must restore the original stored payload from refs before serializing
- `NodeOutput`, `ChatViewer`, `CopyAsTestCaseModal`, prompt-designer hydration, total-cost derivation, and preload helpers should all go through the shared execution-data utility layer rather than assuming execution data is plain inline `DataValue` or hand-rolling restore loops
- `restoreDisplayedNodeOutputs(...)`, port-level restore/coercion, and warning extraction belong in [`packages/app/src/utils/executionDataReaders.ts`](../packages/app/src/utils/executionDataReaders.ts)
- generic display-aligned `Copy value` projection belongs in [`packages/app/src/utils/executionDataCopyValue.ts`](../packages/app/src/utils/executionDataCopyValue.ts)
- node-specific output copy overrides should use the `getCopyValueData` descriptor path and live in [`packages/app/src/utils/nodeOutputCopyValueProjectors.ts`](../packages/app/src/utils/nodeOutputCopyValueProjectors.ts), not in UI component files
- fullscreen search for large ref-backed previews should go through the provider/context path rather than falling back to generic DOM text search; `LargeStoredValuePreview` integrates through [`packages/app/src/components/renderDataValue/useLargeStoredValueFullscreenSearch.ts`](../packages/app/src/components/renderDataValue/useLargeStoredValueFullscreenSearch.ts), which searches the full restored text, drives chunk/page activation, and keeps provider-local highlights out of the parent active-match selector path
- full-text derivation for searchable ref-backed previews belongs in [`packages/app/src/components/renderDataValue/largeStoredValuePreviewText.ts`](../packages/app/src/components/renderDataValue/largeStoredValuePreviewText.ts), not inline in the render component
- fullscreen chunk paging for large previews is intentionally contiguous and shared through [`packages/app/src/components/renderDataValue/largeStoredValueChunks.ts`](../packages/app/src/components/renderDataValue/largeStoredValueChunks.ts); chunk boundaries must not skip or duplicate content because fullscreen search relies on deterministic offset-to-chunk mapping

## Tauri Backend and Native Integration

Rust code lives under [`packages/app/src-tauri/`](../packages/app/src-tauri/).

The Tauri layer currently supports:

- dialogs and filesystem access
- environment-variable access
- plugin package extraction
- packaging external binaries
- updater configuration

The Tauri config currently includes sidecar/external-bin setup for:

- `app-executor`
- bundled `pnpm`

This app therefore depends on both frontend code and packaging/runtime config being kept aligned.

Current boundary expectation:

- Tauri-specific implementation details stay behind `src/utils/platform/*`
- app-level orchestration, workspace flows, and execution-selection logic stay platform-neutral where possible
- a future browser client should be able to reuse those higher-level layers while swapping the capability adapters

## Important Refactor Seams

If planning significant refactors, these are the highest-value seams already visible in the code:

### Graph editor seams

- `GraphBuilder`
- `NodeCanvas`
- `CanvasContext`
- extracted canvas hooks
- `VisualNode` and `visualNode/*`

### Graph/workspace management seams

- `useLoadProject`
- `useLoadGraph`
- `useSaveProject`
- `useGraphOperations`
- `useGraphListDragDrop`

### Execution seams

- `useGraphExecutor`
- `useExecutorSession`
- `executorSession`
- `useLocalExecutor`
- `useRemoteExecutor`
- `useCurrentExecution`
- remote-debugger integration

### Plugin seams

- `useProjectPlugins`
- package-plugin loading path
- registry reset/rebuild behavior

### State-management seams

- graph atom-family cleanup
- persisted per-project context
- split between `projectState` and `projectDataState`
- split between execution config state and per-node run-data state

## Known Architectural Tensions

These are visible from the current code and matter for planning:

- `NodeCanvas` remains large even after some extraction.
- `GraphBuilder` mixes orchestration, overlays, and some execution-adjacent UI behavior.
- executor selection, sidecar lifecycle, and remote debugger concerns are better separated than before, but shared session state is still read directly in several UI surfaces.
- project plugin loading still forces broad editor/runtime fan-out because many surfaces depend on the active project registry, even though that registry is now explicit state instead of a global singleton.
- project loading/saving and graph switching rely on explicit cleanup discipline.
- some multi-project and multi-surface flows still rely on the currently selected project's registry being the only active editor/runtime surface in view.

## Practical Refactor Guidance

- Treat `GraphBuilder` and `NodeCanvas` as orchestration layers and prefer extracting domain hooks/components further.
- Do not change graph/project switching without preserving `cleanupNodeAtomFamilies(...)`.
- Keep the internal sidecar path, external debugger path, and shared executor-session layer conceptually separate.
- Prefer imports from `src/utils/platform/*` over broad native barrels when touching desktop capabilities.
- When touching plugin flows, review both registry state and app plugin-state UI together.
- When changing save/load behavior, include Trivet data, static project data, and per-project context in the design review.
- Validate both local and remote executor behavior for any execution-related change.
