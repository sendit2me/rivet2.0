# Core Engine (`@ironclad/rivet-core`)

> The heart of Rivet. This package contains the execution engine, type system,
> all built-in node types, serialization, and the plugin interface.
> It has **zero workspace dependencies** and runs in both browser and Node.js.

## Source Layout

```
packages/core/src/
├── index.ts                    # Re-exports from exports.ts
├── exports.ts                  # Central public API surface
├── model/                      # Core data structures & execution
│   ├── DataValue.ts            # Type system (DataType, DataValue unions)
│   ├── Project.ts              # Project, ProjectMetadata definitions
│   ├── NodeGraph.ts            # NodeGraph, connections, graph metadata
│   ├── NodeBase.ts             # ChartNode, NodeInputDefinition, NodeOutputDefinition
│   ├── NodeImpl.ts             # NodeImpl abstract class (node implementation)
│   ├── NodeRegistration.ts     # Global registry for node types
│   ├── GraphProcessor.ts       # Main execution engine (~1900 lines)
│   ├── ProcessContext.ts       # Runtime context for node execution
│   ├── ProcessEvents.ts        # 23 named + 2 dynamic event types
│   ├── RivetPlugin.ts          # Plugin interface definitions
│   ├── PluginLoadSpec.ts       # Plugin load spec types (built-in, URI, package)
│   ├── Settings.ts             # Settings type definitions
│   ├── EditorDefinition.ts     # 19 editor types for node property UIs
│   └── nodes/                  # 84 built-in node implementations
│       ├── ChatNode.ts
│       ├── TextNode.ts
│       ├── IfNode.ts
│       ├── LoopControllerNode.ts
│       ├── CodeNode.ts
│       ├── SubGraphNode.ts
│       └── ... (84 files total)
├── integrations/               # External service provider interfaces
│   ├── LLMProvider.ts          # LLM chat completion abstraction
│   ├── EmbeddingGenerator.ts   # Embedding/vector generation
│   ├── DatasetProvider.ts      # Dataset CRUD operations
│   ├── VectorDatabase.ts       # Vector DB operations
│   ├── CodeRunner.ts           # Sandboxed code execution
│   ├── AudioProvider.ts        # Audio playback/recording
│   ├── Tokenizer.ts            # Token counting
│   ├── integrations.ts         # Integration enable/disable helpers
│   ├── enableIntegrations.ts   # Integration initialization
│   ├── GptTokenizerTokenizer.ts # GPT tokenizer implementation
│   ├── mcp/                    # Model Context Protocol support
│   │   ├── MCPProvider.ts      # MCP provider interface
│   │   ├── MCPBase.ts          # MCP base utilities
│   │   └── MCPUtils.ts         # MCP helper functions
│   └── openai/
│       └── OpenAIEmbeddingGenerator.ts  # OpenAI embedding impl
├── api/                        # Public API helpers
│   ├── createProcessor.ts      # Main API: coreCreateProcessor(), coreRunGraph()
│   ├── streaming.ts            # Event stream filtering & SSE
│   └── looseDataValue.ts       # Type coercion for user-friendly API
├── utils/
│   └── serialization/          # Versioned project serialization
│       ├── serialization.ts    # Version detection & dispatch
│       ├── serialization_v1.ts # Legacy format
│       ├── serialization_v2.ts
│       ├── serialization_v3.ts
│       └── serialization_v4.ts # Current format
├── native/                     # Platform-specific implementations
│   ├── nodeNativeApi.ts        # Node.js file I/O, shell access
│   └── browserNativeApi.ts     # Browser fallback
└── recording/                  # Execution recording & playback
```

## Type System (`DataValue.ts`)

Rivet has a rich, type-safe data type system. Every value flowing through a graph wire
is a `DataValue` - a tagged union with a `type` discriminator and a `value` payload.

### Scalar Types (17 types)

