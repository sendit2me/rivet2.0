# Desktop App Architecture (`@ironclad/rivet-app`)

> The Rivet desktop application. A Tauri + React SPA with a custom node-based
> graph editor, dual execution backends, and plugin management.

## Tech Stack

| Technology | Version | Role |
|-----------|---------|------|
| React | 18.2 | UI framework |
| Vite | 6.1 | Build tool + dev server |
| TypeScript | 5.7 | Language |
| Tauri | 1.8 | Desktop shell (Rust) |
| Jotai | 2.11 | State management (atom-based) |
| Emotion | 11.x | CSS-in-JS styling |
| Atlaskit | various | Enterprise UI component kit |
| @dnd-kit | 6.x | Drag and drop |
| Monaco Editor | 0.44 | Code editor (in Code nodes) |
| React Window | 1.x | Virtual scrolling |
| Fuse.js | 6.6 | Fuzzy search |
| Marked | 9.x | Markdown rendering |

## Source Structure

```
packages/app/
├── src/
│   ├── App.tsx                     # Root: React Query provider + app loader
│   ├── components/                 # React components (~130 .tsx files)
│   │   ├── GraphBuilder.tsx        # Main canvas orchestrator
│   │   ├── NodeCanvas.tsx          # Grid/positioning layer
│   │   ├── VisualNode.tsx          # Individual node renderer
│   │   ├── WireLayer.tsx           # SVG connection rendering
│   │   ├── Port.tsx                # Port drag targets
│   │   ├── DraggableNode.tsx       # @dnd-kit wrapper for nodes
│   │   ├── editors/                # Node property editors (50+ specialized)
│   │   ├── dataStudio/             # Dataset management UI
│   │   ├── community/              # Template sharing features
│   │   └── trivet/                 # Test runner UI
│   ├── hooks/                      # Custom React hooks (~84 files)
│   │   ├── useGraphExecutor.ts     # Execution orchestration
│   │   ├── useLocalExecutor.ts     # Browser-based execution
│   │   ├── useRemoteExecutor.ts    # Node.js sidecar execution
│   │   ├── useProjectPlugins.ts    # Plugin loading
│   │   ├── useSaveProject.ts       # Project persistence
│   │   ├── useLoadProject.ts       # Project loading
│   │   ├── useCanvasPositioning.ts # Pan/zoom logic
│   │   ├── useDraggingNode.ts      # Node drag handling
│   │   ├── useDraggingWire.ts      # Wire drag handling
│   │   └── [many more...]
│   ├── state/                      # Jotai atom definitions (~15 files)
│   │   ├── graph.ts                # Nodes, connections, metadata (~17 atoms)
│   │   ├── graphBuilder.ts         # Canvas state, selection, dragging (~15 atoms)
│   │   ├── savedGraphs.ts          # Project data
│   │   ├── plugins.ts              # Plugin registry
│   │   ├── execution.ts            # Run state (~8 atoms)
│   │   ├── settings.ts             # User preferences (~12 atoms)
│   │   ├── ui.ts                   # Modal/overlay state
│   │   ├── dataFlow.ts             # Execution result data, process pages
│   │   ├── ai.ts                   # AI assistant state
│   │   ├── clipboard.ts            # Clipboard state
│   │   ├── community.ts            # Community template state
│   │   ├── dataStudio.ts           # Dataset management state
│   │   ├── promptDesigner.ts       # Prompt designer state
│   │   ├── trivet.ts               # Test runner state
│   │   └── userInput.ts            # User input state
│   ├── commands/                   # Undo/redo command pattern
│   │   ├── Command.ts              # Command interface + history stacks
│   │   ├── addNodeCommand.ts
│   │   ├── deleteNodeCommand.ts
│   │   ├── makeConnectionCommand.ts
│   │   ├── breakConnectionCommand.ts
│   │   ├── moveNodeCommand.ts
│   │   └── editNodeCommand.ts
│   ├── io/                         # File I/O abstraction
│   │   ├── IOProvider.ts           # Interface definition
│   │   ├── TauriIOProvider.ts      # Native file dialogs (Tauri)
│   │   ├── BrowserIOProvider.ts    # File System Access API
│   │   ├── LegacyBrowserIOProvider.ts  # Fallback
│   │   ├── BrowserDatasetProvider.ts   # Dataset CRUD for browser
│   │   ├── TauriBrowserAudioProvider.ts # Audio via Tauri
│   │   └── datasets.ts            # Dataset helpers
│   └── utils/
│       ├── tauri.ts                # Tauri helper (env vars, scoping)
│       └── globals.ts              # Singleton providers
├── src-tauri/                      # Rust backend
│   ├── src/
│   │   ├── main.rs                 # Tauri app setup + IPC commands
│   │   └── plugins.rs              # Plugin tarball extraction
│   ├── Cargo.toml                  # Rust dependencies
│   └── tauri.conf.json             # App config, permissions, build
└── vite.config.ts                  # Vite configuration
```

