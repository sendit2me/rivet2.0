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

## Shell and Workspace UI

### `ProjectSelector`

Handles open-project switching and the top-of-window project context.

### `ActionBar`

Surface for run, test, pause, resume, abort, and related execution actions. It delegates actual behavior to `useGraphExecutor`.

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

The component is still large, but several concerns have already been extracted into hooks.

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

### Viewport model

Viewport state lives in `canvasPositionState` and uses:

```ts
type CanvasPosition = { x: number; y: number; zoom: number; fromSaved?: boolean };
```

`NodeCanvas` applies the viewport via a CSS transform on `.canvas-contents` and also adjusts the grid background size/position independently.

Per-graph viewport memory lives in `lastCanvasPositionByGraphState`.

### Rendering strategy

Key current behaviors:

- nodes outside the visible viewport are skipped via `useVisibleCanvasNodes`
- wires are only rendered above a zoom threshold
- nodes use a distinct zoomed-out content renderer below zoom thresholds
- dragging nodes are removed from the main render pass and shown via `DragOverlay`

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
- reflect graph/history state (`selected`, changed, pinned, disabled, conditional, split)
- start node editing on double-click for known node types

It also depends on both:

- `useCanvasViewContext`
- `useCanvasHandlersContext`

That makes it a key seam when changing how interaction is propagated through the node tree.

## Graph List and Sidebar Graph Management

The sidebar graph tree is no longer just a flat list of graphs.

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
- `PromptDesignerConfigPanel`
- `PromptDesignerTestPanel`
- `PromptDesignerComponents`
- `PromptDesignerTestRunner`

This area is still coupled to chat-node structure and ad-hoc process-context creation, so it remains a meaningful refactor hotspot.

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
- dragging wire
- closest valid port during wire drag
- graph navigation stack
- pinned nodes
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
- large attached static data is held separately in `projectDataState`
- per-project context values are persisted separately via `projectContextState(projectId)`

### Execution and data-flow state

Execution state is split between:

- `execution.ts`
- `dataFlow.ts`

`execution.ts` owns remote-debugger config and recording pointers.

`dataFlow.ts` owns:

- last-run data per node
- running graph IDs
- root graph ID
- graph running/paused flags
- selected process page per node

The per-node run data model is rich enough to store:

- input data
- output data
- split-run output data
- start/finish timestamps
- status variants like ok/error/running/interrupted/not-ran

This state directly drives node output rendering and process-page selection in the canvas.

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

1. replace `projectState`
2. reset graph navigation stack
3. cleanup old graph node atom families
4. clear read-only/historical state
5. load the target graph or fallback empty graph
6. load static project data into app state
7. persist loaded filesystem path
8. load Trivet data if the IO provider supports path-based reads

This hook is a critical refactor seam because it couples project replacement, graph replacement, atom-family cleanup, and Trivet hydration.

### `useLoadGraph`

Current sequence:

1. optionally save the current graph back into the project
2. cleanup old graph atom families if changing graph IDs
3. replace `graphState`
4. clear selection, historical state, and read-only mode
5. optionally push onto graph navigation history
6. restore last viewport or center on the graph

This hook is the authoritative graph-switch path.

### `useSaveProject`

Current behavior:

- saves the current in-memory graph back into the project before persisting
- uses `saveProjectDataNoPrompt` when a path already exists
- falls back to save-as when needed
- persists Trivet test-suite data alongside the project
- shows slow-save toast feedback for large saves

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

## Execution Architecture

Execution is orchestrated from `useGraphExecutor`.

### `useGraphExecutor`

This hook decides whether to use:

- `useLocalExecutor`
- `useRemoteExecutor`

based on:

- `defaultExecutorState`
- whether the remote debugger/sidecar connection is active

It also manages the sidecar lifecycle via `useExecutorSidecar`.

Important code-level warning already present in the source:

- this hook should live on components that do not unmount casually, because cleanup can disconnect the remote debugger unexpectedly

That warning is real and should be treated as a current design constraint.

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

### Remote executor

`useRemoteExecutor` runs graphs through the remote-debugger protocol, usually talking to the internal sidecar.

Current responsibilities:

- maintain remote debugger connectivity
- reconnect to the internal executor when appropriate
- bridge remote debugger events into `useCurrentExecution`
- upload dynamic project/settings/static data when remote upload is enabled
- send preload data for run-from execution
- send `run`, `pause`, `resume`, `abort`, and `user-input` messages
- provide Trivet execution by awaiting remote completion through a promise bridge

Notable current limitations:

- the remote test/run completion flow uses a module-level promise bridge
- comments in the source note this makes parallel processing awkward/impossible in remote debugger mode

### Internal sidecar vs external debugger

There are two related but different concepts:

- internal sidecar executor: `ws://localhost:21889/internal`
- configurable remote debugger endpoint: default persisted as `ws://localhost:21888`

Conflating those will produce wrong behavior and wrong docs.

## Plugin Architecture in the App

### `useProjectPlugins`

This hook is the main project-plugin loading pipeline.

Current sequence:

1. read plugin specs from `projectPluginsState`
2. reset the global node registry
3. populate loading-state UI entries
4. load each plugin based on spec type
5. mark success/failure in app plugin state
6. show aggregated failure toasts
7. register loaded plugins into `globalRivetNodeRegistry`
8. bump the plugin refresh counter

Supported load paths:

- built-in plugin from core export map
- URI plugin via dynamic import
- package plugin via `useLoadPackagePlugin`

This matters for refactors because node availability in the editor is partially rebuilt from scratch whenever project plugins change.

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
- executor selection, sidecar lifecycle, and remote debugger concerns are still somewhat entangled.
- plugin loading mutates global registry state, which can complicate local reasoning and tests.
- project loading/saving and graph switching rely on explicit cleanup discipline.
- remote execution has a promise-bridge workaround that limits elegance and likely future concurrency work.

## Practical Refactor Guidance

- Treat `GraphBuilder` and `NodeCanvas` as orchestration layers and prefer extracting domain hooks/components further.
- Do not change graph/project switching without preserving `cleanupNodeAtomFamilies(...)`.
- Keep the internal sidecar path and external debugger path conceptually separate.
- When touching plugin flows, review both registry state and app plugin-state UI together.
- When changing save/load behavior, include Trivet data, static project data, and per-project context in the design review.
- Validate both local and remote executor behavior for any execution-related change.