| Type | TypeScript Value | Description |
|------|-----------------|-------------|
| `string` | `string` | Text data |
| `number` | `number` | Numeric data |
| `boolean` | `boolean` | True/false |
| `date` | `string` | Date string |
| `time` | `string` | Time string |
| `datetime` | `string` | DateTime string |
| `chat-message` | `ChatMessage` | LLM message (system/user/assistant/function) |
| `control-flow-excluded` | `undefined \| 'loop-not-broken'` | Control flow marker |
| `object` | `Record<string, unknown>` | JSON object |
| `any` | `unknown` | Untyped data |
| `gpt-function` | `{ name, description, parameters, strict? }` | Tool definition |
| `vector` | `number[]` | Embedding vector |
| `image` | `{ data: Uint8Array, mediaType }` | Image binary |
| `binary` | `Uint8Array` | Raw bytes |
| `audio` | `{ data: Uint8Array, ... }` | Audio binary |
| `document` | `{ ... }` | Document with citations |
| `graph-reference` | `{ graphId, graphName }` | Dynamic graph pointer |

> **Note**: There are exactly **17 scalar types** (not 18). The `scalarTypes` tuple
> in `DataValue.ts` is exhaustively checked at compile time.

### Composite Types

- **Arrays**: `string[]`, `number[]`, `chat-message[]`, etc. - Array of any scalar type
- **Functions**: `fn<string>`, `fn<number[]>`, etc. - Lazy/deferred values evaluated on demand

### Key Type Utilities

```typescript
// Type definition
type DataValue = ScalarDataValue | ArrayDataValues | FunctionDataValues;

// Type guards
isScalarDataValue(value: DataValue): boolean
isArrayDataValue(value: DataValue): boolean
isFunctionDataValue(value: DataValue): boolean

// Conversions
unwrapDataValue(value: DataValue): ScalarOrArrayDataValue   // Evaluate lazy fns
arrayizeDataValue(value: DataValue): ArrayDataValue          // Scalar → array
getScalarTypeOf(type: DataType): ScalarDataType              // Extract base type
getDefaultValue<T>(type: T): DataValueByType[T]              // Default for type

// Coercion (for user-friendly API)
type LooseDataValue = DataValue | string | number | boolean | unknown[] | Record<string, unknown>
looseDataValuesToDataValues(input: Record<string, LooseDataValue>): Record<string, DataValue>
```

### Opaque ID Types (type safety)

```typescript
type NodeId = Opaque<string, 'NodeId'>       // Unique within a graph
type PortId = Opaque<string, 'PortId'>       // Unique within a node
type GraphId = Opaque<string, 'GraphId'>     // Unique within a project
type ProjectId = Opaque<string, 'ProjectId'> // Unique project ID
type ProcessId = Opaque<string, 'ProcessId'> // Unique per execution run
```

## Node System

### ChartNode (Data Model)

Every node in a graph is represented by a `ChartNode`:

```typescript
interface NodeBase {
  type: string                    // Node type identifier (e.g., 'chat', 'text', 'if')
  id: NodeId                     // Unique ID within the graph
  title: string                  // Display name
  description?: string           // User annotation
  data: unknown                  // Node-type-specific configuration

  // Execution modifiers
  disabled?: boolean             // Skip this node entirely
  isConditional?: boolean        // Expose an 'if' input port
  isSplitRun?: boolean           // Run node once per array element (parallel)
  isSplitSequential?: boolean    // Run node once per array element (sequential)
  splitRunMax?: number           // Max parallel split-runs

  // Visual properties
  visualData: {
    x: number; y: number         // Canvas position
    width?: number               // Node width
    color?: { border, bg }       // Custom colors
    zIndex?: number              // Layer ordering
  }

  // Advanced
  variants?: ChartNodeVariant[]  // Alternative configurations
  tests?: NodeTestGroup[]        // Inline test specs
}

type ChartNode<Type, Data> = NodeBase & { type: Type; data: Data }
```

### Node Input/Output Definitions

