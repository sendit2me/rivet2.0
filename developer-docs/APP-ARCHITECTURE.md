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

Current workspace behavior:

- creating a new blank project or template project adds a new open-project tab instead of replacing the existing open-project set
- `projectsState` is the canonical multi-project tab store; `openedProjectsState` and `openedProjectsSortedIdsState` are compatibility projections over it
- `useSyncCurrentStateIntoOpenedProjects` continuously snapshots the active project's in-memory graph state, current static project data, and `openedGraph` back into the tab store so switching tabs does not require an explicit save
- closing/reordering project tabs still lives in `ProjectSelector.tsx`, not in the shared workspace transition layer

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
- open-project tab state is persisted separately in `projectsState` and stores a per-tab project snapshot, `fsPath`, and optional `openedGraph`
- when replacing the current project, `projectDataState` is replaced for the new project and the IndexedDB static-data cache is cleared before loading the new project's data

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
5. load the requested graph, otherwise fall back to the project's main graph and then to a stable sorted graph choice
6. restore the chosen graph's saved viewport when available, otherwise center/reset the canvas like a normal graph switch
7. clear prior static-data state and load the new project's static data into app state/IndexedDB
8. persist loaded filesystem path
9. load Trivet data if the IO provider supports path-based reads

This hook is a critical refactor seam because it couples project replacement, graph replacement, atom-family cleanup, and Trivet hydration.

Current architectural update:

- `useLoadProject` is now a thin adapter over the shared workspace transition layer
- the transition sequencing itself lives in [`packages/app/src/hooks/useWorkspaceTransitions.ts`](../packages/app/src/hooks/useWorkspaceTransitions.ts)
- pure transition planning lives in [`packages/app/src/utils/workspaceTransitions.ts`](../packages/app/src/utils/workspaceTransitions.ts)

### `useLoadGraph`

Current sequence:

1. optionally save the current graph back into the project
2. cleanup old graph atom families if changing graph IDs
3. replace `graphState`
4. clear selection, historical state, and read-only mode
5. optionally push onto graph navigation history
6. restore last viewport or center on the graph

This hook is the authoritative graph-switch path.

Current architectural update:

- `useLoadGraph` now delegates the shared sequencing to the workspace transition layer
- viewport restoration/centering decisions are derived from transition output rather than repeated inline logic

### `useSaveProject`

Current behavior:

- saves the current in-memory graph back into the project before persisting
- uses `saveProjectDataNoPrompt` when a path already exists
- falls back to save-as when needed
- persists Trivet test-suite data alongside the project
- keeps the current open-project tab metadata intact when save/save-as updates the project's persisted path
- shows slow-save toast feedback for large saves

Current architectural update:

- `useSaveProject` is now a thin adapter over the workspace transition layer
- the transition layer owns graph-to-project syncing and the split between save-in-place and save-as

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
- project-tab closing/reordering and active-tab snapshot syncing still live outside this layer in `ProjectSelector.tsx` and `useSyncCurrentStateIntoOpenedProjects.ts`

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

### Remote executor

`useRemoteExecutor` runs graphs through the remote-debugger protocol, usually talking to the internal sidecar.

Current responsibilities:

- reconnect to the internal executor when appropriate
- bridge remote debugger events into `useCurrentExecution`
- upload dynamic project/settings/static data when remote upload is enabled
- send preload data for run-from execution
- send `run`, `pause`, `resume`, `abort`, and `user-input` messages
- provide Trivet execution by awaiting remote completion through the shared executor-session pending-run API

Current architectural detail:

- `useRemoteExecutor` no longer owns the websocket/session lifecycle directly
- it consumes a shared executor session that owns connection state and pending remote run coordination
- this keeps run/test behavior separate from transport/session behavior
- read-only UI consumers should use shared session/debugger state directly rather than mounting `useRemoteExecutor`, because that hook still owns remote event subscriptions and execution side effects