## Component Hierarchy

```
App.tsx (React Query provider)
  └─ RivetAppLoader (initialization, settings loading)
     └─ RivetApp (main layout)
        ├─ ProjectSelector (top navigation, project tabs)
        ├─ ActionBar (run/pause/stop buttons, executor selector)
        ├─ StatusBar (info footer)
        ├─ LeftSidebar
        │  ├─ GraphList (graph navigation)
        │  └─ ProjectPluginConfiguration
        ├─ GraphBuilder ← MAIN COMPONENT
        │  ├─ NodeCanvas (positioned container with grid background)
        │  │  ├─ DraggableNode (per node, wraps VisualNode)
        │  │  │  └─ VisualNode
        │  │  │     ├─ NodeBody (property display)
        │  │  │     ├─ NodePorts
        │  │  │     │  └─ Port (input/output drag targets)
        │  │  │     ├─ NodeOutput (execution results)
        │  │  │     └─ ResizeHandle
        │  │  └─ WireLayer (SVG canvas)
        │  │     ├─ ConditionallyRenderWire → Wire (Bezier curves)
        │  │     └─ PartialWire (in-progress drag)
        │  └─ ContextMenu (right-click node picker)
        ├─ OverlayTabs (modal content panels)
        │  ├─ PromptDesignerRenderer
        │  ├─ TrivetRenderer (test runner)
        │  ├─ ChatViewerRenderer
        │  ├─ DataStudioRenderer (datasets)
        │  ├─ PluginsOverlayRenderer
        │  └─ CommunityOverlayRenderer
        └─ SettingsModal (API keys, preferences)
```

## State Management (Jotai)

The app uses Jotai's atom-based state management. State is organized into categories:

### Graph State (`state/graph.ts`) - ~17 atoms

```typescript
graphState                   // Current NodeGraph (nodes + connections + metadata)
nodesState                   // Derived: nodes array (read/write)
connectionsState             // Derived: connections array (read/write)
nodesByIdState               // Derived: Record<NodeId, ChartNode> lookup
nodeByIdState                // atomFamily: single node by ID
nodesForConnectionState      // atomFamily: nodes at each end of connection
connectionsForNodeState      // atomFamily: all connections for a node
connectionsForSingleNodeState // Single node connection lookup
nodeInstancesState           // Node implementation instances
nodeInstanceByIdState        // atomFamily: single node impl
ioDefinitionsState           // Derived: port definitions per node
ioDefinitionsForNodeState    // atomFamily: ports for single node
nodeConstructorsState        // Node type constructors
graphMetadataState           // Graph metadata (name, description)
historicalGraphState         // Previous graph state (for diff)
isReadOnlyGraphState         // Read-only mode flag
historicalChangedNodesState  // Changed nodes since last snapshot
```

### Canvas/UI State (`state/graphBuilder.ts`) - ~15 atoms

```typescript
canvasPositionState          // { x, y, zoom } - pan and zoom
lastCanvasPositionByGraphState // Remembered positions per graph
selectedNodesState           // Set<NodeId> - currently selected
draggingNodesState           // Nodes being dragged
draggingWireState            // Wire being drawn (source port info)
isDraggingWireState          // Boolean shortcut
draggingWireClosestPortState // Nearest valid port during wire drag
editingNodeState             // Currently editing node (property panel)
pinnedNodesState             // Pinned node IDs (stay visible when zoomed out)
isPinnedState                // atomFamily: is node pinned?
searchMatchingNodeIdsState   // Search result highlights
searchingGraphState          // Is search panel open?
hoveringNodeState            // Node under cursor
lastMousePositionState       // Last known mouse position
sidebarOpenState             // Left sidebar open/closed
graphNavigationStackState    // Navigation history for subgraphs
viewingNodeChangesState      // Showing historical changes
```

