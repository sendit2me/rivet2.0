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
- in the browser build, the `File` menu is the leftmost item in the same top bar as the opened-project tabs, not part of the centered overlay-tab switcher; its dropdown owns local open state, outside-click dismissal, menu separators, and the browser-visible order `New project`, `Open project`, `Save project`, `Save project as...`, `Import graph`, `Export graph`, `Settings`
- the browser `File` menu delegates to the shared menu command surface, so `Save project` is the same command used by app hotkeys and native menus; Tauri continues to omit this in-bar menu because native app menus handle file commands there. The active menu-command handler is mirrored on `window` so browser file-menu actions, native menu events, and the Windows hotkey shim keep dispatching to the current handler across Vite Fast Refresh updates. The Windows shortcut shim listens on capture-phase `keydown`, prevents the browser default for mapped commands such as `Ctrl+S`, and accepts common Windows user-agent/platform variants rather than only `Win64`.

### `ActionBar`

Surface for run, test, pause, resume, abort, and related execution actions. It delegates actual behavior to `useGraphExecutor`.

### `SettingsModal`

The settings UI is still coordinated by [`packages/app/src/components/SettingsModal.tsx`](../packages/app/src/components/SettingsModal.tsx), but the page content is no longer kept in one large component file.

Current structure:

- [`packages/app/src/components/settings/SettingsPages.tsx`](../packages/app/src/components/settings/SettingsPages.tsx) is now just a barrel export
- individual settings pages live under [`packages/app/src/components/settings/pages/`](../packages/app/src/components/settings/pages)
- shared plugin-config form rendering for the plugin pages lives in [`packages/app/src/components/settings/pages/PluginSettingsSection.tsx`](../packages/app/src/components/settings/pages/PluginSettingsSection.tsx)
- the `UI` page owns presentation-oriented preferences such as theme selection, app UI font size, canvas zoom sensitivity, node-port text casing, default node colors, and whether newly created nodes auto-open their settings panel, while `General` is reserved for broader app/runtime behavior. Theme selection uses the shared segmented editor instead of a dropdown so settings-modal segmented choices match node settings.
- settings-page helper text follows the node-settings pattern: render hints before the control with [`packages/app/src/components/FieldHelperMessage.tsx`](../packages/app/src/components/FieldHelperMessage.tsx), and pass switcher hints through [`packages/app/src/components/LabeledToggle.tsx`](../packages/app/src/components/LabeledToggle.tsx) so the hint aligns under the label text rather than under the switch and remains clickable together with the switch label

This is a better refactor seam because settings page changes no longer require editing one large file that mixes general preferences, OpenAI settings, plugin settings, custom plugin pages, and update behavior.

### `LeftSidebar`

A fixed left rail controlled by `sidebarOpenState`.

Tabs:

- `Graphs`
- `Graph Info`
- `Project`

The rail width is adjustable from the right edge of `LeftSidebar` and persists as `leftSidebarWidthState` in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts). The drag-in-progress width is mirrored through `leftSidebarLiveWidthState` so edge-attached controls can follow the rail continuously while the final width is saved only when resizing ends. Width clamping lives in [`packages/app/src/utils/leftSidebarWidth.ts`](../packages/app/src/utils/leftSidebarWidth.ts) so the panel can widen for long graph names while still leaving usable canvas space, including after the app window is resized.
The tab panel content intentionally expands across Atlaskit's inner side gutter so graph rows and search fields can reach the usable edge of the resized rail instead of leaving a dead strip on the right.
Controls that visually attach to the graph rail edge, such as graph-history navigation in [`packages/app/src/components/NavigationBar.tsx`](../packages/app/src/components/NavigationBar.tsx) and the AI graph creator toggle in [`packages/app/src/components/AiGraphCreatorToggle.tsx`](../packages/app/src/components/AiGraphCreatorToggle.tsx), read the clamped live width so they follow the rail during resizing while preserving the shared 25px canvas-side gap next to the rail.

The `Graphs` tab hosts `GraphList`, which is no longer a single all-in-one implementation. Graph CRUD and drag/drop logic have been split into hooks.

### `OverlayTabs`

Acts as the switchboard for overlay-like product areas such as prompt designer, Trivet, chat viewer, community, and other auxiliary workspace surfaces.

Current rule that matters for maintenance:

- browser-only file commands live beside opened-project tabs in [`packages/app/src/components/ProjectSelector.tsx`](../packages/app/src/components/ProjectSelector.tsx); `OverlayTabs` renders workspace destinations such as `Canvas`, `Plugins`, `Community`, Prompt Designer, Trivet, Chat Viewer, Data Studio, and the graph `Search` control, which is visually styled as a separate pill button rather than as another workspace tab
- workspace navigation tabs (`Canvas`, `Plugins`, `Community`, etc.) are allowed to wrap on narrow windows; the flex row stretches every tab to the tallest wrapped tab height so labels do not spill outside fixed-height pills

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
- hotkeys for delete, copy/cut/paste, search, and canvas actions
- port-position tracking for wire rendering
- zoomed-out rendering decisions
- drag overlay rendering

The component is still one of the heavier files, but it is no longer one all-in-one render surface.

Current structure:

- [`packages/app/src/components/NodeCanvas.tsx`](../packages/app/src/components/NodeCanvas.tsx) now coordinates canvas state, hotkeys, and command wiring
- node clipboard shortcuts are intentionally centralized in [`packages/app/src/hooks/useCopyNodesHotkeys.ts`](../packages/app/src/hooks/useCopyNodesHotkeys.ts): `Ctrl/Cmd+C` snapshots the selected nodes plus internal selected-node connections into the app clipboard, `Ctrl/Cmd+V` pastes from that clipboard at the last mouse position, and `Ctrl/Cmd+X` copies first and then delegates removal to [`packages/app/src/commands/deleteNodeCommand.ts`](../packages/app/src/commands/deleteNodeCommand.ts) so graph-input warnings, undo history, selection cleanup, and execution-state cleanup stay identical to normal deletion
- viewport transform application and node/drag-overlay rendering live in [`packages/app/src/components/nodeCanvas/NodeCanvasViewport.tsx`](../packages/app/src/components/nodeCanvas/NodeCanvasViewport.tsx)
- split-run visual state is rendered inside node headers through [`packages/app/src/components/visualNode/SplitRunSummary.tsx`](../packages/app/src/components/visualNode/SplitRunSummary.tsx) as an editable summary line after the node title/description (`sequential, max n` or `parallel, max n, conc m`) with inverted node header colors and a primary-background/black-text hover state; its icon geometry lives in [`packages/app/src/components/visualNode/SplitRunModeIcon.tsx`](../packages/app/src/components/visualNode/SplitRunModeIcon.tsx), with parallel arrows stacked and sequential arrows spaced inline; app-owned rounded cards use native CSS `corner-shape: squircle`, with numeric radii doubled from their previous round-corner values so the visible squircle corner optically matches the old radius (`8px` rounded cards become `16px` squircles); switch tracks and pill controls use explicit capsule radii plus a softer `superellipse(1.15)` corner shape, because `squircle`/`superellipse(2)` reads too sharp on narrow capsules and increasing `border-radius` is clamped by control height; circular dots keep their existing round geometry; split stack ghosts use integer left/right offsets instead of fractional centering to avoid soft edges; the header shows the node title plus a smaller trimmed description line when present, keeps left/right header icons top-aligned for multiline titles, pins the action lane to the header corner so split summaries cannot push gear/running icons out of view on narrow nodes, clips split-summary overflow at the header edge when the node is narrower than the full summary, aligns the 500ms-delayed running indicator from [`packages/app/src/components/visualNode/NodeRunningIndicator.tsx`](../packages/app/src/components/visualNode/NodeRunningIndicator.tsx) with the hover-revealed gear glyph, and keeps a stable two-icon action lane so long titles do not rewrap when the gear appears, while lone running indicators keep padded edge spacing; drag-origin nodes preserve hover controls during the drag only when those controls were already visible at drag start
- direct Subgraph navigation is intentionally available in two UI paths that share [`packages/app/src/hooks/useGoToSubgraphNode.ts`](../packages/app/src/hooks/useGoToSubgraphNode.ts): the node context menu's `Go To Subgraph` action and the Subgraph node header link icon
- context menu, selection box, wire layer, and port tooltip rendering live in [`packages/app/src/components/nodeCanvas/NodeCanvasOverlays.tsx`](../packages/app/src/components/nodeCanvas/NodeCanvasOverlays.tsx)
- direct node multi-selection is intentionally a Shift+Click toggle: clicking an unselected node adds it to `selectedNodesState`, and clicking an already selected node removes it. The pure selection rule lives in [`packages/app/src/domain/graphEditing/nodeSelection.ts`](../packages/app/src/domain/graphEditing/nodeSelection.ts) so selection UI paths do not reimplement add/remove behavior ad hoc. Pointer selection clicks also blur the node root after handling selection so browser focus rings do not remain visible after selection is cleared.
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

`Ctrl/Cmd+F` graph search is a project-wide node search, but it stays intentionally separate from `Ctrl/Cmd+P` Go To search:

