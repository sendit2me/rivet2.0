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
- project-tab reordering is visually constrained to horizontal motion even while dragging, so any future reorder changes should preserve that left-right-only affordance instead of letting tabs drift vertically

### `ActionBar`

Surface for run, test, pause, resume, abort, and related execution actions. It delegates actual behavior to `useGraphExecutor`.

### `SettingsModal`

The settings UI is still coordinated by [`packages/app/src/components/SettingsModal.tsx`](../packages/app/src/components/SettingsModal.tsx), but the page content is no longer kept in one large component file.

Current structure:

- [`packages/app/src/components/settings/SettingsPages.tsx`](../packages/app/src/components/settings/SettingsPages.tsx) is now just a barrel export
- individual settings pages live under [`packages/app/src/components/settings/pages/`](../packages/app/src/components/settings/pages)
- shared plugin-config form rendering for the plugin pages lives in [`packages/app/src/components/settings/pages/PluginSettingsSection.tsx`](../packages/app/src/components/settings/pages/PluginSettingsSection.tsx)
- the `UI` page owns presentation-oriented preferences such as theme selection, canvas zoom sensitivity, node-port text casing, default node colors, and whether newly created nodes auto-open their settings panel, while `General` is reserved for broader app/runtime behavior

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

Current rule that matters for maintenance:

- the `File` tab dropdown in [`packages/app/src/components/OverlayTabs.tsx`](../packages/app/src/components/OverlayTabs.tsx) owns its own open state and outside-click dismissal locally; it is not routed through the shared canvas/context-menu infrastructure, so menu-close behavior changes should stay in `OverlayTabs` unless the whole workspace-nav menu model is being redesigned
- workspace navigation tabs (`File`, `Canvas`, `Plugins`, `Community`, etc.) are allowed to wrap on narrow windows; the flex row stretches every tab to the tallest wrapped tab height so labels do not spill outside fixed-height pills

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
- split-run visual state is rendered inside node headers through [`packages/app/src/components/visualNode/SplitRunSummary.tsx`](../packages/app/src/components/visualNode/SplitRunSummary.tsx) as an editable summary line after the node title/description (`parallel/sequential, max n`) with inverted node header colors and a primary-background/black-text hover state; its icon geometry lives in [`packages/app/src/components/visualNode/SplitRunModeIcon.tsx`](../packages/app/src/components/visualNode/SplitRunModeIcon.tsx), with parallel arrows stacked and sequential arrows spaced inline; the header shows the node title plus a smaller trimmed description line when present, keeps left/right header icons top-aligned for multiline titles, aligns the running indicator with the hover-revealed gear glyph, and keeps a stable two-icon action lane so long titles do not rewrap when the gear appears, while lone running indicators keep padded edge spacing; drag-origin nodes preserve hover controls during the drag only when those controls were already visible at drag start
- direct Subgraph navigation is intentionally available in two UI paths that share [`packages/app/src/hooks/useGoToSubgraphNode.ts`](../packages/app/src/hooks/useGoToSubgraphNode.ts): the node context menu's `Go To Subgraph` action and the Subgraph node header link icon
- context menu, selection box, wire layer, and port tooltip rendering live in [`packages/app/src/components/nodeCanvas/NodeCanvasOverlays.tsx`](../packages/app/src/components/nodeCanvas/NodeCanvasOverlays.tsx)
- canvas motion and visibility budgets are centralized in [`packages/app/src/components/nodeCanvas/canvasPerformanceBudget.ts`](../packages/app/src/components/nodeCanvas/canvasPerformanceBudget.ts); viewport-motion timing and medium-graph thresholds should stay there instead of being redefined ad hoc in render code
- canvas node visibility bounds are normalized through [`packages/app/src/hooks/canvasVisibilityBounds.ts`](../packages/app/src/hooks/canvasVisibilityBounds.ts): normal nodes intentionally remain heightless for culling, while Comment nodes use their configured height so partially visible comments do not disappear; legacy or malformed visual data falls back to finite defaults so viewport math never receives `undefined` or `NaN`
- passive viewport-motion freeze policy is named in [`packages/app/src/components/nodeCanvas/viewportVisibilityPolicy.ts`](../packages/app/src/components/nodeCanvas/viewportVisibilityPolicy.ts); pan/zoom may freeze nonessential visibility/wire work, but active node or wire drags must refresh live
- renderable wire candidate refresh and settled/frozen candidate state live in [`packages/app/src/components/nodeCanvas/useRenderableWires.ts`](../packages/app/src/components/nodeCanvas/useRenderableWires.ts), keeping candidate selection outside SVG element rendering loops
- searchable empty-canvas context-menu results are grouped in [`packages/app/src/components/contextMenuSearchGrouping.ts`](../packages/app/src/components/contextMenuSearchGrouping.ts): node/add results stay first, graph jumps stay under a dedicated `Go to graphs` section, and graph hits render by graph name only
- multi-node alignment/distribution affordances live in [`packages/app/src/components/nodeCanvas/MultiNodeAlignmentToolbar.tsx`](../packages/app/src/components/nodeCanvas/MultiNodeAlignmentToolbar.tsx) and should stay command-backed through `moveNode` so align/distribute actions remain undoable
- mouse pan/zoom/selection-box/context-menu handlers live in [`packages/app/src/components/nodeCanvas/useNodeCanvasInteractions.ts`](../packages/app/src/components/nodeCanvas/useNodeCanvasInteractions.ts)
- canvas styling lives in [`packages/app/src/components/nodeCanvas/nodeCanvasStyles.ts`](../packages/app/src/components/nodeCanvas/nodeCanvasStyles.ts)