```typescript
interface NodeInputDefinition {
  id: PortId                      // Port identifier
  title: string                   // Display label
  dataType: DataType | DataType[] // Accepted type(s)
  required?: boolean              // Must be connected
  defaultValue?: unknown          // Fallback value
  coerced?: boolean               // Auto type conversion
  description?: string            // Tooltip
}

interface NodeOutputDefinition {
  id: PortId
  title: string
  dataType: DataType | DataType[]
  description?: string
}

// Special built-in port for conditional execution
const IF_PORT = {
  id: '$if' as PortId,
  title: 'if',
  dataType: 'boolean',
  defaultValue: 'false'
}
```

### NodeImpl (Implementation Interface)

```typescript
abstract class NodeImpl<T extends ChartNode> {
  readonly chartNode: T           // The node data
  get id(): NodeId
  get type(): string
  get title(): string
  get visualData(): NodeBase['visualData']
  get data(): T['data']          // Typed access to node config

  // Required overrides
  abstract getInputDefinitions(
    connections: NodeConnection[],
    nodes: Record<NodeId, ChartNode>,
    project: Project,
    referencedProjects: Record<ProjectId, Project>,  // Cross-project support
  ): NodeInputDefinition[]

  abstract getOutputDefinitions(
    connections: NodeConnection[],
    nodes: Record<NodeId, ChartNode>,
    project: Project,
    referencedProjects: Record<ProjectId, Project>,
  ): NodeOutputDefinition[]

  abstract process(inputData: Inputs, context: InternalProcessContext): Promise<Outputs>

  // Auto-adds IF_PORT when node.isConditional is true
  getInputDefinitionsIncludingBuiltIn(...): NodeInputDefinition[]

  // UI (for app rendering)
  abstract getEditors(context: RivetUIContext): EditorDefinition<T>[] | Promise<EditorDefinition<T>[]>
  abstract getBody(context: RivetUIContext): NodeBody | Promise<NodeBody>
  static getUIData(context: RivetUIContext): NodeUIData
  static create(): T
}
```

### Node Connections

```typescript
interface NodeConnection {
  outputNodeId: NodeId    // Source node
  inputNodeId: NodeId     // Target node
  outputId: PortId        // Source port
  inputId: PortId         // Target port
}
```

### Built-in Node Categories (84 nodes)

**I/O & Primitives**: Text, Number, Boolean, Object, Array, Image, Audio, Document, User Input, Prompt

**LLM & AI**: Chat, ChatLoop, GPT Function/Tool, Get Embedding, Delegate Function Call, Assemble Prompt, Assemble Message

**Data Extraction**: Extract JSON, Extract Regex, Extract YAML, Extract Object Path, Extract Markdown Code Blocks

**Logic & Control Flow**: If, IfElse, Match, Loop Controller, Loop Until, Race Inputs, Coalesce, Pop (circuit breaker)

**Graph Composition**: Graph Input, Graph Output, SubGraph, CallGraph, Graph Reference, List Graphs

**Data Processing**: Chunk, Split, Slice, Join, Filter, Shuffle, Destructure, Passthrough, To JSON/YAML/Markdown Table/Tree, Context Node, Hash, Compare, Evaluate, Trim Chat Messages

**Datasets & Vectors**: Create Dataset, Load Dataset, Append/Replace/Get Dataset Row, Get All Datasets, Dataset Nearest Neighbors, Vector Store, Vector Nearest Neighbors

**State & Events**: Set/Get Global, Raise Event, Wait For Event

**File I/O**: Read File, Read Directory, Read All Files

**Advanced**: Code (arbitrary JS), HTTP Call, External Call, Abort Graph, Delay, Cron, Comment, Random Number, URL Reference, Play Audio, Referenced Graph Alias

**MCP (Model Context Protocol)**: MCP Discovery, MCP Tool Call, MCP Get Prompt

### Node Registration