- `searchingGraphState` owns the graph-search lifecycle, query, ordered project-wide matches, and the last focused match index
- `useSearchGraph` builds separate graph-level search entries from graph names plus node-level entries from every project graph's node title, description, id, node type label, and node content from code-editor-style fields only; project graph snapshots are deduped by graph metadata id with the project record key as a fallback so the current live graph wins over stale saved copies, then search runs against the whole query string first and falls back to separate-word matching only when no exact whole-query matches exist
- graph-search node content deliberately comes from the node's `code` editor definitions, not from whole-node data serialization; this keeps searchable content focused on large user-authored fields such as Code source, Text content, HTTP headers/body, Expression bodies, and prompt/code editors while avoiding noisy default toggles, dropdown values, retry settings, booleans, and numeric settings
- generated node IDs are searchable only for deliberate longer queries, not short one- or two-character searches, so random IDs do not make otherwise irrelevant nodes appear in the graph search panel
- [`packages/app/src/hooks/graphSearch.ts`](../packages/app/src/hooks/graphSearch.ts) owns result metadata, field-aware match-location classification (`graph name`, `node name`, `node description`, `node type`, `node content`), content-context snippet extraction, and grouping by graph for the search panel; graph-name hits can produce graph groups even when a graph has no nodes, node type is shown as muted top-right metadata in each node result row rather than in the graph header, and snippets are shown only when the same node-data/content field itself satisfies the active exact or fallback search mode
- graph search styling uses the lightweight `searchMatch` node presentation state for passive matches only; clicking a result uses normal `selectedNodesState` selection so the focused node keeps the standard selected-node border
- `OverlayTabs` exposes graph search as the last workspace navigation control with compact button-like styling and a search icon; it is an action button rather than a selectable workspace tab, so opening search leaves the current workspace tab such as `Canvas` visually selected while closing active overlays and using the same `searchingGraphState` path as `Ctrl/Cmd+F`
- `NavigationBar` owns the graph-search panel: it appears centered under workspace navigation at 30vw, focuses the lighter search input whenever search opens or an already-open search receives `Ctrl/Cmd+F` again, uses background-only input focus styling, stays as an input-only search bar until matches exist, discloses when results come from separate-word fallback matching, then persists a draggable bottom-edge max height in `graphSearchPanelHeightState` so short result lists can stay shorter, groups graph sections headed as `Graph <name>` with a lightweight `Graph` label and only the graph name emphasized, handles graph-title open actions, rounded result-row blocks, a lighter lower context section when node-content snippets are shown, long-line-safe snippet wrapping, stronger hover/focus styling, and close/Escape cleanup
- clicking a graph-search result row opens the result's graph, centers the target node horizontally in the viewport and vertically in the visible area below the search panel at a gentler zoom than the older single-node focus path, and selects the node; clicking a graph title opens that graph without forcing a node focus; the panel remains open until the user explicitly closes it

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
- node resize handles keep their resize cursor but do not reveal primary-color edge markers on hover; the node card itself is already the visual object being resized, so extra edge lines are intentionally omitted there. Other custom resize affordances such as the node-settings panel edge, resizable code-editor viewport, graph-search panel, left sidebar, and fullscreen output modal still reveal a primary-color edge marker when hovered or actively dragged. Resize cursors are shared through the `--resize-edge-*cursor` CSS tokens and [`packages/app/src/utils/resizeCursors.ts`](../packages/app/src/utils/resizeCursors.ts), and active drags should keep the same cursor through the body-level drag cursor path, not revert once the pointer leaves the narrow handle. The fullscreen output modal positions its side handles against the modal shell, not the viewport or inner body inset, so the highlighted edge aligns with the visible modal side.

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
- start node editing on double-click for known node types; the node root is blurred before opening settings so focus-only header affordances such as the gear icon do not stay visible after the pointer leaves

Canvas body previews also need to stay aggressively bounded. Text-like node previews should not
rely on line-count truncation alone, because very large single-line payloads such as pasted base64
blobs can still freeze drag and render paths if the full line is rendered into the node body.
`TextNode` now trims preview lines to a fixed width and keeps a hard total preview character cap
as a backstop.
Markdown body previews should avoid formatting-only blank lines. The app overrides `PromptNode`
with [`packages/app/src/components/nodes/PromptNode.tsx`](../packages/app/src/components/nodes/PromptNode.tsx)
so its role label and prompt preview live in one compact DOM block with no spacer line while
preserving user-authored blank prompt lines; that custom prompt preview uses a lightweight inline
interpolation-token highlighter instead of Monaco colorization, because Monaco preserves code spaces
in a way that prevents normal word wrapping. Empty prompt lines render as real line boxes so blank
lines in the middle of a prompt remain visible in the card preview.
`ToolNode` renders the tool name as a bold markdown line followed immediately by its description. The app-side
[`NodeBody`](../packages/app/src/components/NodeBody.tsx) markdown renderer trims first/last child
margins and resets body-local `pre` margins for node bodies so Markdown paragraph defaults and
colorized preview defaults do not reintroduce visual spacer lines. Generic node body previews
default to the shared monospace UI font so plain, markdown, and prompt-like bodies use the same
node-card typography unless a body spec explicitly opts into sans-serif text; the shared
[`nodeStyles`](../packages/app/src/components/nodeStyles.ts) also forces body-local `<pre>`
elements to inherit that font so custom body renderers do not fall back to browser-default monospace.

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

Folder rows are visually distinct from graph rows: folder names are bold, use the shared folder icon before the name, use chevron expanders, and show a filled pill with the recursive graph count after the name. Graph rows keep normal-weight text plus their reachability/reference indicators, and the configured Main Graph gets a small star icon before its name. The graph-reference dot is reverse dependency visibility for the currently open graph, but it intentionally excludes `Delegate Tool Call` nodes entirely because auto-delegate can theoretically route to any named graph and would otherwise make one delegate node mark nearly every graph as referenced. The Project tab uses the same star next to the Main Graph field label so the marker has an obvious legend where the setting is configured. Deleting a graph from the graph-list context menu opens a confirmation modal before calling the shared graph deletion hook.

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
- current-graph search state and project-wide go-to UI state
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
- remote debugger connect-popup geometry and top-layer z-index are intentionally small and pure in [`packages/app/src/utils/debuggerPanelPosition.ts`](../packages/app/src/utils/debuggerPanelPosition.ts); [`packages/app/src/components/DebuggerConnectPanel.tsx`](../packages/app/src/components/DebuggerConnectPanel.tsx) supplies the button/action-bar rects and should not reimplement clamping math or lower the panel below app overlays

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
- the internal executor connection uses `ws://127.0.0.1:21889/internal`
- graph execution settings are normalized separately by [`packages/core/src/api/processSettings.ts`](../packages/core/src/api/processSettings.ts); that resolver owns runtime defaults for app/node/trivet execution and should not become the owner for editor-only UI behavior, even though the legacy `Settings` object still carries a few editor-facing fields for compatibility
- newer pure-UI preferences that do not need plugin/core settings access, such as app UI font size, live in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) instead of the legacy `Settings` object

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
- uses `saveProjectDataNoPrompt` when the loaded project has a path and the active IO provider can actually save that target without prompting
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

Browser file reads intentionally keep a standard hidden `<input type="file">` fallback through
[`packages/app/src/io/browserFileInput.ts`](../packages/app/src/io/browserFileInput.ts). Embedded browsers can expose
`showOpenFilePicker()` while blocking `FileSystemFileHandle.getFile()`, so graph/recording imports and binary/text file
reads should not depend on file handles.

`BrowserIOProvider` is more capable only for project files:

- save-as uses `showSaveFilePicker()` and remembers the returned project file handle
- opening a project first tries `showOpenFilePicker()` so browsers that support writable handles can later save in place
- browser File System Access project pickers intentionally omit `types.accept` filters for `.rivet-project`, because Chromium rejects hyphenated extensions in picker filter metadata even though the suggested filename and actual project filename can still use `.rivet-project`
- because the browser picker cannot filter `.rivet-project`, selected handle names are validated before deserialization. Non-project selections fail with a clear project-file error instead of opening a second picker or trying to parse files such as `.rivet-data` as projects.
- project opening never requests `readwrite`; remembered project handles are save-in-place targets, and the browser may ask for write permission only when `Save project` writes back to that handle
- if the browser file-handle picker is unavailable, project opening falls back to the shared `<input type="file">` path. Once a handle has been selected, Rivet does not open a second fallback picker; read failures are reported directly so users do not accidentally open through upload-only mode and lose save-in-place.
- `Save project` writes back without a file picker only when a remembered project file handle exists; otherwise the shared save flow falls back to save-as
- provider capability checks such as `canSaveProjectDataNoPrompt()` are called as provider methods, not detached functions, because browser providers may keep save-target state in private instance fields
- remembered browser project handles use internal per-handle paths ending in the filename, so same-named project files do not collide while project tabs can still display the readable filename

The browser provider intentionally does not implement the full `PathBasedIOProvider` interface, because remembered project
file handles should not make arbitrary file-browser editors or runtime file-node path reads look available in browser mode.
The legacy browser provider uses download links for saves and the same shared input helper for reads.

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

- bridge remote debugger events into `useCurrentExecution`
- upload dynamic project/settings/static data when remote upload is enabled
- send preload data for run-from execution
- send `run`, `pause`, `resume`, `abort`, and `user-input` messages
- provide Trivet execution by awaiting request-scoped remote completion through the shared executor-session pending-run API

Current architectural detail:

- `useRemoteExecutor` no longer owns the websocket/session lifecycle directly
- it consumes a shared executor session that owns connection state and pending remote run coordination
- this keeps run/test behavior separate from transport/session behavior
- it does not reconnect the internal sidecar directly on disconnect; `executorSession` owns reconnect timing so callers do not race ahead of Tauri sidecar startup
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
- desktop Node-executor Code nodes use the sidecar-only `AppExecutorWorkerCodeRunner`: most dynamic JavaScript runs in a fresh Node worker thread so one long synchronous Code node does not block the sidecar event loop from finishing unrelated nodes and streaming their `nodeFinish` events back to the app.
- that worker-backed runner is intentionally not the public `@ironclad/rivet-node` default. Programmatic Node callers still use `NodeCodeRunner` unless they explicitly pass a custom runner. Code nodes that enable the `Rivet` capability fall back to the current-thread sidecar runner for compatibility with packaged sidecar resolution.
- Node executor mode is desktop-only because it depends on Tauri's sidecar launcher. [`packages/app/src/hooks/useExecutorSession.ts`](../packages/app/src/hooks/useExecutorSession.ts) starts the app-executor sidecar and waits for the sidecar runtime to report that its websocket server is listening before connecting to `ws://127.0.0.1:21889/internal`. The app-executor sidecar binds that internal server to `127.0.0.1` as well, avoiding localhost IPv4/IPv6 resolution mismatches. If a stale persisted `nodejs` executor setting is loaded in the plain web app, the app resets it to Browser mode instead of repeatedly attempting a sidecar connection that cannot exist outside Tauri.
- manual remote-debugger disconnect is not allowed to strand Node executor mode at `idle`. [`useRemoteDebugger`](../packages/app/src/hooks/useRemoteDebugger.ts) restores the internal Node executor websocket after disconnecting an external debugger when Node mode is still selected. [`executorSession`](../packages/app/src/hooks/executorSession.ts) exposes `connectInternal(...)` so hosted `executor.internalExecutorUrl` sessions and the desktop sidecar URL are both classified as internal executor sessions rather than external remote debugger sessions. This keeps the ActionBar Run button recovering without forcing users to switch Browser mode and back to Node mode.
- when a Code node enables `console`, the app-executor runner injects a bridged `console` object instead of the worker or sidecar process console. `console.debug/info/log/warn/error` calls are serialized into `codeConsole` executor messages and replayed in the renderer console for the active editor run. This keeps Browser and Node executor observability aligned without changing programmatic `@ironclad/rivet-node` console behavior.
- sidecar graph-run failures are request-scoped protocol results, not sidecar lifecycle failures. [`packages/app-executor/bin/executor.mts`](../packages/app-executor/bin/executor.mts) catches dynamic run failures, reports an `error` message with the active request id, detaches the processor from the debugger server, and keeps the websocket session alive so the ActionBar can return to its normal Run state after node/provider failures.
- the ActionBar separates Run-button visibility from executor readiness. Node executor mode keeps the Run controls visible while the internal sidecar is connecting or reconnecting, but disables the buttons until the shared executor session is ready; handled provider/node failures must not hide the Run button.
- the app logs sidecar/session lifecycle transitions at the executor boundary through `logRuntimeDebug`, enabled with `localStorage.setItem('rivet.debugRuntimeLogs', 'true')`. These logs cover sidecar start/readiness/stop, websocket status changes, close/reconnect scheduling, and skipped Node-mode runs when the session is not ready. They deliberately avoid graph input values and API keys while giving enough phase information to diagnose whether the breakage is process startup, websocket lifecycle, or request handling.
- sidecar stdout/stderr is treated as sidecar telemetry, not as a renderer error boundary. The packaged executor can write Node warnings and provider failure logs to stderr during otherwise correctly handled graph failures; [`packages/app/src/hooks/executorSidecarRuntime.ts`](../packages/app/src/hooks/executorSidecarRuntime.ts) records byte-count debug telemetry only and relies on the websocket protocol events above to drive UI state. The app-executor process also installs top-level `unhandledRejection` and `uncaughtException` handlers so late provider/stream failures after websocket startup are recorded instead of terminating the sidecar after the graph failure has already been sent as a request-scoped executor error. Startup-phase top-level failures still terminate the sidecar so broken startup does not masquerade as a healthy executor.
- sidecar startup readiness is intentionally stronger than process spawn. [`packages/app/src/hooks/executorSidecarRuntime.ts`](../packages/app/src/hooks/executorSidecarRuntime.ts) waits for the app-executor's `Rivet app executor websocket listening` stdout marker before reporting the sidecar as started, so the renderer does not connect while the spawned process is still binding the internal websocket.
- worker isolation does not introduce a new timeout or cancellation contract. Graph cancellation remains the processor-level behavior; the sidecar worker runner only prevents safe Code execution from monopolizing the executor's main event loop.

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

- internal sidecar executor: `ws://127.0.0.1:21889/internal`
- configurable remote debugger endpoint: default persisted as `ws://localhost:21888`

Conflating those will produce wrong behavior and wrong docs.

The session layer keeps those paths explicit so desktop Node execution does not become the architectural default for every future client.

## Core Runtime Boundary

The desktop app still depends heavily on `@ironclad/rivet-core`, but `GraphProcessor` is less monolithic than before.

Package-boundary rule:

- app code imports core through `@ironclad/rivet-core`; direct `packages/core/src/...` imports are blocked by the shared ESLint config
- if app UI needs to share runtime semantics with core, promote a deliberate core export first rather than coupling the app to core's file layout
- generic app-only utilities should live under `packages/app/src`, not under core
- the app's Vite config intentionally aliases `@ironclad/rivet-core` to [`packages/core/src/index.ts`](../packages/core/src/index.ts) during app dev/build, so dependencies introduced by browser-reachable core source may also need dependency visibility from [`packages/app/package.json`](../packages/app/package.json). This is why Chat v2's OpenAI-compatible provider SDK and its `zod` peer are listed in both core and app: core owns the runtime import, while app visibility keeps Vite/PnP source resolution working in development.

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
- the fixed [`ActionBar`](../packages/app/src/components/ActionBar.tsx) exposes a `data-node-editor-action-bar` measurement target; `NodeEditor` observes its current rect and the panel rect so `Active`, `Conditional node`, and similar top controls either wrap beside the visible Run/Abort/Disconnect buttons or move below them when the current button set is too wide. The available-space and right-reserve checks are measured against the panel content insets and the actual first control width, so the row does not jump before a control would collide.
- split-run, variant, and conditional controls live in [`packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx`](../packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx)
- split-run mode is presented as one segmented run-mode control with `Run once`, `Many parallel runs`, and `Many sequential runs` choices; the visible helper text changes with the selected mode, while persisted/runtime state still uses `isSplitRun` and `isSplitSequential` for compatibility. Split modes expose `Max runs` as the total item cap, and parallel mode additionally exposes `Max concurrent runs` as the per-node `splitRunConcurrency` override with a minimum of 2 and a default of the engine's parallel split-run concurrency fallback. The node-options row is a two-column layout: the left split-controls column shrinks within a 560px maximum measure shared by the run-mode segmented control and hint, while the right column keeps the Variants affordance in place as an icon button with `Variants` as both tooltip and native browser hint text. The expanded variants UI should render as its own small left-aligned section with a `Variants` header and a clear gap after the run-mode controls. When there are no saved variants and the user opens the add-variant field, that field should autofocus, the extra variants icon should stay hidden, and blur should close the variants section; removing all saved variants should also leave the section closed. The run-mode hint should match the brightness of normal panel helper text. Narrow settings panels should make the run-mode labels wrap inside the left column, not push Variants below the control and not create horizontal panel scroll. The max fields belong on their own row after the mode hint, not inline with the segmented control, and each max-field label/input pair should wrap as one setting so narrow panels stack `Max runs` and `Max concurrent runs` on separate lines instead of splitting labels from their inputs.
- node title, description, and color metadata live in [`packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx`](../packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx); title and description editors keep local draft state for responsive typing and autosave through a short debounce, while blur/confirm flushes immediately, the description editor treats `Enter` as submit and `Shift+Enter` as newline, the title uses a local full-width read/edit control to avoid Atlaskit read-view shrink-wrapping, description read/edit text should share the same 12px left inset as the title field by stripping Atlaskit's extra description read-wrapper padding, and both fields keep their pre-edit values so cancel restores the previous metadata
- switcher rows with visible labels should use [`packages/app/src/components/LabeledToggle.tsx`](../packages/app/src/components/LabeledToggle.tsx) so the switch stays on the left, the label has consistent spacing from the switch, the label gets a pointer cursor, and hovering the switch, label, or helper hint applies the same toggle hover treatment without making unrelated empty row space clickable. Toggle helper text belongs under the label, not below the whole control row, and the helper hint is also a native label for the switch so anything that looks connected to the switch is clickable. The switch should stay aligned to the label line when helper text is present. Labels inside these rows should inherit the shared row typography instead of forcing one-off sizes, and wrappers such as tooltips should preserve inline-flex alignment instead of changing the row geometry. The node settings panel, settings modal pages, fullscreen-output Markdown toggle, prompt-designer toggle, and similar labeled toggle rows should share that component instead of pairing raw Atlaskit `Toggle` and `Label` ad hoc. Switcher active states use the app primary color, not green success styling, so toggles stay aligned with the current theme accent. Switcher glyphs should use CSS codepoint escapes inside [`ScalableToggle`](../packages/app/src/components/ScalableToggle.tsx) rather than pasted Unicode characters so check/cross rendering stays stable across Windows encodings.
- generic editor-definition row grouping lives in [`packages/app/src/components/editors/editorUtils.ts`](../packages/app/src/components/editors/editorUtils.ts) via `getEditorRenderRows(...)`; both `DefaultNodeEditor` and [`EditorGroup`](../packages/app/src/components/editors/EditorGroup.tsx) should consume that row model instead of rebuilding inline-editor grouping in JSX, so `layout: 'inline'` behaves consistently at the top level and inside grouped settings. `EditorGroup` supports the normal manual fold/unfold header and a toggle-backed header via `toggleDataKey`; the toggle-backed form renders as a plain toggle row while off, then becomes a no-chevron section header with its grouped body visible while on. Manual fold/unfold choices are app UI state, not project data: `nodeEditorGroupOpenState` in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) stores them per node type and stable editor-group key, with default visibility still coming from each group definition's `defaultOpen` until the user changes it. The storage helper lives in [`packages/app/src/utils/nodeEditorGroupState.ts`](../packages/app/src/utils/nodeEditorGroupState.ts), treats persisted UI storage as untrusted runtime data, and nested groups should keep parent-prefixed keys so same-label child sections do not collide.
- default field dispatch still flows through [`packages/app/src/components/editors/DefaultNodeEditorField.tsx`](../packages/app/src/components/editors/DefaultNodeEditorField.tsx), which routes `type: 'code'` editor definitions through [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx). Generic editor helper text should render immediately after the visible label and before the editable control; when helper text is present, the visual gap from label to hint should be tighter than the gap from hint to control. Vertical spacing between settings rows is owned by the shared `--node-editor-row-gap` in [`packages/app/src/components/editors/DefaultNodeEditor.tsx`](../packages/app/src/components/editors/DefaultNodeEditor.tsx), and grouped settings in [`EditorGroup`](../packages/app/src/components/editors/EditorGroup.tsx) reuse that same breathing-room value while the opened group body owns its own top padding before the first row. The row rhythm is applied as bottom-only spacing between rendered rows, not top margins or mixed row gaps, and the row boundary resets Atlaskit's default `Field` top margin so regular fields, custom-editor wrapper fields, fields with side input-port controls, toggle rows, segmented controls, and inline rows do not need one-off margin fixes. Wrapper-based editors such as [`StringListEditor`](../packages/app/src/components/editors/StringListEditor.tsx) and [`KeyValuePairEditor`](../packages/app/src/components/editors/KeyValuePairEditor.tsx) should also reset their nested Atlaskit `Field` top margin so their whole row starts on the same baseline as direct Field editors, while keeping their own internal control spacing. Empty dynamic-list editors should not render empty spacer containers above their Add button. Side input-port buttons align from the rendered field's control edge instead of relying on a fixed top offset, while code-editor rows keep a top offset because their editable area can be much taller than a normal field. Node definitions should only use post-control helper copy when that copy is intentionally about what comes after a large editor, such as JS callback interpolation reminders. Code editor helper text spacing, newline preservation, and optional post-editor helper copy are owned by that generic code-editor path plus `DefaultNodeEditor` styles, so body-only nodes such as Expression, JS Filter, and JS Map do not need per-node spacing fixes.
- `type: 'segmented'` editor definitions render through [`packages/app/src/components/editors/SegmentedEditor.tsx`](../packages/app/src/components/editors/SegmentedEditor.tsx) and reuse the same modern capsule `.segmented-choice` visual language as the split-run `parallel` / `sequential` control and the settings-modal theme selector; the shared styling lives in `SegmentedEditor` itself, and global controls such as the split-run mode selector should render the same component rather than raw `.segmented-choice` markup, so normal segmented settings, header/global controls, and app settings stay visually aligned, with a padded slightly left-aligned track, primary active pill, and UI-font-size-aware height. Segmented options should prefer one-line labels, measure whether that one-line layout would overflow, and only then allow wrapped labels to increase the whole capsule height instead of clipping the active pill, letting text fall outside the socket, or creating horizontal scroll in the node settings panel. Options may write string or boolean data fields, and nodes should use this shared editor metadata instead of bespoke app-side settings components when they only need a small fixed choice set
- `Code` node execution diagnostics are split deliberately: [`packages/core/src/model/nodes/CodeNode.ts`](../packages/core/src/model/nodes/CodeNode.ts) enriches user-code runtime and syntax errors with code-node line/column information, while [`packages/app/src/components/nodes/CodeNode.tsx`](../packages/app/src/components/nodes/CodeNode.tsx) renders Code-node failures as a structured red output with the error message plus an `Error location` section. The app also stores the Code source snapshot from run start and uses it to highlight the failed line in the Code editor for the same selected failed process-history page shown in the output view, but only while the current editor text still matches that failed run; the highlight disappears as soon as the user edits. Successful runs do not perform a syntax parse; syntax-location parsing is only attempted after an `AsyncFunction` construction failure.
- built-in callback-list nodes such as `jsFilter` and `jsMap` intentionally stay on that generic `type: 'code'` editor path; their "body of `(item, index, array) => { ... }`" UX is a core-node contract created through seeded callback-body text, pre-editor signature helper copy, post-editor interpolation helper copy, and generated execution wrappers rather than an app-side custom editor. Shared scaffolding for their input definitions, editor definition, body preview, CodeRunner options, value-backed interpolation, and process-time output validation lives in [`packages/core/src/model/nodes/jsListCallbackHelpers.ts`](../packages/core/src/model/nodes/jsListCallbackHelpers.ts), while the filter/map wrapper strings stay explicit so their runtime differences remain easy to inspect. They support the same value-backed `{{var}}` interpolation contract as `Expression`: dynamic interpolation ports are `any` ports, values evaluate as connected values through generated internal references, missing values become `undefined`, and cloned inputs prevent callback-side object/array mutation from mutating upstream graph data. Function-valued inputs are wrapped so property mutation stays local, though invoking a function can still perform whatever side effects that function itself implements. Callback-local names (`item`, `index`, and `array`) stay reserved through the exported `JS_LIST_CALLBACK_LOCAL_NAMES` set so input-port discovery and app-side parsed-source display share the same boundary; if written as `{{item}}`, `{{index}}`, or `{{array}}`, they resolve to the existing callback parameters rather than creating ports. The app gives these nodes a presentation-only output renderer in [`packages/app/src/components/nodes/JSListNode.tsx`](../packages/app/src/components/nodes/JSListNode.tsx): normal output values remain unchanged, and the renderer shows a `Parsed expression` source preview only when the callback body actually defines interpolation-created input ports.
- the built-in `Expression` node stays on that generic `type: 'code'` editor path; its `{{var}}` ports, fixed `output` contract, and disabled-by-default runtime capabilities are all core-node behavior rather than an app-side custom editor. `Expression` interpolation ports are `any` ports and evaluate as connected values, not pasted source snippets, so users can write `{{array}}[0]`, `{{object}}.field`, or `{{a}} == "123"` without typing `.value` or manually quoting string inputs. The runtime wrapper still uses generated internal value references, but clones input values before evaluation so object/array mutations inside the expression cannot mutate upstream graph data; function-valued inputs are wrapped so property mutation stays local, while invocation side effects still belong to the function. Core sanitizes Expression errors so node output does not expose those internal identifiers. The app gives Expression a presentation-only custom output renderer in [`packages/app/src/components/nodes/ExpressionNode.tsx`](../packages/app/src/components/nodes/ExpressionNode.tsx): successful runs show `Resulting value`, failed runs keep the red error state and show the error, and both states show a user-facing `Parsed expression` only when interpolation-created input ports exist. In that preview, primitives render as JavaScript literals while arrays and objects render as variable names to avoid dumping large structures. None of that changes the real graph output contract, which remains one fixed `output` value.
- `Extract Object Path` uses the shared core interpolation parser for stored-path `{{var}}` ports and now shares the same presentation-only parsed-source convention: [`packages/app/src/components/nodes/ExtractObjectPathNode.tsx`](../packages/app/src/components/nodes/ExtractObjectPathNode.tsx) renders the normal `Match` / `All Matches` outputs unchanged and adds `Parsed expression` only when the stored path has interpolation-created input ports and `usePathInput` was off for that run. The preview prefers the path and mode snapshots captured at node start; app-side rendering can substitute node input ports exactly, while `@graphInputs.*` / `@context.*` references remain visible in the preview because their runtime values are not part of node input history. This parsed path is display-only and does not add or mutate graph outputs.
- `Tool` emits a `gpt-function` value with `name`, `description`, JSON-schema `parameters`, and `strict`. Its node settings put the AI schema-generation helper first, then the normal tool name/description/schema fields, and keep `Strict` last because it is an advanced compatibility flag rather than part of normal tool setup. The Description editor uses the same resizable `prompt-interpolation-markdown` Monaco editor shell as the Text node for consistent editing behavior, but this is presentation only: Tool descriptions still do not create `{{var}}` input ports. The `Strict` switch is intentionally labeled as legacy-Chat-only in the node editor: it is forwarded by the legacy OpenAI Chat tool path, but `LLM Chat` converts Rivet tools through the Vercel AI SDK bridge and currently does not consume the `strict` flag.
- `LLM Chat` keeps [`packages/core/src/model/nodes/LLMChatV2Node.ts`](../packages/core/src/model/nodes/LLMChatV2Node.ts) as a thin node shell: it owns node registration, input/output definitions, body preview, and calls into the runtime, while node defaults live in [`packages/core/src/model/chat-v2/llmChatV2NodeData.ts`](../packages/core/src/model/chat-v2/llmChatV2NodeData.ts), settings UI construction lives in [`packages/core/src/model/chat-v2/llmChatV2NodeEditors.ts`](../packages/core/src/model/chat-v2/llmChatV2NodeEditors.ts), runtime option/provider/tool assembly lives in [`packages/core/src/model/chat-v2/chatV2RuntimeOptions.ts`](../packages/core/src/model/chat-v2/chatV2RuntimeOptions.ts), editor-only cache keying/cloning lives in [`packages/core/src/model/chat-v2/chatV2EditorCache.ts`](../packages/core/src/model/chat-v2/chatV2EditorCache.ts), and [`packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts`](../packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts) stays a readable coordinator plus compatibility re-export surface. Keep future Chat v2 settings and provider-option wiring in those helper modules instead of growing the node class; the pipeline modules should stay focused on provider-neutral message streaming and tool continuation.
- `LLM Chat` keeps credential-source selection in the `Model` group. Its Model Catalog custom editor owns the `Model` row as a single control line: provider-backed model dropdown, model input-port plug button, and the primary `Re-fetch Model List` action. Keep that layout inside [`packages/app/src/components/editors/custom/LLMChatV2ModelCatalogEditor.tsx`](../packages/app/src/components/editors/custom/LLMChatV2ModelCatalogEditor.tsx) instead of splitting it back into separate generic editor rows, because the plug belongs visually to the model dropdown while the refresh button belongs to the same model-list workflow. When `Provider` is `Custom provider`, the same custom editor intentionally switches the `Model` row to a one-line text field and hides model-list refresh because Rivet has no provider catalog contract for arbitrary OpenAI-compatible endpoints. `API key source` is rendered after that custom editor as a segmented editor backed by `apiKeySource`: the default `Configured key` mode uses the existing provider configuration (`settings.openAiKey` for OpenAI and provider plugin config for Anthropic/Google), while `Input port` adds an `API Key` string input and passes that value to the Vercel provider factory for the main model request plus provider-built-in OpenAI/Google tools. For `Custom provider`, configured-key mode exposes `API key env var name` (`CUSTOM_PROVIDER_API_KEY` by default); runtime resolution checks `settings.pluginEnv[envVarName]` first and then `process.env[envVarName]`, while the app's editor execution paths scan the current project for those custom env var names through [`packages/app/src/utils/chatV2CustomProviderEnv.ts`](../packages/app/src/utils/chatV2CustomProviderEnv.ts) and preload them with [`packages/app/src/utils/tauri.ts`](../packages/app/src/utils/tauri.ts) before browser or remote/internal Node execution when the desktop/native environment can provide them. Browser-only web builds cannot read host env vars, so custom providers in web mode should use the `API Key` input port or server-side Node execution. The `API Key` port is intentionally optional for graph scheduling so a disconnected key does not leave the node silently pending; [`packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts`](../packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts) performs the runtime check and fails the node clearly when `Input port` is selected without a non-empty key. Runtime code must not put raw API keys into node previews or editor cache keys; cache scoping uses small secret fingerprints so changing the input key or provider-header values changes cache identity without serializing the raw secret.
- `LLM Chat` model-catalog refresh is app/editor-only and intentionally avoids arbitrary custom-provider discovery. [`packages/app/src/utils/chatV2ModelCatalog.ts`](../packages/app/src/utils/chatV2ModelCatalog.ts) may log model-catalog fetch diagnostics, but those logs must not include raw API keys; URLs that would otherwise contain query-string keys are redacted before logging.
- `LLM Chat` normalizes common Vercel AI SDK/provider errors through [`packages/core/src/model/chat-v2/chatV2Errors.ts`](../packages/core/src/model/chat-v2/chatV2Errors.ts) before they reach node output. API call errors keep the node in the normal failed/red state, but the user-facing message includes provider, model, endpoint, status-specific guidance, and a short provider response message when available. The formatter intentionally avoids request bodies, headers, raw API keys, endpoint query strings, and whole provider-data object dumps so prompts, request metadata, and secrets do not leak into the error view. Unknown runtime errors and aborts are left untouched so tool/delegation bugs and cancellation behavior remain diagnosable.
- `LLM Chat` treats Rivet `Tool use` and structured response formats (`JSON` / `JSON schema`) as mutually exclusive. The app-side node settings panel blocks edits that would enable both and shows a small modal explaining that the user must pick either `Tool use` with `Default` / `Text`, or `Structured outputs` with Tool use off. The shared compatibility helper in [`packages/core/src/model/chat-v2/chatV2FeatureCompatibility.ts`](../packages/core/src/model/chat-v2/chatV2FeatureCompatibility.ts) owns the conflict detection and a single modal-copy object; the runtime failure uses that same copy object's primary paragraph so app and runtime wording cannot drift. Core runtime also checks the same rule before creating the provider request so project-file edits or API-created graphs fail clearly instead of surfacing provider-specific `tools` plus `response_format` 400s.
- `LLM Chat` emits provider-neutral tool calls from [`packages/core/src/model/chat-v2/chatV2Pipeline.ts`](../packages/core/src/model/chat-v2/chatV2Pipeline.ts); its `Function Calls` port is always an `object[]` when calls are returned because Vercel AI SDK streams zero, one, or many tool calls through the same surface. Its `Parameters` group forwards the shared Vercel generation settings through [`packages/core/src/model/chat-v2/aiSdkBridge.ts`](../packages/core/src/model/chat-v2/aiSdkBridge.ts): `Temperature`, `Max output tokens`, `Top P`, `Top K`, `Presence penalty`, `Frequency penalty`, `Stop sequences`, and `Seed` (`maxTokens` remains the persisted field and input port id for compatibility, but the UI label matches the Vercel `maxOutputTokens` option). These options are best-effort provider settings; `Temperature` is documented as possibly ignored by reasoning models, and `Top K` is explicitly documented in the editor as provider-dependent because some providers/models ignore or reject it. The AI SDK bridge omits optional SDK arguments entirely when Rivet has no value for them, rather than passing explicit `undefined` keys such as `tools`, `output`, or `providerOptions`; OpenAI-compatible providers can interpret the mere presence of those request-shape hints as feature activation, so absence matters for combinations such as custom-provider JSON schema output without tools. Provider-specific reasoning controls live in the separate `Reasoning` editor group immediately after `Parameters`, and the runtime resolver is intentionally tested in [`packages/core/test/model/nodes/LLMChatV2Node.test.ts`](../packages/core/test/model/nodes/LLMChatV2Node.test.ts) because these are provider option contracts, not normal shared generation settings. OpenAI forwards `reasoningEffort` and `reasoningSummary` through `providerOptions.openai`; Anthropic forwards optional `effort` plus `thinking` mode and optional `budgetTokens` through `providerOptions.anthropic`; Google forwards `thinkingConfig.thinkingLevel`, `thinkingConfig.thinkingBudget`, and `thinkingConfig.includeThoughts` through `providerOptions.google`. Custom OpenAI-compatible providers use the `@ai-sdk/openai-compatible` provider factory and intentionally do not receive OpenAI Responses-specific provider options or built-in OpenAI tools. `Provider Advanced` also exposes `Extra provider options` as a JSON-object escape hatch that is wrapped into the selected provider namespace (`providerOptions.openai`, `providerOptions.anthropic`, `providerOptions.google`, or `providerOptions.custom`) before the request is sent; this is for provider/model-specific Vercel options such as custom OpenAI-compatible reasoning fields. The same setting can be switched to an input port that accepts either a JSON string or an object value, and the visible first-class controls above it override conflicting top-level fields so the settings UI remains truthful. When that input-port mode is enabled, the static JSON editor value is ignored by both runtime resolution and editor cache identity; only the connected input value participates in the effective provider options. Because that JSON can contain provider-specific secrets, editor cache keys fingerprint both the raw JSON setting and the resolved provider-options object instead of serializing those values directly. Empty provider-specific option objects are intentionally omitted, and Anthropic defaults intentionally omit `providerOptions.anthropic` until the user chooses a reasoning option, so selecting Anthropic does not silently force extended thinking. The node's separate `Response format` group maps UI choices to the Vercel AI SDK `Output` helpers through [`packages/core/src/model/chat-v2/chatV2ResponseFormat.ts`](../packages/core/src/model/chat-v2/chatV2ResponseFormat.ts): Default omits the SDK `output`, Text uses `Output.text()`, JSON uses `Output.json(...)`, and JSON schema uses `Output.object({ schema: jsonSchema(...) })`. Choosing JSON schema adds a required `Response Schema` input port that accepts either a JSON schema object or a `gpt-function`; JSON and JSON schema can also expose optional `Schema Name` and `Schema Description` input ports when their input toggles are enabled. Assistant messages only store `function_calls` when that list is non-empty, so output renderers do not show phantom `Function Calls:` sections for normal answers. When the node declares the `Function Calls` output but the final model turn has no manual calls left, that output is normally emitted as `control-flow-excluded` instead of being omitted. If `Auto-continue after toolcalls run` handled one or more Rivet tool calls before the final answer, [`packages/core/src/model/chat-v2/toolContinuation.ts`](../packages/core/src/model/chat-v2/toolContinuation.ts) emits already-delegated tool-call records on that same `Function Calls` output so a connected `Delegate Tool Call` node can display the stored tool outputs without executing the tools again. Rivet tool-calling settings live in the node's `Tools` editor group: `Tool use` exposes the `Tools` input, `Tool choice` offers Default/Auto/Specific tool/Required and is forwarded to the Vercel AI SDK as `toolChoice` (`Default` omits the option, `Auto` and `Required` pass SDK string modes, and `Specific tool` uses the `Tool name` field to produce `{ type: 'tool', toolName }`), `Allow parallel toolcalls` is hidden only for `Custom provider` in the current editor, but the runtime currently maps it only for OpenAI by forwarding `providerOptions.openai.parallelToolCalls` so the SDK maps it to the OpenAI `parallel_tool_calls` request field, and `Auto-continue after toolcalls run` lets the node run all tool calls in a model turn, append their function-result messages, and ask the model again until it returns a non-tool response or `Max tool rounds` is exhausted. Auto-continuation passes the same Rivet function definitions into every model round, including the first request and follow-up requests after tool results, because otherwise the model would not be allowed to call the connected tools. Auto-continuation only handles tool calls whose names came from the node's Rivet function definitions; unknown/provider-built-in tool calls stop naturally and are returned through the normal tool-call outputs. Tool execution reuses [`packages/core/src/model/nodes/toolCallDelegation.ts`](../packages/core/src/model/nodes/toolCallDelegation.ts), the same subgraph/external-function delegation path used by [`Delegate Tool Call`](../packages/core/src/model/nodes/DelegateFunctionCallNode.ts), so subgraphs named for the tool and registered external functions behave consistently in manual and auto-continue flows.
- `LLM Chat` places provider-specific `OpenAI`, `Anthropic`, and `Google` editor groups immediately after the `Model` group so provider-only request knobs stay close to provider/model selection. It does not render a provider-specific group for `Custom provider`; the custom-provider contract is the OpenAI-compatible base URL plus generic request settings. The custom provider's `Provider base URL` field lives in `Model`, uses the existing `baseURL` / `useBaseURLInput` data keys, accepts either a base URL such as `https://api.cerebras.ai/v1` or a full `/chat/completions` endpoint, and normalizes that endpoint through [`openAICompatibleEndpointToBaseURL(...)`](../packages/core/src/model/chat-v2/providerOptions.ts). The generic `Provider Advanced` `Base URL` override remains available for built-in providers but is hidden for custom providers to avoid two URL fields pointing at the same runtime value. It does not expose Google provider-specific `Structured Outputs` because the shared `Response format` group is Rivet's text/JSON/JSON-schema contract.
- `LLM Chat` labels its `useAsGraphPartialOutput` output toggle as `Stream response`. This is an editor-observability switch: streamed response updates can appear in the node output while the node is running, but connected nodes only receive the final `Response` value after the model response is complete.
- `LLM Chat` labels its `outputReasoning` toggle as `Output reasoning` and places it in the `Reasoning` editor group next to provider reasoning/thinking controls. When enabled, the node adds a `Reasoning` output populated from Vercel AI SDK reasoning/thinking stream parts collected by [`consumeAiSdkStream(...)`](../packages/core/src/model/chat/aiSdkStreaming.ts). A single model call emits a `string`; `Auto-continue after toolcalls run` emits a `string[]` with one entry per model round instead of concatenating presentation labels into the data. This is observability output only: reasoning text is not added to `Messages Sent`, `All Messages`, or tool-continuation prompts, because provider thinking is not normal conversation content. Providers and models differ here; some emit full thinking text, some emit summaries, and some expose only reasoning-token counts through `Usage`.
- `LLM Chat` labels its `outputUsage` toggle as `Output usage details`; when enabled, the node adds the `Usage` output from Vercel AI SDK `LanguageModelUsage` metadata normalized into prompt, completion, total, cached, and reasoning token counts plus Rivet's estimated cost when available. For a normal single model call, `Response Tokens` and `Usage` describe that one SDK response. In `Auto-continue after toolcalls run` mode, [`packages/core/src/model/chat-v2/toolContinuation.ts`](../packages/core/src/model/chat-v2/toolContinuation.ts) sums normalized usage across every model round in the continuation loop, including tool-call rounds and the final answer/stopping round, then writes the accumulated completion-token count back to `Response Tokens` and the accumulated object back to `Usage`. If any included round has unknown estimated cost, the accumulated `totalCost` stays `undefined` rather than under-reporting a partial cost. Its `cache` toggle is labeled `Cache outputs (editor only)`; it is editor-only and uses the optional `ProcessContext.editorExecutionCache`, not the normal per-run `InternalProcessContext.executionCache`. The Rivet app supplies that cache only for editor graph runs: browser execution mode keeps an in-memory cache per project in [`packages/app/src/hooks/useLocalExecutor.ts`](../packages/app/src/hooks/useLocalExecutor.ts), and Node execution mode passes `useEditorCache` to the app-executor sidecar so [`packages/app-executor/bin/executor.mts`](../packages/app-executor/bin/executor.mts) uses its own per-project in-memory cache. Public `@ironclad/rivet-node` programmatic runs and Trivet/test runs omit this cache by default, so this switch has no runtime-library effect unless an advanced caller deliberately supplies `editorExecutionCache`. Cache hits are scoped by project and node id, so two different `LLM Chat` nodes never share cached outputs even if their settings and inputs are identical. Within one node, hits reuse the previous outputs only when the effective input is the same; the implementation keys on node data, provider config, API-key fingerprint, prompt, system prompt, tools, generation settings, response format, provider options, and tool choice. The cache key uses stable serialization so equivalent tool schemas/provider metadata do not miss just because object keys were assembled in a different order, and cached output maps are cloned on write/read so downstream node code cannot mutate the stored cache entry by reference. Cached values persist while the project remains open in the app/executor process and are cleared when the app/executor process exits.
- [`Delegate Tool Call`](../packages/core/src/model/nodes/DelegateFunctionCallNode.ts) remains the manual single-call consumer for raw tool calls: it accepts the legacy `Chat` node's direct `{ name, arguments, id }` `Function Call` object, accepts a one-item `Function Calls` array from legacy parallel Chat or LLM Chat for the common single-tool-call wiring path, parses legacy JSON-string `arguments`, and fails clearly for raw multi-call arrays so callers use `Run per item` or select one tool call instead of losing the call name. It also recognizes already-delegated records emitted by `LLM Chat` auto-continuation and surfaces their stored outputs without re-running the tool; one record produces the normal `output` string and `message` chat-message, while multiple records produce `string[]` / `chat-message[]` outputs for observability when several tools ran in one LLM run. The `message` output definition still includes `object` / `object[]` alongside `chat-message` / `chat-message[]` so older object-compatible wiring remains connectable even though the runtime value is a chat message. Function response chat messages keep `name` as the provider tool-call id and may also carry `toolName` as the user-visible tool/function name; the Vercel AI SDK converters prefer `toolName` for `tool-result` messages while legacy OpenAI chat-completion conversion continues to use `name` as the `tool_call_id`.
- `Http Call` also stays on the generic node-editor path; its `Catch all request failures` toggle is a core-node contract that adds optional `Request failed` and `Request error` outputs and converts all non-abort execution failures in that node into `control-flow-excluded` normal outputs plus `Request failed = true` while still letting the node finish successfully. `Request error` carries the formatted caught error stack/message plus nested `cause` details when available, and caught-failure results intentionally put that output first so compact successful output previews show the error instead of a leading excluded normal output; on successful requests that output is `control-flow-excluded`. That broad catch now includes invalid URLs, transport failures, non-`2XX` responses when `Fail on non-2XX status code` is enabled, invalid request JSON/config, response body read failures, and JSON parse failures. Abort/cancel still remains a hard node error so graph cancellation semantics do not get swallowed. `Retry on non-200` is a separate request policy and is intentionally the first execution-behavior switch after the request body editor: when enabled, it retries returned HTTP responses whose status is not exactly `200` before response parsing or fail/catch handling runs, using a minimum repeat count of `1` and the configured cooldown. Its concise `Repeat times` / `Cooldown, ms` fields live inside the same toggle-backed `Retry on non-200` editor group with helper text explaining the repeat count and cooldown semantics; switching it off collapses the body back to a plain switcher instead of leaving a section frame or separate fold control. Exhausted retries flow into the existing `Fail on non-2XX status code` and `Catch all request failures` switches normally. The node body preview uses the shared core `getHttpCallBodyPreviewSections(...)` helper, while [`packages/app/src/components/nodes/HttpCallNode.tsx`](../packages/app/src/components/nodes/HttpCallNode.tsx) renders those sections with a CSS-controlled `--http-call-node-body-section-gap` gap instead of embedding blank spacer lines in the text.
- The `Http Call` canvas body preview is also responsible for clipping its preview sections to the node content width. Long unbroken URLs or request labels should not render outside a narrowed node or overlap ports; preserve line breaks from `getHttpCallBodyPreviewSections(...)`, but keep horizontal overflow hidden in [`HttpCallNode.tsx`](../packages/app/src/components/nodes/HttpCallNode.tsx).