Current wheel-zoom behavior stays on that same interaction path:

- base wheel zoom speed is driven by `zoomSensitivityState`
- holding `Shift` while wheel-zooming applies a faster zoom-speed multiplier
- the effective wheel zoom speed is clamped before factor calculation so high sensitivity plus the Shift multiplier cannot drive zoom-out through zero

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
- `useRenderableWires`
- `useAutoLayoutGraph`

This means refactors should usually start in those hooks before pushing more logic back into `NodeCanvas`.

Current performance-oriented hook boundaries now carry explicit contracts:

- `useNodeCanvasInteractions` exposes `isViewportMoving` and a short settle window so nonessential visuals can freeze during pan/zoom without hiding core interaction affordances
- `useVisibleCanvasNodes` returns explicit visible, near-viewport, and heavy-content node id sets; medium-graph node shells stay mounted offscreen while expensive body/output rendering is reserved for nearby or pinned nodes
- `useRenderableWires` owns static wire candidate filtering, exact clipping after viewport settle, and frozen candidate reuse during passive viewport motion; active drag wires stay live outside that static candidate freeze
- `useWireDragScrolling` now reports viewport motion back into that same settle path so edge auto-scroll during wire drags uses the same freeze policy as manual pan

`useDraggingNode` now owns more than a thin `@dnd-kit` bridge. It is the drag-session state machine for node moves and `Alt`-drag duplication:

- initial duplicate intent is captured from the node drag handle rather than inferred from `DragStartEvent`
- live `Alt` press/release during a drag switches the session between move and duplicate mode
- live `Shift` press/release during a drag enables or clears straight-line axis locking; the first non-zero drag delta while `Shift` is active chooses the locked axis and that same constrained delta is used for both the overlay preview and the final committed move
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

`addNode` also owns editor-side creation behavior in addition to graph mutation: [`packages/app/src/commands/addNodeCommand.ts`](../packages/app/src/commands/addNodeCommand.ts) reads persisted editor preferences from `settingsState` through `resolveEditorPreferences(...)`, applies default node colors when requested, and opens the newly created node in the settings panel when that preference resolves to `true`. Undo clears that editor selection if it is still pointing at the removed node.

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
- output-port labels are valid drag activators in addition to the output circles themselves, but the preview wire must still originate from the real output connector because port-position math is keyed to the actual port element
- drop resolution flows through [`packages/app/src/domain/graphEditing/wireDragActions.ts`](../packages/app/src/domain/graphEditing/wireDragActions.ts), which resolves a gesture into one semantic action: make connection, rewire connection, break connection, or no-op
- rewiring from an already-connected input has one extra gesture rule: releasing off-port breaks the connection, a zero-movement click on the original connected input also breaks it, and only a real drag that returns to the same endpoint is treated as a no-op
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
- Comment nodes are a special case in viewport culling because their rendered vertical extent lives in `data.height`; partially visible comments should stay mounted even when their top edge is offscreen
- medium-sized graphs keep offscreen node shells and ports but suspend expensive body/output rendering until the node is near the viewport again or pinned by selection, editing, output expansion, or drag state
- wires are only rendered above a zoom threshold
- static wire rendering is narrowed to candidate connections near the viewport or otherwise highlighted/running, and that narrowed set stays frozen while the viewport is moving unless the user is actively dragging a node or wire
- port-position measurement stays decoupled from viewport pan/zoom, but active node drags and wire drags intentionally remeasure ports every animation frame so wires keep following overlay-transformed dragged nodes and newly revealed auto-scroll targets before drop
- viewport-visibility freezing is only for passive canvas motion; interactive node and wire drags must keep newly revealed nodes and ports mounted immediately so live connection previews stay visually correct
- connector-layout invalidation now belongs in [`packages/app/src/hooks/useNodePortPositions.ts`](../packages/app/src/hooks/useNodePortPositions.ts): it watches rendered node/port layout churn with `MutationObserver` and `ResizeObserver` and coalesces remeasurement through `requestAnimationFrame`, so moved connectors redraw their wires as soon as the DOM layout settles instead of waiting for unrelated viewport motion
- nodes use a distinct zoomed-out content renderer below zoom thresholds
- move drags remove source nodes from the main render pass and show them via `DragOverlay`
- duplicate drags keep the source nodes visible in place and show duplicate preview nodes in `DragOverlay`
- drag-overlay wires only follow move drags; duplicate preview is intentionally node-only today
- drag overlays inherit execution/error styling and expanded-output state from the source nodes; duplicate preview ids are only render ids and must not be treated as execution-history ids
- the floating `Shift` selection-box mouse indicator should stay suppressed during active node drags so it does not conflict with the straight-line drag affordance
- hover styling is a distinct render path from true selection; hovered nodes get lightweight visual treatment without reusing the stronger selected-node styling
- Comment nodes still behave like background elements when selected: they show the primary selection border, but should not be promoted above normal nodes in the stacking order
- the multi-node alignment toolbar should only appear for editable multi-selection sessions; it stays hidden for single-node selection, read-only graphs, and active node drags

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