```typescript
class NodeRegistration<NodeTypes, Nodes> {
  register(definition: NodeDefinition<T>): NodeRegistration
  registerPluginNode(definition: PluginNodeDefinition<T>, plugin: RivetPlugin): NodeRegistration
  registerPlugin(plugin: RivetPlugin): void

  create(type: NodeTypes): ChartNode          // Factory
  createImpl(node: ChartNode): NodeImpl       // Implementation factory
  getDisplayName(type: NodeTypes): string
  isRegistered(type: NodeTypes): boolean
  getNodeTypes(): NodeTypes[]
  getPlugins(): RivetPlugin[]
}

// Singleton - all built-in nodes pre-registered
export const globalRivetNodeRegistry = registerBuiltInNodes(new NodeRegistration())
```

## Graph Model

### Project

```typescript
type Project = {
  metadata: ProjectMetadata
  plugins?: PluginLoadSpec[]                    // Plugin load specs
  graphs: Record<GraphId, NodeGraph>           // All graphs
  data?: Record<DataId, string>                // Large data blobs
  references?: ProjectReference[]              // Cross-project refs
}

type ProjectMetadata = {
  id: ProjectId
  title: string
  description: string
  mainGraphId?: GraphId                        // Entry point graph
  path?: string                                // File system path
  mcpServer?: MCP.Config                       // MCP server config
}
```

### NodeGraph

```typescript
interface NodeGraph {
  metadata?: {
    id?: GraphId
    name?: string
    description?: string
    attachedData?: AttachedData                // UI-only state
  }
  nodes: ChartNode[]                           // All nodes in graph
  connections: NodeConnection[]                // All edges
}
```

## Execution Engine (`GraphProcessor`)

The `GraphProcessor` class (~1900 lines) is the core of Rivet. It executes a graph by
topologically processing nodes, resolving dependencies, and managing control flow.

### Public API

```typescript
class GraphProcessor {
  constructor(project: Project, graphId?: GraphId,
              registry?: NodeRegistration, includeTrace?: boolean)

  // Main execution
  async processGraph(
    context: ProcessContext,
    inputs?: Record<string, DataValue>,
    contextValues?: Record<string, DataValue>
  ): Promise<GraphOutputs>

  // Control
  async abort(successful?: boolean, error?: Error | string): void
  pause(): void
  resume(): void

  // Events (Emittery-based)
  on<K extends keyof ProcessEvents>(event: K, handler): void
  async *events(): AsyncGenerator<ProcessEvent>

  // User interaction
  onUserEvent(eventName: string, listener): void
  userInput(nodeId: NodeId, values: StringArrayDataValue): void

  // Extension
  setExternalFunction(name: string, fn: ExternalFunction): void
  preloadNodeData(nodeId: NodeId, data: Outputs): void
  getDependencyNodesDeep(nodeId: NodeId): NodeId[]

  // Recording
  async replayRecording(recorder: ExecutionRecorder): Promise<GraphOutputs>

  // Properties
  get isRunning(): boolean
  slowMode: boolean                    // 250ms delays between nodes (testing)
  runToNodeIds?: NodeId[]              // Run only up to these nodes
  runFromNodeId?: NodeId               // Run starting from this node
  recordingPlaybackChatLatency: number // Simulated latency for recording playback
  warnOnInvalidGraph: boolean          // Warn instead of error on invalid graph
}
```

### Execution Flow

```
1. INITIALIZATION (#initProcessState)
   ├── Create node instances from registry
   ├── Build connection lookup tables (input→output, output→input)
   ├── Load & validate all input/output definitions
   ├── Compute strongly connected components (Tarjan's SCC for cycle detection)
   └── Initialize per-node execution state maps

2. START
   ├── Emit 'start' and 'graphStart' events
   ├── Identify start nodes (nodes with no input dependencies)
   └── Queue start nodes for processing

3. DEPENDENCY RESOLUTION (#fetchNodeDataAndProcessNode)
   ├── For each queued node:
   │   ├── Recursively fetch all input dependencies
   │   ├── Wait for upstream nodes to complete
   │   └── Collect input DataValues from connected output ports
   └── Once all inputs ready → process node

4. NODE PROCESSING (#processNode)
   ├── Resolve conditional port ('if' check)
   ├── Handle split-run (one execution per array element)
   ├── Instantiate NodeImpl
   ├── Emit 'nodeStart' event
   ├── Call NodeImpl.process(inputs, context) → outputs
   ├── Emit 'nodeFinish' event
   ├── Store outputs
   └── Queue dependent nodes

5. CONTROL FLOW
   ├── Loops: LoopController tracks iterations, clears loop body, re-queues
   ├── Conditionals: If/IfElse emit 'control-flow-excluded' to skip branches
   ├── Races: RaceInputs completes when first input resolves, aborts others
   ├── Exclusion: 'control-flow-excluded' values propagate downstream
   └── Abort: AbortGraph node terminates the entire execution

6. COMPLETION
   ├── Collect GraphOutput node values → final result
   ├── Emit 'graphFinish', 'done', 'finish' events
   └── Return Record<string, DataValue>
```