This keeps the real boundary in place without preserving a thin wrapper file that only forwarded editor props.

Split-run mode UI is presentation-only:

- the node editor may render split execution as an explicit `parallel` / `sequential` choice
- persisted node state still uses the existing `isSplitSequential?: boolean` flag from [`packages/core/src/model/NodeBase.ts`](../packages/core/src/model/NodeBase.ts)
- `parallel` must continue to map to `false`/`undefined`, and `sequential` must continue to map to `true`

Current canvas header affordances for split nodes:

- visual node headers render a split-mode icon in [`packages/app/src/components/visualNode/SplitRunModeIcon.tsx`](../packages/app/src/components/visualNode/SplitRunModeIcon.tsx)
- split nodes also render the editable split summary in [`packages/app/src/components/visualNode/SplitRunSummary.tsx`](../packages/app/src/components/visualNode/SplitRunSummary.tsx), directly under the node title/description, so split metadata stays with the header instead of floating above the card. Sequential summaries show `sequential, max N`; parallel summaries also show the effective concurrency as `parallel, max N, conc M`.
- that summary is an edit affordance and should open the same node settings panel as the hover-revealed gear control
- node headers remain drag activators, but their hover cursor is an open hand (`grab`) rather than a move cursor so the header reads like a draggable card surface instead of a resize/move-only handle. While a node drag is active, the canvas root gets a `dragging-node` class that forces the closed-hand `grabbing` cursor across the drag surface; header/overlay styling also uses `grabbing` as a local fallback.
- hovered non-comment nodes temporarily rise above other normal and selected nodes through [`packages/app/src/components/nodeStyles.ts`](../packages/app/src/components/nodeStyles.ts) so partially covered nodes become readable on hover; Comment nodes intentionally keep their behind-normal-node stacking behavior so overlapping node headers remain grabbable