Canvas body previews also need to stay aggressively bounded. Text-like node previews should not
rely on line-count truncation alone, because very large single-line payloads such as pasted base64
blobs can still freeze drag and render paths if the full line is rendered into the node body.
`TextNode` now trims preview lines to a fixed width and keeps a hard total preview character cap
as a backstop.

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
- remote debugger connect-popup geometry is intentionally small and pure in [`packages/app/src/utils/debuggerPanelPosition.ts`](../packages/app/src/utils/debuggerPanelPosition.ts); [`packages/app/src/components/DebuggerConnectPanel.tsx`](../packages/app/src/components/DebuggerConnectPanel.tsx) supplies the button/action-bar rects and should not reimplement clamping math

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
- node status-to-class derivation (`success`, `error`, `interrupted`, `running`, `not-ran`)
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
- UI preferences such as zoom sensitivity and auto-opening node settings for newly added nodes
- remote debugger default URL

For editor-only creation preferences, legacy/default behavior is intentionally centralized in [`packages/app/src/state/settings.ts`](../packages/app/src/state/settings.ts) via `resolveEditorPreferences(...)`: older persisted settings objects still treat `openNodeSettingsOnCreate` as enabled and `defaultNodeColors` as disabled, and both the settings UI and the add-node command share that resolver so they cannot drift on fallback behavior.

Important distinction:

- `defaultExecutorState` picks browser vs node sidecar by default
- `debuggerDefaultUrlState` is the persisted external debugger URL default
- the internal executor connection still uses `ws://localhost:21889/internal`
- graph execution settings are normalized separately by [`packages/core/src/api/processSettings.ts`](../packages/core/src/api/processSettings.ts); that resolver owns runtime defaults for app/node/trivet execution and should not become the owner for editor-only UI behavior, even though the legacy `Settings` object still carries a few editor-facing fields for compatibility

Persistence contract:

- settings/theme/executor atoms share the legacy grouped `recoil-persist` storage namespace through `createHybridStorage(...)`
- that grouped settings namespace persists immediately rather than using the heavier debounced graph/project save path
- storage-backed atoms based on that namespace must not mount before `allInitializeStoreFns` completes in `RivetAppLoader`, because `atomWithStorage(...)` reads synchronously on mount from the in-memory hybrid-storage snapshot
- if a settings atom mounts before hybrid-storage initialization finishes, it can lock in defaults for that session even though the persisted IndexedDB snapshot exists

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
- browser environments with File System Access saves
- fallback browser flows

The app also keeps separate provider abstractions for datasets, audio, and related execution-time services through React providers.

Browser file reads intentionally use a standard hidden `<input type="file">` flow through
[`packages/app/src/io/browserFileInput.ts`](../packages/app/src/io/browserFileInput.ts), even when the browser exposes
the File System Access API. Embedded browsers can expose `showOpenFilePicker()` while blocking
`FileSystemFileHandle.getFile()`, so project/graph/recording imports and binary/text file reads should not depend on
file handles. `BrowserIOProvider` still uses `showSaveFilePicker()` for browser saves when available; the legacy browser
provider uses download links for saves and the same shared input helper for reads.

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