Notable current limitations:

- remote execution still assumes one active pending remote graph completion at a time

### Shared executor session

The app now has a dedicated shared session layer under:

- [`packages/app/src/hooks/executorSession.ts`](../packages/app/src/hooks/executorSession.ts)
- [`packages/app/src/hooks/useExecutorSession.ts`](../packages/app/src/hooks/useExecutorSession.ts)

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
- `useExecutorSession` now also owns the `bindExecutorSession(...)` wiring for dataset access and debugger/session atom updates
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
3. start a generation-tracked async load pass so stale completions from an older plugin set cannot overwrite the current UI state or global registry
4. call `assembleRegistry(specs, loadPlugin)` from core's `RegistryAssembly.ts` — this creates a fresh built-in registry and loads each plugin via a caller-provided loader
5. mark per-plugin success/failure in app plugin state as results arrive
6. ignore the finished result completely if a newer generation has superseded it
7. show aggregated failure toasts for the active generation
8. install the assembled registry globally via `replaceGlobalRivetNodeRegistry(registry)`
9. bump the plugin refresh counter

Supported load paths (inside the `loadPlugin` callback):

- built-in plugin via `resolveBuiltInPlugin(id)` from `RegistryAssembly.ts`
- URI plugin via dynamic import, with initializer resolution that tolerates wrapped `default` exports from CJS/ESM interop
- package plugin via `useLoadPackagePlugin`, using the same initializer-resolution behavior after loading the installed module

This matters for refactors because node availability in the editor is partially rebuilt from scratch whenever project plugins change. The generation guard is part of the behavioral contract now: plugin retries or rapid project/plugin switching must not let an older async load pass replace newer plugin state or the active global registry. The `assembleRegistry()` helper is shared with the sidecar, so registry construction logic stays in one place.

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

This keeps the real boundary in place without preserving a thin wrapper file that only forwarded editor props.

### Output rendering

Output rendering is also less centralized than before.

Current structure:

- [`packages/app/src/components/NodeOutput.tsx`](../packages/app/src/components/NodeOutput.tsx) now focuses on output panel orchestration
- process-page controls are kept local to `NodeOutput.tsx`
- output body selection lives in [`packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx`](../packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx)
- [`packages/app/src/components/RenderDataValue.tsx`](../packages/app/src/components/RenderDataValue.tsx) is narrower and delegates renderer-specific work
- scalar/type renderer setup lives in [`packages/app/src/components/renderDataValue/createScalarRenderers.tsx`](../packages/app/src/components/renderDataValue/createScalarRenderers.tsx)
- chat-part rendering lives in [`packages/app/src/components/renderDataValue/RenderChatMessagePart.tsx`](../packages/app/src/components/renderDataValue/RenderChatMessagePart.tsx)
- shared output-rendering styles live in [`packages/app/src/components/renderDataValue/renderDataValueStyles.ts`](../packages/app/src/components/renderDataValue/renderDataValueStyles.ts)

This keeps output selection logic separate from data-type rendering without preserving a separate pager file that only forwarded a few props.

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
- plugin loading mutates global registry state, which can complicate local reasoning and tests.
- project loading/saving and graph switching rely on explicit cleanup discipline.
- remote execution still assumes one active pending remote graph completion at a time.

## Practical Refactor Guidance

- Treat `GraphBuilder` and `NodeCanvas` as orchestration layers and prefer extracting domain hooks/components further.
- Do not change graph/project switching without preserving `cleanupNodeAtomFamilies(...)`.
- Keep the internal sidecar path, external debugger path, and shared executor-session layer conceptually separate.
- Prefer imports from `src/utils/platform/*` over broad native barrels when touching desktop capabilities.
- When touching plugin flows, review both registry state and app plugin-state UI together.
- When changing save/load behavior, include Trivet data, static project data, and per-project context in the design review.
- Validate both local and remote executor behavior for any execution-related change.