### Project State (`state/savedGraphs.ts`)

```typescript
projectState             // Current project (metadata + all graphs)
loadedProjectState       // { path, loaded } - file system info
projectPluginsState      // PluginLoadSpec[] - active plugins
projectContextState      // Runtime context variables
openedProjectsState      // Multiple open projects
```

### Execution State (`state/execution.ts` + `state/dataFlow.ts`) - ~12 atoms

```typescript
// execution.ts
selectedExecutorState        // 'browser' | 'nodejs'
loadedRecordingState         // Recorded execution for playback
lastRecordingState           // Last recording path
remoteUploadAllowedState     // Allow remote upload
remoteDebuggerState          // Remote debugger connection

// dataFlow.ts
lastRunDataByNodeState       // Execution results per node
lastRunDataState             // atomFamily: per-node results
runningGraphsState           // Currently executing graph IDs
rootGraphState               // Root graph of current execution
graphRunningState            // Is a graph currently executing?
graphStartTimeState          // When execution started
graphPausedState             // Is execution paused?
selectedProcessPageNodesState // Process page selection per node
selectedProcessPageState     // atomFamily: process page for node
```

### Settings (`state/settings.ts`) - ~12 atoms

```typescript
settingsState                // API keys, timeouts, chat headers
themeState                   // UI theme (Molten/Grapefruit/Taffy)
recordExecutionsState        // Toggle execution recording
defaultExecutorState         // Default execution backend
previousDataPerNodeToKeepState // How many past runs to keep
preservePortTextCaseState    // Preserve port name casing
checkForUpdatesState         // Auto-update check toggle
skippedMaxVersionState       // Skipped version for update prompt
updateModalOpenState         // Update modal visibility
updateStatusState            // Current update status
zoomSensitivityState         // Canvas zoom sensitivity
debuggerDefaultUrlState      // Default debugger WebSocket URL
```

### Storage Pattern

```typescript
// Atoms persisted to localStorage/IndexedDB via createHybridStorage
const settingsState = atomWithStorage('settings', defaultSettings, hybridStorage);

// Derived read/write atoms
const nodesState = atom(
  (get) => get(graphState).nodes,                    // read
  (get, set, newValue) => {                          // write
    set(graphState, { ...get(graphState), nodes: newValue });
  }
);

// Family atoms for per-entity state
const nodeByIdState = atomFamily((nodeId: NodeId) =>
  atom((get) => get(nodesByIdState)[nodeId])
);
```

## Graph Editor Implementation

### Canvas Rendering

- **Grid background**: CSS gradient pattern (20px squares)
- **Positioning**: `transform: translate(x, y) scale(zoom)` on container
- **Pan**: Click-drag on empty space (mouse event handlers on `NodeCanvas`)
- **Zoom**: Mouse wheel (configurable sensitivity), stored in `canvasPositionState`
- **Center/Reset**: "Center graph" button recalculates optimal viewport

### Node Rendering (`VisualNode.tsx`)

Each node is absolutely positioned on the canvas:

```
┌──────────────────────────────────┐
│ [icon] Node Title        [pin]  │ ← Header (colored by node type)
├──────────────────────────────────┤
│ ● input-1         output-1 ●    │ ← Ports (circles for connections)
│ ● input-2         output-2 ●    │
├──────────────────────────────────┤
│ [Node body - property display]   │ ← Body (varies by node type)
├──────────────────────────────────┤
│ [Execution output / results]     │ ← Output (shown after execution)
└──────────────────────────────────┘
```

### Wire/Connection Rendering (`WireLayer.tsx`)

- **Technology**: SVG overlay on top of node canvas
- **Connections**: Bezier curves between output and input ports
- **Partial wire**: Temporary wire while dragging from a port
- **Hit detection**: `elementsFromPoint()` finds closest valid port
- **Type validation**: `isDataTypeAccepted()` checks compatibility
- **Visual feedback**: Color change on valid drop targets