It also fills missing settings from environment variables before execution, normalizes runtime settings through `resolveProcessSettings(...)`, and injects app-side providers such as:

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
- desktop Node-executor correctness depends on the bundled `app-executor` sidecar staying in lockstep with current app/core source, so the Tauri app now rebuilds `@ironclad/rivet-app-executor` before both `tauri dev` and desktop builds instead of assuming a previously built sidecar is still compatible. If execution semantics in core change while a dev app is already running, restart the Tauri app so the active sidecar process is replaced; a browser refresh alone does not reload an already-running sidecar.

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

Package-boundary rule:

- app code imports core through `@ironclad/rivet-core`; direct `packages/core/src/...` imports are blocked by the shared ESLint config
- if app UI needs to share runtime semantics with core, promote a deliberate core export first rather than coupling the app to core's file layout
- generic app-only utilities should live under `packages/app/src`, not under core

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
4. call `assembleRegistry(specs, loadPlugin)` from core's `RegistryAssembly.ts`; this creates a fresh built-in registry and loads each plugin via a caller-provided loader
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
- split-run, variant, and conditional controls live in [`packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx`](../packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx)
- node title, description, and color metadata live in [`packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx`](../packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx); title and description editors keep local draft state for responsive typing and autosave through a short debounce, while blur/confirm flushes immediately, the description editor treats `Enter` as submit and `Shift+Enter` as newline, the title uses a local full-width read/edit control to avoid Atlaskit read-view shrink-wrapping, and both fields keep their pre-edit values so cancel restores the previous metadata
- generic editor-definition row grouping lives in [`packages/app/src/components/editors/editorUtils.ts`](../packages/app/src/components/editors/editorUtils.ts) via `getEditorRenderRows(...)`; `DefaultNodeEditor` should consume that row model instead of rebuilding inline-editor grouping in JSX
- default field dispatch still flows through [`packages/app/src/components/editors/DefaultNodeEditorField.tsx`](../packages/app/src/components/editors/DefaultNodeEditorField.tsx), which routes `type: 'code'` editor definitions through [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx)
- `type: 'segmented'` editor definitions render through [`packages/app/src/components/editors/SegmentedEditor.tsx`](../packages/app/src/components/editors/SegmentedEditor.tsx) and reuse the same pill-style `.segmented-choice` visual language as the split-run `parallel` / `sequential` control; options may write string or boolean data fields, and nodes should use this shared editor metadata instead of bespoke app-side settings components when they only need a small fixed choice set
- `Code` node execution diagnostics are split deliberately: [`packages/core/src/model/nodes/CodeNode.ts`](../packages/core/src/model/nodes/CodeNode.ts) enriches user-code runtime and syntax errors with code-node line/column information, while [`packages/app/src/components/nodes/CodeNode.tsx`](../packages/app/src/components/nodes/CodeNode.tsx) renders Code-node failures as a structured red output with the error message plus an `Error location` section. The app also stores the Code source snapshot from run start and uses it to highlight the failed line in the Code editor for the same selected failed process-history page shown in the output view, but only while the current editor text still matches that failed run; the highlight disappears as soon as the user edits. Successful runs do not perform a syntax parse; syntax-location parsing is only attempted after an `AsyncFunction` construction failure.
- built-in callback-list nodes such as `jsFilter` and `jsMap` intentionally stay on that generic `type: 'code'` editor path; their "body of `(item, index, array) => { ... }`" UX is a core-node contract created through seeded callback-body text, helper copy, and generated execution wrappers rather than an app-side custom editor. Shared scaffolding for their input definitions, editor definition, body preview, CodeRunner options, value-backed interpolation, and process-time output validation lives in [`packages/core/src/model/nodes/jsListCallbackHelpers.ts`](../packages/core/src/model/nodes/jsListCallbackHelpers.ts), while the filter/map wrapper strings stay explicit so their runtime differences remain easy to inspect. They support the same value-backed `{{var}}` interpolation contract as `Expression`: dynamic interpolation ports are `any` ports, values evaluate as connected values through generated internal references, missing values become `undefined`, and cloned inputs prevent callback-side object/array mutation from mutating upstream graph data. Function-valued inputs are wrapped so property mutation stays local, though invoking a function can still perform whatever side effects that function itself implements. Callback-local names (`item`, `index`, and `array`) stay reserved through the exported `JS_LIST_CALLBACK_LOCAL_NAMES` set so input-port discovery and app-side parsed-source display share the same boundary; if written as `{{item}}`, `{{index}}`, or `{{array}}`, they resolve to the existing callback parameters rather than creating ports. The app gives these nodes a presentation-only output renderer in [`packages/app/src/components/nodes/JSListNode.tsx`](../packages/app/src/components/nodes/JSListNode.tsx): normal output values remain unchanged, and the renderer shows a `Parsed expression` source preview only when the callback body actually defines interpolation-created input ports.
- the built-in `Expression` node stays on that generic `type: 'code'` editor path; its `{{var}}` ports, fixed `output` contract, and disabled-by-default runtime capabilities are all core-node behavior rather than an app-side custom editor. `Expression` interpolation ports are `any` ports and evaluate as connected values, not pasted source snippets, so users can write `{{array}}[0]`, `{{object}}.field`, or `{{a}} == "123"` without typing `.value` or manually quoting string inputs. The runtime wrapper still uses generated internal value references, but clones input values before evaluation so object/array mutations inside the expression cannot mutate upstream graph data; function-valued inputs are wrapped so property mutation stays local, while invocation side effects still belong to the function. Core sanitizes Expression errors so node output does not expose those internal identifiers. The app gives Expression a presentation-only custom output renderer in [`packages/app/src/components/nodes/ExpressionNode.tsx`](../packages/app/src/components/nodes/ExpressionNode.tsx): successful runs show `Resulting value`, failed runs keep the red error state and show the error, and both states show a user-facing `Parsed expression` only when interpolation-created input ports exist. In that preview, primitives render as JavaScript literals while arrays and objects render as variable names to avoid dumping large structures. None of that changes the real graph output contract, which remains one fixed `output` value.
- `Extract Object Path` uses the shared core interpolation parser for stored-path `{{var}}` ports and now shares the same presentation-only parsed-source convention: [`packages/app/src/components/nodes/ExtractObjectPathNode.tsx`](../packages/app/src/components/nodes/ExtractObjectPathNode.tsx) renders the normal `Match` / `All Matches` outputs unchanged and adds `Parsed expression` only when the stored path has interpolation-created input ports and `usePathInput` was off for that run. The preview prefers the path and mode snapshots captured at node start; app-side rendering can substitute node input ports exactly, while `@graphInputs.*` / `@context.*` references remain visible in the preview because their runtime values are not part of node input history. This parsed path is display-only and does not add or mutate graph outputs.
- `Http Call` also stays on the generic node-editor path; its `Catch all request failures` toggle is a core-node contract that adds an optional `Request failed` boolean output and converts all non-abort execution failures in that node into `control-flow-excluded` normal outputs plus `Request failed = true` while still letting the node finish successfully. That broad catch now includes invalid URLs, transport failures, non-`2XX` responses when `Fail on non-2XX status code` is enabled, invalid request JSON/config, response body read failures, and JSON parse failures. Abort/cancel still remains a hard node error so graph cancellation semantics do not get swallowed.