### Concurrency Model

- Uses `p-queue` with effectively infinite concurrency (nodes run as soon as inputs are ready)
- Execution is **dataflow-driven**: nodes fire when all inputs are available
- `isSplitRun` enables data parallelism (one node instance per array element)
- `isSplitSequential` enforces sequential processing of array elements
- `splitRunMax` caps maximum parallel split-run instances

### Error Handling

- **Per-node errors**: A node failure doesn't abort the whole graph
- **Error propagation**: Failed nodes block their dependents
- **Error recovery**: Nodes with `useErrorOutput` can catch errors and continue
- **AggregateError**: Multiple node failures collected into final error

### ProcessContext

The runtime environment provided to every node during execution:

```typescript
type ProcessContext = {
  settings: Settings                    // API keys, timeouts, headers
  nativeApi?: NativeApi                 // File I/O, shell access
  datasetProvider?: DatasetProvider     // Dataset CRUD
  mcpProvider?: MCPProvider             // MCP integration
  audioProvider?: AudioProvider         // Audio playback
  tokenizer?: Tokenizer                 // Token counting
  codeRunner?: CodeRunner              // Sandboxed code execution
  projectReferenceLoader?: ProjectReferenceLoader
  projectPath?: string
}

// Internal (extended context passed to NodeImpl.process)
type InternalProcessContext = ProcessContext & {
  executor: 'nodejs' | 'browser'
  project: Project
  referencedProjects: Record<ProjectId, Project>  // Cross-project refs
  signal: AbortSignal                   // Cancellation
  processId: ProcessId
  contextValues: Record<string, DataValue>
  graphInputs: Record<string, DataValue>       // Inputs to current graph
  graphOutputs: Record<string, DataValue>      // Outputs from current graph
  graphInputNodeValues: Record<string, DataValue>  // Raw input node values
  tokenizer: Tokenizer                 // Required (not optional)
  node: ChartNode                      // Current node being processed
  attachedData: AttachedNodeData       // Transient per-node execution data

  // Inter-node communication
  raiseEvent(name: string, data?: DataValue): void
  waitEvent(name: string): Promise<DataValue | undefined>

  // Global state (shared across all nodes and subgraphs)
  getGlobal(id: string): ScalarOrArrayDataValue | undefined
  setGlobal(id: string, value: ScalarOrArrayDataValue): void
  waitForGlobal(id: string): Promise<ScalarOrArrayDataValue>

  // Subgraph execution
  createSubProcessor(graphId?: GraphId, opts?): GraphProcessor

  // Streaming
  onPartialOutputs?(outputs: Outputs): void

  // Extension
  externalFunctions: Record<string, ExternalFunction>
  executionCache: Map<string, unknown>  // Per-execution cache
  getPluginConfig(name: string): string | undefined
  codeRunner: CodeRunner               // Required (not optional)
  trace(message: string): void         // Emit trace message
  abortGraph(error?: Error | string): void  // Abort current graph
  requestUserInput(inputs: string[], renderingType: string): Promise<StringArrayDataValue>
}
```

### Event System (25+ event types)