### Drag & Drop

**Node dragging** (via `@dnd-kit`):
1. `DraggableNode` wraps each node with `useDraggable()`
2. Drag start → sets `draggingNodesState`
3. Drag move → updates node `visualData.x/y`
4. Drag end → commits position via `moveNodeCommand`

**Wire dragging** (custom implementation):
1. Mouse down on port → sets `draggingWireState` (source port info)
2. Mouse move → `WireLayer` draws partial wire to cursor
3. Mouse up on port → `makConnectionCommand` creates connection
4. Mouse up on empty → cancels wire drag

### Command Pattern (Undo/Redo)

All graph mutations go through commands for undo/redo support:

```typescript
interface Command<T, U> {
  type: string;
  apply(data: T, appliedData: U | undefined, currentState: GraphCommandState): U;
  undo(data: T, appliedData: U, currentState: GraphCommandState): void;
}

type GraphCommandState = {
  graph: NodeGraph;
  // ... additional state
}

// Per-graph history stacks (Jotai atoms)
commandHistoryStackStatePerGraph    // Undo stack
redoStackStatePerGraph              // Redo stack
```

**Available commands**: addNode, deleteNodes, editNode, makeConnection,
breakConnection, moveNode.

### Selection & Hotkeys

| Action | Shortcut |
|--------|----------|
| Select node | Click |
| Multi-select | Ctrl/Cmd + Click |
| Clear selection | Click empty space |
| Delete selected | Delete / Backspace |
| Copy | Cmd+C / Ctrl+C |
| Paste | Cmd+V / Ctrl+V |
| Undo | Cmd+Z / Ctrl+Z |
| Redo | Cmd+Shift+Z / Ctrl+Shift+Z |
| Search nodes | Cmd+F / Ctrl+F |
| Save | Cmd+S / Ctrl+S |
| Open | Cmd+O / Ctrl+O |

## Tauri Integration

### Rust Backend (`src-tauri/`)

The Tauri backend provides native OS capabilities:

```rust
// IPC commands exposed to frontend
#[tauri::command]
fn get_environment_variable(name: &str) -> String
// Fetches env vars (OPENAI_API_KEY, etc.)

#[tauri::command]
fn allow_data_file_scope(app_handle: AppHandle, project_file_path: &str)
// Enables file read/write for .rivet-data sibling files

#[tauri::command]
fn read_relative_project_file(relative_from: &str, project_file_path: &str)
// Loads project files relative to a base path

// Plugin support (plugins.rs)
pub fn extract_package_plugin_tarball(path: &str)
// Decompresses plugin .tar.gz archives
```

### Frontend → Tauri Communication

```typescript
// src/utils/tauri.ts
import { invoke } from '@tauri-apps/api/tauri';

export async function getEnvVar(name: string): Promise<string | undefined> {
  if (isInTauri()) {
    return (await invoke('get_environment_variable', { name })) as string;
  }
}

export async function allowDataFileNeighbor(projectFilePath: string) {
  await invoke('allow_data_file_scope', { projectFilePath });
}
```

### File I/O Adapter Pattern

```typescript
// Smart runtime detection
if (TauriIOProvider.isSupported()) {
  ioProvider = new TauriIOProvider();       // Native file dialogs
} else if (BrowserIOProvider.isSupported()) {
  ioProvider = new BrowserIOProvider();     // File System Access API
} else {
  ioProvider = new LegacyBrowserIOProvider(); // Download/upload fallback
}
```

This pattern allows the app to run as:
- A **Tauri desktop app** with native file dialogs
- A **web app** using the File System Access API (Chrome/Edge)
- A **legacy web app** with download/upload fallback

### Tauri Configuration (`tauri.conf.json`)