This keeps the real boundary in place without preserving a thin wrapper file that only forwarded editor props.

Split-run mode UI is presentation-only:

- the node editor may render split execution as an explicit `parallel` / `sequential` choice
- persisted node state still uses the existing `isSplitSequential?: boolean` flag from [`packages/core/src/model/NodeBase.ts`](../packages/core/src/model/NodeBase.ts)
- `parallel` must continue to map to `false`/`undefined`, and `sequential` must continue to map to `true`

Current canvas header affordances for split nodes:

- visual node headers render a split-mode icon in [`packages/app/src/components/visualNode/SplitRunModeIcon.tsx`](../packages/app/src/components/visualNode/SplitRunModeIcon.tsx)
- split nodes also render the editable `parallel/sequential, max N` summary in [`packages/app/src/components/visualNode/SplitRunSummary.tsx`](../packages/app/src/components/visualNode/SplitRunSummary.tsx), directly under the node title/description, so split metadata stays with the header instead of floating above the card
- that summary is an edit affordance and should open the same node settings panel as the hover-revealed gear control

Current node-editor Monaco rules that matter for editor changes:

- `CodeEditorDefinition.enableFolding` is an explicit opt-in capability on core editor definitions; folding is intentionally enabled only for selected built-in code/JSON node-editor fields, not for every Monaco surface in the app
- the shared Monaco wrapper in [`packages/app/src/components/CodeEditor.tsx`](../packages/app/src/components/CodeEditor.tsx) is generic and create-once; it should treat its `theme` prop as an already-resolved Monaco theme id instead of reading app theme state itself
- node-editor-specific structural identity is owned by the node-editor wrapper in [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx); it uses an inline mount key based on node, field, language, resolved theme, and folding mode so Monaco remounts only when editor identity actually changes
- prompt-interpolation theme expansion should go through `resolveMonacoTheme(...)` in [`packages/app/src/components/codeEditorTheme.ts`](../packages/app/src/components/codeEditorTheme.ts); both the node-editor code path and [`packages/app/src/components/ColorizedPreformattedText.tsx`](../packages/app/src/components/ColorizedPreformattedText.tsx) share that helper instead of duplicating prompt-theme resolution
- Monaco preview surfaces such as [`packages/app/src/components/ColorizedPreformattedText.tsx`](../packages/app/src/components/ColorizedPreformattedText.tsx) should stay aligned with the real editor by resolving the same effective Monaco theme and using Monaco's default foreground for dark themes instead of inheriting generic node/output text color
- node-editor viewport resizing for Monaco code fields is intentionally narrower than "all `type: 'code'` editors": only `javascript`, `json`, and `prompt-interpolation-markdown` node-editor fields use the explicit resizable viewport shell
- prompt-interpolation Monaco languages are registered in [`packages/app/src/utils/monaco.ts`](../packages/app/src/utils/monaco.ts); they must define both tokenization and language configuration so editor behaviors like brace auto-closing/delete stay aligned with built-in Monaco languages instead of falling back to bare token coloring
- prompt-style `{{...}}` input discovery and runtime substitution are owned by [`packages/core/src/utils/interpolation.ts`](../packages/core/src/utils/interpolation.ts); malformed openers like `{{bar` must stay literal instead of swallowing later valid tokens, escaped `{{{...}}}` tokens must round-trip literally, and custom interpolation nodes like [`packages/core/src/model/nodes/ObjectNode.ts`](../packages/core/src/model/nodes/ObjectNode.ts), [`packages/core/src/model/nodes/ExtractObjectPathNode.ts`](../packages/core/src/model/nodes/ExtractObjectPathNode.ts), [`packages/core/src/model/nodes/ExpressionNode.ts`](../packages/core/src/model/nodes/ExpressionNode.ts), and [`packages/core/src/model/nodes/jsValueInterpolation.ts`](../packages/core/src/model/nodes/jsValueInterpolation.ts) should reuse the shared token-boundary / replacement helpers rather than reintroducing regex parsing drift
- [`packages/core/src/model/nodes/ExtractObjectPathNode.ts`](../packages/core/src/model/nodes/ExtractObjectPathNode.ts) only derives dynamic interpolation ports from the stored `Path` editor value when `usePathInput` is off; `usePathInput` mode keeps the explicit `path` input as the sole path source, `@graphInputs.*` and `@context.*` references participate at runtime without generating ports, and the built-in `object` port name stays reserved so `{{object}}` cannot silently bind to a hidden built-in input
- dynamic-port text edits that flow through [`packages/app/src/commands/editNodeCommand.ts`](../packages/app/src/commands/editNodeCommand.ts) now also own forward connection recovery: when an edit invalidates an incident port, [`packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts`](../packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts) moves that auto-removed connection into the ephemeral per-graph pool in [`packages/app/src/state/recoverableNodeConnections.ts`](../packages/app/src/state/recoverableNodeConnections.ts); if a later edit recreates the exact same port id on the same side, the connection is restored without needing command-stack undo, but recovery must still respect live input-slot uniqueness and the current validity of both endpoints
- graph-input deletion warnings use [`packages/app/src/domain/graphEditing/graphInputUsage.ts`](../packages/app/src/domain/graphEditing/graphInputUsage.ts) as a display-ready usage model: it reports direct `Subgraph` terminal usages plus conservative `Graph Reference` / `Call Graph.inputs` object usages, formats caller labels without duplicating default type names, and returns a `displayPath` so [`packages/app/src/components/DeleteGraphInputConfirmModal.tsx`](../packages/app/src/components/DeleteGraphInputConfirmModal.tsx) can stay presentational
- `Graph Input` id renames are a special edit-node case handled by [`packages/app/src/domain/graphEditing/graphInputRenamePropagation.ts`](../packages/app/src/domain/graphEditing/graphInputRenamePropagation.ts): when the old graph input id disappears from the edited graph, direct `Subgraph` caller connections and `SubGraphNode.data.inputData` defaults are rewritten from the old input port id to the new one across project graphs, with external graph snapshots stored in the edit command so undo/redo restores callers exactly; if the new port is already occupied, the existing new-name connection/default wins and duplicate old-name usages are discarded to preserve one incoming connection per input; `Graph Reference` / `Call Graph.inputs` object keys are intentionally not rewritten by this path
- recoverable-connection restore is therefore asymmetric in one important way: it may recreate dynamic ports whose definitions depend on the candidate connection set, but it must not revive a connection into a downstream input that is already occupied by a newer live wire, and it must not revive a connection whose fixed opposite-end port no longer exists
- that recoverable-connection pool is UI/session state, not project data: graph-history clearing and node deletion clear the relevant entries, while [`packages/app/src/commands/editNodeWithConnectionsCommand.ts`](../packages/app/src/commands/editNodeWithConnectionsCommand.ts) is authoritative about its explicit `nextConnections` and therefore clears that node's pooled recoverable connections on apply/redo and restores the previous pooled entry on undo
- remembered node-editor code viewport heights live in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) as app-level UI state keyed by `node.type`, not in project data and not per node instance or field
- app-wide multiline editor font size also lives in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) as UI-only state, persisted under `multilineEditorFontSizeState` rather than in project data
- shared `Ctrl/Cmd +`, `Ctrl/Cmd -`, and `Ctrl/Cmd 0` handling for multiline editors is centralized in [`packages/app/src/hooks/useMultilineEditorFontSize.ts`](../packages/app/src/hooks/useMultilineEditorFontSize.ts) and [`packages/app/src/utils/multilineEditorFontSize.ts`](../packages/app/src/utils/multilineEditorFontSize.ts); Monaco editors and native multiline textareas should use that path instead of ad-hoc shortcut handling
- the shared Monaco wrapper in [`packages/app/src/components/CodeEditor.tsx`](../packages/app/src/components/CodeEditor.tsx) owns applying the persisted font size to all `LazyCodeEditor` consumers, while native multiline textareas in places like prompt designer, AI assist, and project-creation flows must opt in explicitly through the same hook
- the node-editor wrapper in [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx) owns resize persistence and drag behavior through [`packages/app/src/components/editors/useNodeEditorCodeViewportHeight.ts`](../packages/app/src/components/editors/useNodeEditorCodeViewportHeight.ts); that hook centralizes `RESIZABLE_LANGUAGES`, height validation, drag-state handling, and final persisted-height resolution while the shared Monaco wrapper stays free of node-editor-specific persistence logic
- viewport height must not be included in the structural Monaco remount key because resizing should preserve cursor, selection, and editor state during layout-only changes
- `Escape` handling for Monaco node-editor fields also belongs in [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx), not the generic Monaco wrapper: if Monaco suggest UI is active it should dismiss that first, and only fall back to closing the node settings panel when no suggest widget is open
- out-of-scope node-editor code fields such as plain markdown, plain-text, `jsonpath`, and `regex` should keep the non-resizable static layout path instead of reading or writing the persisted per-node-type viewport height
- non-node Monaco consumers such as Trivet, project MCP configuration, dataset editing, and copy/test-case modals should stay outside the folding opt-in path unless they deliberately add their own product requirement for it
- node-settings panel width dragging is now preview-driven through a CSS custom property in [`packages/app/src/components/nodeEditor/useNodeEditorWidth.ts`](../packages/app/src/components/nodeEditor/useNodeEditorWidth.ts), so the panel shell can track the live drag width without rerendering the full node-editor tree on every mousemove
- node-editor Monaco instances learn about panel-width drags through [`packages/app/src/components/nodeEditor/NodeEditorResizeContext.ts`](../packages/app/src/components/nodeEditor/NodeEditorResizeContext.ts) and should defer intermediate `editor.layout()` work until the drag ends; future resize-performance changes should stay on that path rather than reintroducing per-tick Monaco relayout
- reorderable `stringList` editors are now declarative at the core editor-definition layer through `reorderable` and `portBinding` metadata on [`packages/core/src/model/EditorDefinition.ts`](../packages/core/src/model/EditorDefinition.ts)
- the shared app editor in [`packages/app/src/components/editors/StringListEditor.tsx`](../packages/app/src/components/editors/StringListEditor.tsx) owns the add/delete controls plus the handle-only drag UI; node definitions opt in through metadata instead of rendering bespoke reorder UIs
- the shared `StringListEditor` also owns the small interaction rules for that UI: newly added rows autofocus their text field, and reorder handles stay hidden for single-row lists so non-reorderable states do not show dead drag affordances
- connector-preserving list edits flow through [`packages/app/src/domain/graphEditing/stringListPortBinding.ts`](../packages/app/src/domain/graphEditing/stringListPortBinding.ts) plus [`packages/app/src/commands/editNodeWithConnectionsCommand.ts`](../packages/app/src/commands/editNodeWithConnectionsCommand.ts), so the editor UI can reorder/rename rows without scattering node-specific connection-remap code
- `Code` node port ids stay value-derived because the node's runtime API is name-based (`inputs.foo` / returned output keys), while `Destructure` and `Match` use stored stable output ids so reorder/rename can preserve connector identity independently from the displayed row order
- legacy `Destructure` / `Match` projects without stored stable id arrays convert lazily on first relevant list edit; there is no graph-wide migration pass on load