Current node-editor Monaco rules that matter for editor changes:

- `CodeEditorDefinition.enableFolding` is an explicit opt-in capability on core editor definitions; folding is intentionally enabled only for selected built-in code/JSON node-editor fields, not for every Monaco surface in the app
- the shared Monaco wrapper in [`packages/app/src/components/CodeEditor.tsx`](../packages/app/src/components/CodeEditor.tsx) is generic and create-once; it should treat its `theme` prop as an already-resolved Monaco theme id instead of reading app theme state itself
- node-editor-specific structural identity is owned by the node-editor wrapper in [`packages/app/src/components/editors/CodeEditor.tsx`](../packages/app/src/components/editors/CodeEditor.tsx); it uses an inline mount key based on node, field, language, resolved theme, and folding mode so Monaco remounts only when editor identity actually changes
- the side-panel node editor in [`packages/app/src/components/NodeEditor.tsx`](../packages/app/src/components/NodeEditor.tsx) is keyed by edited node id. This intentionally remounts editor-local state when the panel switches from one node to another, preventing pending/default field state from one open settings panel from leaking into a newly created or newly selected node.
- prompt-interpolation theme expansion should go through `resolveMonacoTheme(...)` in [`packages/app/src/components/codeEditorTheme.ts`](../packages/app/src/components/codeEditorTheme.ts); both the node-editor code path and [`packages/app/src/components/ColorizedPreformattedText.tsx`](../packages/app/src/components/ColorizedPreformattedText.tsx) share that helper instead of duplicating prompt-theme resolution
- Monaco preview surfaces such as [`packages/app/src/components/ColorizedPreformattedText.tsx`](../packages/app/src/components/ColorizedPreformattedText.tsx) should stay aligned with the real editor by resolving the same effective Monaco theme and using Monaco's default foreground for dark themes instead of inheriting generic node/output text color
- node-editor viewport resizing for Monaco code fields is intentionally narrower than "all `type: 'code'` editors": only `javascript`, `json`, and `prompt-interpolation-markdown` node-editor fields use the explicit resizable viewport shell
- prompt-interpolation Monaco languages are registered in [`packages/app/src/utils/monaco.ts`](../packages/app/src/utils/monaco.ts); they must define both tokenization and language configuration so editor behaviors like brace auto-closing/delete stay aligned with built-in Monaco languages instead of falling back to bare token coloring
- prompt-style `{{...}}` input discovery and runtime substitution are owned by [`packages/core/src/utils/interpolation.ts`](../packages/core/src/utils/interpolation.ts); malformed openers like `{{bar` must stay literal instead of swallowing later valid tokens, escaped `{{{...}}}` tokens must round-trip literally, and custom interpolation nodes like [`packages/core/src/model/nodes/ObjectNode.ts`](../packages/core/src/model/nodes/ObjectNode.ts), [`packages/core/src/model/nodes/ExtractObjectPathNode.ts`](../packages/core/src/model/nodes/ExtractObjectPathNode.ts), [`packages/core/src/model/nodes/ExpressionNode.ts`](../packages/core/src/model/nodes/ExpressionNode.ts), and [`packages/core/src/model/nodes/jsValueInterpolation.ts`](../packages/core/src/model/nodes/jsValueInterpolation.ts) should reuse the shared token-boundary / replacement helpers rather than reintroducing regex parsing drift
- [`packages/core/src/model/nodes/ExtractObjectPathNode.ts`](../packages/core/src/model/nodes/ExtractObjectPathNode.ts) only derives dynamic interpolation ports from the stored `Path` editor value when `usePathInput` is off; `usePathInput` mode keeps the explicit `path` input as the sole path source, `@graphInputs.*` and `@context.*` references participate at runtime without generating ports, and the built-in `object` port name stays reserved so `{{object}}` cannot silently bind to a hidden built-in input
- interpolation-created input ports must be built with [`packages/core/src/model/interpolationInputDefinition.ts`](../packages/core/src/model/interpolationInputDefinition.ts). This is required for every current and future node that turns user-authored `{{var}}` tokens into connectable input ports, including plugin nodes; the helper stores editor/runtime-only metadata on `NodeInputDefinition.data` without changing serialized graph data.
- interpolation-port rename preservation is deliberately narrow: [`packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts`](../packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts) compares the current live node definitions with the next node definitions, and only rewrites a live incoming connection when exactly one interpolation-created input disappeared and exactly one interpolation-created input appeared. During merged text edits, this lets live wires keep following per-character renames such as `{{a}}` to `{{aa}}` to `{{aaa}}`.
- once an interpolation port has fully disappeared and its connection is in the recoverable pool, recovery is exact-id only. Recreating `{{name}}` restores the old `name` wire, but typing a different new token such as `{{n}}` creates a new input and must not steal the old `{{name}}` connection. If the old port still exists, multiple old/new interpolation ports changed, the new slot is occupied, or malformed duplicate old-name connections exist, the normal stale/recoverable rules win so graph consistency is preserved.
- nodes that hand-roll interpolation input definitions will still execute, but their connected ports will be treated like ordinary dynamic ports and clear token renames will drop into stale/recoverable handling instead of preserving the wire automatically.
- dynamic-port text edits that flow through [`packages/app/src/commands/editNodeCommand.ts`](../packages/app/src/commands/editNodeCommand.ts) now also own forward connection recovery: when an edit invalidates an incident port, [`packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts`](../packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts) moves that auto-removed connection into the ephemeral per-graph pool in [`packages/app/src/state/recoverableNodeConnections.ts`](../packages/app/src/state/recoverableNodeConnections.ts); if a later edit recreates the exact same port id on the same side, the connection is restored without needing command-stack undo, but recovery must still respect live input-slot uniqueness and the current validity of both endpoints
- graph-input deletion warnings use [`packages/app/src/domain/graphEditing/graphInputUsage.ts`](../packages/app/src/domain/graphEditing/graphInputUsage.ts) as a display-ready usage model: it reports direct `Subgraph` terminal usages plus conservative `Graph Reference` / `Call Graph.inputs` object usages, formats caller labels without duplicating default type names, and returns a `displayPath` so [`packages/app/src/components/DeleteGraphInputConfirmModal.tsx`](../packages/app/src/components/DeleteGraphInputConfirmModal.tsx) can stay presentational
- `Graph Input` id renames are a special edit-node case handled by [`packages/app/src/domain/graphEditing/graphInputRenamePropagation.ts`](../packages/app/src/domain/graphEditing/graphInputRenamePropagation.ts): when the old graph input id disappears from the edited graph, direct `Subgraph` caller connections and `SubGraphNode.data.inputData` defaults are rewritten from the old input port id to the new one across project graphs, with external graph snapshots stored in the edit command so undo/redo restores callers exactly; if the new port is already occupied, the existing new-name connection/default wins and duplicate old-name usages are discarded to preserve one incoming connection per input; `Graph Reference` / `Call Graph.inputs` object keys are intentionally not rewritten by this path
- recoverable-connection restore is therefore asymmetric in one important way: it may recreate dynamic ports whose definitions depend on the candidate connection set, but it must not revive a connection into a downstream input that is already occupied by a newer live wire, and it must not revive a connection whose fixed opposite-end port no longer exists
- that recoverable-connection pool is UI/session state, not project data: graph-history clearing and node deletion clear the relevant entries, while [`packages/app/src/commands/editNodeWithConnectionsCommand.ts`](../packages/app/src/commands/editNodeWithConnectionsCommand.ts) is authoritative about its explicit `nextConnections` and therefore clears that node's pooled recoverable connections on apply/redo and restores the previous pooled entry on undo
- remembered node-editor code viewport heights live in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) as app-level UI state keyed by `node.type`, not in project data and not per node instance or field
- remembered left-sidebar width lives in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) as `leftSidebarWidthState`; `leftSidebarLiveWidthState` mirrors the drag-in-progress width for layout consumers without persisting every pointer move. Both are app presentation state for the graph-list rail, not project data
- app-wide UI font size lives in [`packages/app/src/state/ui.ts`](../packages/app/src/state/ui.ts) as `uiFontSizeState`, persisted under the UI storage namespace rather than in project data or core runtime settings. [`packages/app/src/utils/uiFontSize.ts`](../packages/app/src/utils/uiFontSize.ts) clamps the `14px`-`20px` base-size slider and derives semantic CSS variables such as `--ui-font-size-sm`, `--ui-font-size-base`, `--ui-font-size-2xl`, and `--ui-font-scale`; [`RivetApp`](../packages/app/src/components/RivetApp.tsx) applies those variables to both the app shell and `document.documentElement`, while [`packages/app/src/index.css`](../packages/app/src/index.css) makes `body`, native controls, react-select/Atlaskit dropdown text, common Atlaskit form surfaces, and Atlaskit typography tokens consume those variables so portal-rendered modals, workspace navigation, action-bar buttons, settings-modal buttons, and one-line node-setting inputs scale with the same UI setting. Shared button radii also live there as `--ui-button-radius` and `--ui-button-radius-sm`, and custom app buttons should use those tokens instead of fixed radii. Atlaskit button-style controls are bridged through `--ds-border-radius` / `--ds-border-radius-100` so primary buttons such as node-editor `Add` buttons use the same scaled squircle corners instead of Atlaskit's smaller default radius, and `--ds-text-inverse` is pinned to white so brand/primary blue buttons keep readable text. Node card squircle radius uses `--ui-font-scale` through `--node-card-radius` in [`packages/app/src/components/nodeStyles.ts`](../packages/app/src/components/nodeStyles.ts), and split-mode ghost-card offsets/heights scale with it so stacked-node corners stay visually proportional. Node-header icon controls, the delayed running indicator, the split-run summary dimensions, in-canvas node-output action buttons, and fullscreen node-output toolbar controls in [`FullscreenNodeOutputToolbar`](../packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx) scale from `--ui-font-scale` so header/output controls do not stay visually tiny at larger UI sizes. Foldable node-editor section headers in [`EditorGroup`](../packages/app/src/components/editors/EditorGroup.tsx) and collapsible AI-assist editors in [`AiAssistEditorBase`](../packages/app/src/components/editors/custom/AiAssistEditorBase.tsx) also scale their vertical padding, chevron hit boxes, and corner radii from `--ui-font-scale`; adding new collapsible settings surfaces should follow that pattern instead of hard-coding 8px/24px header metrics.
- the UI font-size setting controls Rivet presentation text, font-size-driven icon glyphs, and Atlaskit switcher controls wrapped by [`packages/app/src/components/ScalableToggle.tsx`](../packages/app/src/components/ScalableToggle.tsx), including shared labeled switchers from [`packages/app/src/components/LabeledToggle.tsx`](../packages/app/src/components/LabeledToggle.tsx). `ScalableToggle` owns the scaled check/`×` glyphs and their visual weight for every app-side switcher so node settings and app settings cannot drift apart. This intentionally does not change explicit content typography such as Comment node text-size choices or the separate code/multiline editor font-size controls
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
- the shared `StringListEditor` also owns the small interaction rules for that UI: newly added rows autofocus their text field, definitions can provide `newItemDefault` for new rows, and reorder handles stay hidden for single-row lists so non-reorderable states do not show dead drag affordances
- connector-preserving list edits flow through [`packages/app/src/domain/graphEditing/stringListPortBinding.ts`](../packages/app/src/domain/graphEditing/stringListPortBinding.ts) plus [`packages/app/src/commands/editNodeWithConnectionsCommand.ts`](../packages/app/src/commands/editNodeWithConnectionsCommand.ts), so the editor UI can reorder/rename rows without scattering node-specific connection-remap code
- `Code` node port ids stay value-derived because the node's runtime API is name-based (`inputs.foo` / returned output keys), while `Destructure` and `Match` use stored stable output ids so reorder/rename can preserve connector identity independently from the displayed row order
- `Destructure` path rows use `newItemDefault: '$.'`, so the shared add button starts new JSONPath entries at the JSONPath root without changing existing saved paths
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
- fullscreen header controls for expanded node output now render through [`packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx`](../packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx), which stays presentational. [`NodeOutput`](../packages/app/src/components/NodeOutput.tsx) owns the sticky-header elevation state: controls are flat against the modal surface at the top of the output, then regain the stronger border/background/shadow only after output content scrolls underneath them. The sticky header measures its real resting offset in the modal scroll container and reuses that value as its `top` inset so it does not jump upward when it starts floating over scrolled content.
- fullscreen Markdown rendering keeps Rivet's existing `marked` conversion path but opts rendered string values into the `github-markdown-css` dark-dimmed `.markdown-body` presentation class through [`packages/app/src/components/renderDataValue/createScalarRenderers.tsx`](../packages/app/src/components/renderDataValue/createScalarRenderers.tsx). The app-level overrides live in [`packages/app/src/index.css`](../packages/app/src/index.css) and only neutralize container-specific details such as background handling; raw/plain output and compact previews must not receive GitHub Markdown prose styling.
- chat output intentionally removes the generic `pre-wrap` wrapper when Markdown mode is enabled so GitHub Markdown table, list, paragraph, and code-block spacing can apply normally in fullscreen output
- fullscreen node output uses opt-in horizontal resizing on [`packages/app/src/components/FullScreenModal.tsx`](../packages/app/src/components/FullScreenModal.tsx); users drag the modal shell's left/right edges, and the app-wide edge bounds are stored as percentages in `fullscreenOutputModalBoundsState`, with clamp math isolated in [`packages/app/src/utils/fullScreenModalBounds.ts`](../packages/app/src/utils/fullScreenModalBounds.ts)
- output body selection lives in [`packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx`](../packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx)
- `Expression`, `JS Filter`, `JS Map`, and `Extract Object Path` are the current exceptions to the generic error short-circuit in `NodeOutput`: their custom output renderers still run on failed executions so the red error view can include source-debug sections such as `Parsed expression` when interpolation-created input ports exist
- shared structured-output presentation now lives in [`packages/app/src/components/nodes/StructuredNodeOutput.tsx`](../packages/app/src/components/nodes/StructuredNodeOutput.tsx). That file owns only the stable shell pieces: optional error text, labeled sections, and the colorized parsed-source block. Node-specific renderers still own result labels, output ids, render-mode choices, and the policy for whether a parsed-source section should exist.
- split-output ordering is shared through [`packages/app/src/components/nodeOutput/splitOutputEntries.ts`](../packages/app/src/components/nodeOutput/splitOutputEntries.ts); both generic node output rendering and custom structured renderers should sort split indexes numerically so split run output `10` does not render before `2`
- custom structured-output renderers should treat `data.status.type === 'error'` as the failure boundary. The displayed error string is presentation data and may be empty, so it must not be used as the boolean that decides whether success sections render.
- `Code` node failures also use the shared structured-output shell for their error and `Error location` sections, but the Code node remains responsible for error-location parsing and editor-line highlighting policy.
- source-display policy helpers such as [`packages/app/src/components/nodes/parsedSourceDisplayUtils.ts`](../packages/app/src/components/nodes/parsedSourceDisplayUtils.ts) only decide whether a debug source section should be shown and must not perform runtime interpolation
- copy-button side effects for node output live in [`packages/app/src/components/nodeOutput/nodeOutputCopyActions.ts`](../packages/app/src/components/nodeOutput/nodeOutputCopyActions.ts)
- fullscreen output search state, hotkey interception, provider registration, and active-match orchestration live in [`packages/app/src/components/nodeOutput/useFullscreenOutputSearch.ts`](../packages/app/src/components/nodeOutput/useFullscreenOutputSearch.ts), which uses a single two-phase layout pass so navigation can retarget the active match without rebuilding all highlights on every step. The toolbar should only render match navigation when matches exist, ordered as previous button, `current / total`, next button immediately after the search input.
- fullscreen output search block construction, provider constants, DOM traversal, highlight application, and match projection now live together in [`packages/app/src/components/nodeOutput/fullscreenOutputSearch.ts`](../packages/app/src/components/nodeOutput/fullscreenOutputSearch.ts)
- [`packages/app/src/components/RenderDataValue.tsx`](../packages/app/src/components/RenderDataValue.tsx) is narrower and delegates renderer-specific work
- scalar/type renderer setup lives in [`packages/app/src/components/renderDataValue/createScalarRenderers.tsx`](../packages/app/src/components/renderDataValue/createScalarRenderers.tsx)
- full data-type dispatch now lives in [`packages/app/src/components/renderDataValue/createDataValueRendererMap.tsx`](../packages/app/src/components/renderDataValue/createDataValueRendererMap.tsx)
- array-like outputs render through the shared multi-output styles in [`packages/app/src/components/renderDataValue/renderDataValueStyles.ts`](../packages/app/src/components/renderDataValue/renderDataValueStyles.ts): the renderer shows an `N item(s)` count and each item gets a CSS left rail via `::before` rather than literal pipe characters or horizontal dividers. List-item hover feedback is also owned by this shared style so compact node output and fullscreen output stay visually consistent. This is intentionally data-type-agnostic, so specialized arrays such as `chat-message[]` from LLM nodes must not fork back to old divider-based list styling.
- assistant chat-message rendering must only show the `Function Call(s)` section when the message carries a real function-call payload; empty `function_calls: []` values from LLM providers are treated the same as no function calls.
- chat-part rendering lives in [`packages/app/src/components/renderDataValue/RenderChatMessagePart.tsx`](../packages/app/src/components/renderDataValue/RenderChatMessagePart.tsx)
- shared output-rendering styles live in [`packages/app/src/components/renderDataValue/renderDataValueStyles.ts`](../packages/app/src/components/renderDataValue/renderDataValueStyles.ts); generic output-port labels and structured-output section labels use the same small `--primary` header color in compact node output and fullscreen output, with group spacing owned by the shared renderer rather than node-card-only CSS
- theme variables are global as well as app-scoped: [`packages/app/src/components/RivetApp.tsx`](../packages/app/src/components/RivetApp.tsx) mirrors the current `theme-*` class onto `document.documentElement`, and [`packages/app/src/colors.css`](../packages/app/src/colors.css) exposes the same theme variables from `:root.theme-*` so portal content such as fullscreen output resolves the same colors as the canvas subtree

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