```json
{
  "build": {
    "devPath": "http://localhost:5173",
    "distDir": "../dist",
    "beforeBuildCommand": "yarn build",
    "beforeDevCommand": "yarn start"
  },
  "package": {
    "productName": "Rivet",
    "version": "1.11.3"
  },
  "tauri": {
    "windows": [{ "width": 1200, "height": 1024, "resizable": true }],
    "allowlist": {
      "fs": { "all": true, "scope": ["$APPLOCALDATA/**", "$TEMP/**", "**", "/**/*"] },
      "path": { "all": true },
      "dialog": { "all": true },
      "process": { "relaunch": true },
      "shell": { "sidecar": true, "open": true, "execute": true },
      "globalShortcut": { "all": true },
      "window": { "all": true },
      "http": { "all": true }
    }
  }
}
```

> **Note**: The FS scope is very permissive (`"**"`, `"/**/*"`) - this grants broad file
> system access. The shell scope allows `app-executor` sidecar, `npm`, `pnpm`, and `git`.

## Execution Architecture

### Browser Executor (`useLocalExecutor.ts`)

```typescript
async function runGraphLocally(options) {
  const processor = new GraphProcessor(project, graphId, registry);

  // Attach event handlers for UI updates
  processor.on('nodeStart', (data) => setNodeState(data.node.id, 'running'));
  processor.on('nodeFinish', (data) => setNodeState(data.node.id, 'done'));
  processor.on('nodeError', (data) => setNodeState(data.node.id, 'error'));
  processor.on('partialOutput', (data) => updateNodeOutput(data));

  const results = await processor.processGraph(context, inputs);
  setLastRunData(results);
}
```

- Runs `GraphProcessor` directly in the browser main thread
- Fast startup, no extra processes needed
- **Limitations**: No file system access, no shell commands, no native modules

### Node.js Executor (`useRemoteExecutor.ts` + app-executor sidecar)

```typescript
async function runGraphRemotely(options) {
  // Connect to sidecar via WebSocket
  const ws = new WebSocket('ws://localhost:21889/internal');

  // Send graph + project + inputs to sidecar
  ws.send(JSON.stringify({ type: 'run', project, graphId, inputs }));

  // Receive events for UI updates
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case 'nodeStart': setNodeState(data.node.id, 'running'); break;
      case 'nodeFinish': setNodeState(data.node.id, 'done'); break;
      // ...
    }
  };
}
```

- Spawns `app-executor` as a Tauri sidecar process
- WebSocket communication on `ws://localhost:21889/internal`
- Full Node.js capabilities: file I/O, shell, native modules
- Required for Code nodes using Node APIs, plugins needing system access
- Also supports remote debugging from external processes

### Execution Result Display

After execution, each node shows its output:

- **lastRunDataByNodeState**: `Record<NodeId, ProcessDataForNode[]>`
- Results displayed in the `NodeOutput` component below the node body
- Supports pagination for multiple process runs (split-run)
- Streaming partial outputs update in real-time during execution

## Project Management

### File Operations

```typescript
// Load
async function loadProject(projectInfo: OpenedProjectInfo) {
  setProject(projectInfo.project);
  setGraphData(projectInfo.project.graphs[firstGraphId]);
  // Load sibling .rivet-data file for datasets/test data
}

// Save
async function saveProject() {
  await ioProvider.saveProjectDataNoPrompt(project, { testSuites }, path);
}

// Save As
async function saveProjectAs() {
  const filePath = await ioProvider.saveProjectData(project, { testSuites });
  setLoadedProject({ path: filePath, loaded: true });
}
```

### Multi-Project Support

- `openedProjectsState` tracks multiple open projects
- Tab-like switching via `ProjectSelector` component
- Each project's canvas state cached independently
- Canvas position remembered per graph (`lastCanvasPositionByGraphState`)

## Additional Features

### Data Studio
- Upload/manage CSV/JSON datasets
- Virtual scroll table view (React Window)
- Datasets stored in `.rivet-data` sibling file

### Community Templates
- Browse/share graph templates
- Upload versioned templates
- Fork & remix community graphs

### Prompt Designer
- Visual template editor for LLM prompts
- Variable/placeholder support
- Test prompts against models

### Recording & Playback
- Toggle recording via `recordExecutionsState`
- Full execution trace saved to `.rivet-recording`
- Replay step-by-step for debugging

### Remote Debugger
- Connect to external Node.js processes
- Real-time execution tracking
- Pause/resume/inspect node state

### Trivet Integration
- Test suites stored in project
- `runTrivet()` executes test suites
- Visual test results in overlay tab