### Output rendering

Output rendering is also less centralized than before.

Current structure:

- [`packages/app/src/components/NodeOutput.tsx`](../packages/app/src/components/NodeOutput.tsx) now focuses on output panel orchestration
- process-page controls are kept local to `NodeOutput.tsx`
- execution status emphasis for canvas nodes now lives on the node output shell rather than header glyphs:
  `success` keeps the green output marker/divider without a background tint, `error` / `interrupted` use a subtle red tint, `running` keeps the primary divider, and `not-ran` keeps the dashed divider lane
- `NodeOutput` can be suspended by the canvas render path for offscreen medium-graph nodes; collapsed outputs should return `null` in that state, while explicitly expanded outputs still render
- the inline `Unfold output` toggle now lives in the node output action bar next to copy/fullscreen controls, not in the node header
- inline compact-vs-full selection is resolved through [`packages/app/src/components/nodeOutput/nodeOutputPreviewMode.ts`](../packages/app/src/components/nodeOutput/nodeOutputPreviewMode.ts) so callers do not re-encode that policy ad hoc
- regular in-canvas node output previews now stay at the larger preview height by default instead of only expanding on hover; the explicit output toggle is still reserved for the fully expanded scrollable state
- fullscreen header controls for expanded node output now render through [`packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx`](../packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx), which stays presentational
- fullscreen node output uses opt-in horizontal resizing on [`packages/app/src/components/FullScreenModal.tsx`](../packages/app/src/components/FullScreenModal.tsx); users drag the modal shell's left/right edges, and the app-wide edge bounds are stored as percentages in `fullscreenOutputModalBoundsState`, with clamp math isolated in [`packages/app/src/utils/fullScreenModalBounds.ts`](../packages/app/src/utils/fullScreenModalBounds.ts)
- output body selection lives in [`packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx`](../packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx)
- `Expression`, `JS Filter`, `JS Map`, and `Extract Object Path` are the current exceptions to the generic error short-circuit in `NodeOutput`: their custom output renderers still run on failed executions so the red error view can include source-debug sections such as `Parsed expression` when interpolation-created input ports exist
- shared structured-output presentation now lives in [`packages/app/src/components/nodes/StructuredNodeOutput.tsx`](../packages/app/src/components/nodes/StructuredNodeOutput.tsx). That file owns only the stable shell pieces: optional error text, labeled sections, and the colorized parsed-source block. Node-specific renderers still own result labels, output ids, render-mode choices, and the policy for whether a parsed-source section should exist.
- split-output ordering is shared through [`packages/app/src/components/nodeOutput/splitOutputEntries.ts`](../packages/app/src/components/nodeOutput/splitOutputEntries.ts); both generic node output rendering and custom structured renderers should sort split indexes numerically so split run output `10` does not render before `2`
- custom structured-output renderers should treat `data.status.type === 'error'` as the failure boundary. The displayed error string is presentation data and may be empty, so it must not be used as the boolean that decides whether success sections render.
- `Code` node failures also use the shared structured-output shell for their error and `Error location` sections, but the Code node remains responsible for error-location parsing and editor-line highlighting policy.
- source-display policy helpers such as [`packages/app/src/components/nodes/parsedSourceDisplayUtils.ts`](../packages/app/src/components/nodes/parsedSourceDisplayUtils.ts) only decide whether a debug source section should be shown and must not perform runtime interpolation
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
- hover-only `expanded-preview` output must not expose `LargeStoredValuePreview` actions such as `Load Full Value`; those actions are reserved for explicit `full` inline output or fullscreen output surfaces that opt in with `allowLargeStoredValueActions`. Generic and custom output renderers both receive the resolved `renderMode` plus that opt-in flag through `renderNodeOutputBody(...)`; the shared renderer prop contract lives in [`packages/app/src/components/nodeOutput/nodeOutputRendererTypes.ts`](../packages/app/src/components/nodeOutput/nodeOutputRendererTypes.ts). Custom renderers must not infer `full` from `isCompact === false` because hover previews are also non-compact.
- the `Unfold output` node action is the explicit inline opt-in to `renderMode: 'full'`; the separate fullscreen icon still opens the modal `expanded-preview` path
- output action clicks are intentionally contained inside [`packages/app/src/components/NodeOutput.tsx`](../packages/app/src/components/NodeOutput.tsx): the action bar prevents mouse-down focus on the draggable node root, and fullscreen output open/close explicitly clears that node's hover atom because the modal portal can bypass the node boundary `mouseleave`. Click-only actions like unfold/copy/fullscreen must not leave header hover controls, such as the gear icon, visible after the pointer leaves the node.
- while a fullscreen output modal is open, [`fullscreenOutputNodeState`](../packages/app/src/state/graphBuilder.ts) marks that node as visually active through the same active-border path used for an open settings panel. This is presentation state only; it should not mutate true node selection.
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