```typescript
type ProcessEvents = {
  // Lifecycle
  start: { project, startGraph, inputs, contextValues }
  graphStart: { graph, inputs }
  graphFinish: { graph, outputs }
  graphError: { graph, error }
  graphAbort: { successful, graph, error? }
  done: { results }
  finish: void
  error: { error }

  // Node lifecycle
  nodeStart: { node, inputs, processId }
  nodeFinish: { node, outputs, processId }
  nodeError: { node, error, processId }
  nodeExcluded: { node, processId, inputs, outputs, reason }
  nodeOutputsCleared: { node, processId? }

  // Streaming
  partialOutput: { node, outputs, index, processId }

  // User interaction
  userInput: { node, inputStrings, callback, processId, renderingType }

  // Control
  pause: void
  resume: void
  trace: string

  // State
  globalSet: { id, value, processId }
  newAbortController: AbortController
  'userEvent:${string}': DataValue | undefined
  'globalSet:${string}': ScalarOrArrayDataValue | undefined
}
```

## Public API (`createProcessor.ts`)

The main entry points for running graphs programmatically:

```typescript
// Full control: create processor, attach events, then run
function coreCreateProcessor(project: Project, options: RunGraphOptions) {
  return {
    processor: GraphProcessor,
    inputs: DataValue[],
    contextValues: DataValue[],
    getEvents(spec): AsyncGenerator<RivetEventStreamEventInfo>,
    getSSEStream(spec): ReadableStream<Uint8Array>,
    streamNode(nodeIdOrTitle): AsyncGenerator<Outputs>,
    async run(): Promise<Record<string, DataValue>>
  }
}

// Simple: just run and get results
async function coreRunGraph(
  project: Project,
  options: RunGraphOptions
): Promise<Record<string, DataValue>>
```

### RunGraphOptions

```typescript
type RunGraphOptions = {
  graph?: string                          // Graph ID or name
  inputs?: Record<string, LooseDataValue>
  context?: Record<string, LooseDataValue>

  // Providers
  nativeApi?: NativeApi
  datasetProvider?: DatasetProvider
  audioProvider?: AudioProvider
  mcpProvider?: MCPProvider
  tokenizer?: Tokenizer
  codeRunner?: CodeRunner

  // Extension
  externalFunctions?: Record<string, ExternalFunction>
  onUserEvent?: Record<string, (data: DataValue) => void>
  abortSignal?: AbortSignal
  registry?: NodeRegistration

  // Settings
  openAiKey?: string
  openAiOrganization?: string
  openAiEndpoint?: string
  pluginEnv?: Record<string, string>
  pluginSettings?: Record<string, any>

  // Event handlers
  onStart?, onNodeStart?, onNodeFinish?, onNodeError?,
  onDone?, onTrace?, onPartialOutput?, ...
}
```

## Serialization

Projects are serialized to JSON with versioned formats (v1-v4):

```typescript
// Deserialize (auto-detects version)
function deserializeProject(content: string): [Project, AttachedData]
function loadProjectFromString(content: string): Project

// Serialize
function serializeProject(project: Project, attachedData?: AttachedData): string
```

The serialization system handles backward compatibility automatically. Version detection
examines the JSON structure to determine which deserializer to use.

## Key Architectural Patterns

### 1. Control Flow via Data Types
Instead of explicit control flow wires, Rivet uses a special `control-flow-excluded`
data type that propagates through the graph to mark excluded branches.

### 2. Lazy Evaluation with Function DataValues
`fn<T>` data values wrap computations that are only evaluated when consumed.
This enables deferred/on-demand processing.

### 3. Composition over Inheritance
Nodes are composed from data (`ChartNode`) + implementation (`NodeImpl`), registered
in a type-safe registry rather than using class hierarchies.

### 4. Strongly Connected Components for Cycle Handling
Tarjan's SCC algorithm detects cycles in the graph. Loops must use the explicit
`LoopController` node - cycles in the graph structure are errors.

### 5. Event-Driven Architecture
The processor uses Emittery for async event emission, supporting both direct
event handlers and async generator-based event streaming.