### Hosted/wrapper embedding seam

Hosted applications that embed Rivet's editor from source should treat their
local `rivet/` checkout as the source of truth and import the host seam directly
from that checkout instead of depending on public npm packages. For a wrapper
repo that vendors Rivet at `wrapper-repo/rivet`, the intended shape is:

```ts
import { RivetAppHost } from '../rivet/packages/app/src/host';
import '../rivet/packages/app/src/host.css';
```

[`packages/app/src/host.tsx`](../packages/app/src/host.tsx) is the stable
source-level wrapper seam for external hosts. Wrappers should render it instead
of [`RivetApp`](../packages/app/src/components/RivetApp.tsx) directly:

- it creates or accepts a React Query `QueryClient`
- it wraps the editor in `ProvidersProvider` and `ExecutorSessionProvider`
- it runs the same async storage bootstrap as the desktop app through
  `RivetAppLoader`
- it accepts optional `providers` for custom IO, dataset, audio, data-ref,
  environment-variable, storage, and path-policy adapters
- a custom `providers.storage` backend is applied before storage-backed atoms
  initialize; omitting it uses Rivet's built-in IndexedDB/memory backend rather
  than carrying a previous hosted backend across remounts
- it accepts an optional `executor.internalExecutorUrl` for hosted wrappers that
  run the app executor as an already-managed websocket service instead of a
  Tauri sidecar
- it exposes first-class lifecycle callbacks: `onProjectSaved`,
  `onActiveProjectChanged`, `onOpenProjectCountChanged`, and `onOpenError`
- it can hand wrappers a stable imperative workspace handle through
  `onWorkspaceHostReady`, with `onWorkspaceHostDisposed` for cleanup
- it renders optional `children` after the app is initialized, so wrapper bridges
  can mount inside the same provider/session context

The local source host barrel also re-exports the provider/session types,
executor-session runtime factory, sidecar lifecycle helpers, storage backend
type, IO provider types, environment/path-policy provider types, and LLM Chat
custom-provider env-var discovery helper that hosted shells need to stay aligned
with current app execution behavior. This is the preferred seam for projects
such as Self-hosted Rivet; direct imports of other private app components,
direct aliasing of globals such as `ioProvider`, or old per-hook shims should be
treated as compatibility debt unless a custom embedded Rivet fork deliberately
adds a wrapper-specific extension.

Wrappers that need to drive the workspace after mount can pass
`onWorkspaceHostReady` to `RivetAppHost`, render
[`RivetWorkspaceHostBridge`](../packages/app/src/components/RivetWorkspaceHostBridge.tsx)
inside the host tree, or call
[`useRivetWorkspaceHost`](../packages/app/src/hooks/useRivetWorkspaceHost.ts)
from their own bridge component. The workspace host is a stable imperative
handle; its methods always act on the latest Rivet state after mount, so host
apps do not need to resubscribe just because project state changes. It exposes
`openProjectSnapshot`, `openProjectPath`, `closeProject`, `moveProjectPaths`,
and `replaceCurrent` so wrapper shells can coordinate their own project list or
file model without reaching into Jotai atoms. Open, replace, and close commands
return `false` when Rivet cannot complete the requested transition, including
when closing the active project would fail to load the fallback tab. Project
open and close behavior still funnels through
[`useWorkspaceTransitions`](../packages/app/src/hooks/useWorkspaceTransitions.ts)
so graph cleanup, editor-state persistence, static-data hydration, and Trivet
test-suite state remain centralized.

When `executor.internalExecutorUrl` is configured and the user selects Node
executor mode, [`useExecutorSession`](../packages/app/src/hooks/useExecutorSession.ts)
connects to that hosted executor URL directly and does not start or stop a local
sidecar. Hosted internal executor URLs must use the internal session path so UI
classification, reconnect behavior, and remote-debugger handoff match desktop
Node mode. The desktop/Tauri default remains unchanged.

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
