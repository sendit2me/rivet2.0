# Core Engine (`@ironclad/rivet-core`)

> Detailed internal reference for the shared runtime package.

## Purpose

`@ironclad/rivet-core` is the foundational package in the repo.

It owns:

- graph/project/node types
- the `DataValue` type system
- the execution engine
- node registration and built-in nodes
- built-in provider plugins
- runtime integration contracts
- serialization/deserialization
- recording/playback support
- public programmatic execution APIs

Every other runtime-oriented package in the monorepo builds on this package.

## Source Layout

```text
packages/core/src/
  api/           High-level APIs for processor creation and event streaming
  integrations/  Interfaces and implementations for LLMs, datasets, MCP, code runner, etc.
  model/         Graph model, processor, node contracts, plugin contracts, registration
  native/        Browser/node native API abstractions
  plugins/       Built-in provider/integration plugins
  recording/     Execution recording and playback support
  utils/         Serialization and shared helpers
  vendor/        Vendored support code
  exports.ts     Public export surface
  index.ts       Top-level entry
  plugins.ts     Built-in plugin export map
```

Important architectural note:

- built-in capabilities are split between `model/nodes` and `plugins/`
- not every feature node comes from the same registration path

## Public API Surface

The published export surface is defined by [`packages/core/src/exports.ts`](../packages/core/src/exports.ts).

That file re-exports:

- model types and runtime contracts
- the graph processor
- built-in nodes
- plugins
- integration interfaces
- recording APIs
- execution streaming APIs
- create/run processor helpers

For refactors, `exports.ts` is the API contract that downstream packages rely on.

## Graph Model

Core graph model types live in `model/`.

Key concepts:

- `Project`
- `NodeGraph`
- `ChartNode`
- `NodeConnection`
- `GraphId`, `NodeId`, `PortId`, `ProcessId`

Projects currently include:

- metadata
- graph map
- optional plugin load specs
- optional project references
- optional metadata path

Graphs include:

- graph metadata
- node list
- connection list

## Data Type System

The type system lives in [`DataValue.ts`](../packages/core/src/model/DataValue.ts).

### Scalar value families

Current scalar types include:

- `any`
- `boolean`
- `string`
- `number`
- `date`
- `time`
- `datetime`
- `chat-message`
- `control-flow-excluded`
- `object`
- `gpt-function`
- `vector`
- `image`
- `binary`
- `audio`
- `graph-reference`
- `document`

### Composite value families

The type system also supports:

- array variants of scalar values
- lazy `fn<...>` variants for deferred evaluation

### Key helpers

Important utilities defined in `DataValue.ts`:

- `isScalarDataValue`
- `isArrayDataValue`
- `isFunctionDataValue`
- `getScalarTypeOf`
- `unwrapDataValue`
- `arrayizeDataValue`
- `getDefaultValue`

### Architectural significance

This type system is not just validation metadata. It is used directly in:

- port compatibility
- default-value generation
- split-run behavior
- lazy/deferred execution
- control-flow propagation
- output rendering and serialization

The `control-flow-excluded` type in particular is a core execution mechanism, not just a marker type.

## Node System

There are three main node-related concepts:

1. `ChartNode`: serialized data model for a node in a graph
2. `NodeImpl`: class-based execution/UI contract used by built-in nodes
3. `PluginNodeImpl`: object-based execution/UI contract used by plugin nodes

### Built-in nodes

Built-in node registration is centered in [`Nodes.ts`](../packages/core/src/model/Nodes.ts).

The current built-in node list is registered through `registerBuiltInNodes(...)`, which populates:

- `globalRivetNodeRegistry`
- built-in node constructors
- built-in node type union information

The repo currently has 84 files under `packages/core/src/model/nodes`.

### Plugin nodes

Plugin nodes are registered through `NodeRegistration.registerPluginNode(...)`.

They are wrapped into a generated `PluginNodeImplClass` so they can participate in the same runtime paths as built-in nodes.

### Node UI contracts

Core also defines UI-facing contracts used by the app:

- `EditorDefinition`
- `NodeBody`
- `NodeBodySpec`
- `NodeUIData`

That is why core is not purely headless business logic. It also carries enough metadata for the editor to render and edit nodes.

## Node Registration

[`NodeRegistration.ts`](../packages/core/src/model/NodeRegistration.ts) is the registry and factory layer.

Current responsibilities:

- register built-in nodes
- register plugin nodes
- register whole plugins
- create serialized node instances
- create runtime `NodeImpl` instances
- provide dynamic lookup for unknown-at-compile-time node types
- provide plugin ownership lookup for a node type

Key APIs:

- `register(...)`
- `registerPluginNode(...)`
- `registerPlugin(...)`
- `create(...)`
- `createDynamic(...)`
- `createImpl(...)`
- `createDynamicImpl(...)`
- `getPluginFor(...)`
- `getPlugins()`

### Registry Assembly

[`RegistryAssembly.ts`](../packages/core/src/model/RegistryAssembly.ts) encapsulates the full registry lifecycle:

- `createBuiltInRegistry()` — creates a fresh registry populated with all built-in nodes
- `resolveBuiltInPlugin(id)` — resolves a built-in plugin by ID from `plugins.ts`
- `registerPluginsIntoRegistry(registry, plugins)` — registers an array of plugins into an existing registry
- `assembleRegistry(specs, loadPlugin)` — end-to-end helper: creates a built-in registry, then loads and registers plugin specs one by one so per-plugin load/registration failures are recorded without aborting the whole assembly

The app uses `assembleRegistry()` + `replaceGlobalRivetNodeRegistry()` (from `Nodes.ts`) to rebuild the global registry when project plugins change. The sidecar (`app-executor`) uses the same `assembleRegistry()` helper but passes the result directly to `createProcessor()` without touching the global.

Architectural significance:

- this registry is the bridge between serialized graph data and executable node implementations
- the app, node package, and sidecar all depend on this working consistently
- plugin loading mutates runtime availability through this registry
- `assembleRegistry()` returns a fresh registry without mutating the global, so callers choose whether to install it globally

## Built-In Plugins

Built-in plugins are exported from [`packages/core/src/plugins.ts`](../packages/core/src/plugins.ts).

Current built-in plugin families present in the repo:

- Anthropic
- Autoevals
- AssemblyAI
- Pinecone
- Hugging Face
- Gentrace
- OpenAI
- Google

These plugins contribute:

- config specs
- context menu groups
- plugin nodes
- provider-specific execution behavior

This is why "nodes" and "plugins" in core cannot be treated as separate, non-overlapping concerns.

## Execution Engine

The main execution engine is [`GraphProcessor.ts`](../packages/core/src/model/GraphProcessor.ts).

### What `GraphProcessor` owns

At a high level, it owns:

- graph preprocessing
- node instance creation
- dependency resolution
- queue-driven node scheduling
- control-flow exclusion
- split-run handling
- subgraph execution
- pause/resume/abort
- user input requests
- global state/event propagation
- recording playback
- process event emission

Important current boundary:

- graph-topology queries and readiness checks have been extracted into [`NodeExecutionPlanner.ts`](../packages/core/src/model/NodeExecutionPlanner.ts)
- child-processor event/lifecycle wiring has been extracted into [`SubprocessorBridge.ts`](../packages/core/src/model/SubprocessorBridge.ts)
- `GraphProcessor` still remains the public evented execution surface and the owner of execution state

## Chat Runtime Seams

`ChatNodeBase.ts` is still one of the larger remaining core hotspots, but it now has a dedicated helper seam under:

- [`packages/core/src/model/chat/openAIChatRequest.ts`](../packages/core/src/model/chat/openAIChatRequest.ts)
- [`packages/core/src/model/chat/openAIChatRuntime.ts`](../packages/core/src/model/chat/openAIChatRuntime.ts)
- [`packages/core/src/model/chat/chatMessages.ts`](../packages/core/src/model/chat/chatMessages.ts)
- [`packages/core/src/model/chat/tokenBudget.ts`](../packages/core/src/model/chat/tokenBudget.ts)
- [`packages/core/src/model/chat/streamChatResponse.ts`](../packages/core/src/model/chat/streamChatResponse.ts)
- [`packages/core/src/model/chat/chatCost.ts`](../packages/core/src/model/chat/chatCost.ts)

Current responsibilities split this way:

- `openAIChatRequest.ts`: request shaping shared inside the OpenAI-compatible chat path
- `openAIChatRuntime.ts`: OpenAI-specific streaming/non-streaming execution and retry behavior
- `chatMessages.ts`: prompt/input coercion into `ChatMessage[]` plus system-prompt injection helpers
- `tokenBudget.ts`: shared prompt/max-token limit enforcement and request/response token output helpers
- `streamChatResponse.ts`: streamed tool-call assembly and assistant-message reconstruction
- `chatCost.ts`: prompt/completion/audio cost calculation and token-cost helpers

These helpers are now reused across more than just `ChatNodeBase`:

- `ChatNodeBase.ts`
- `plugins/google/nodes/ChatGoogleNode.ts`
- `plugins/anthropic/nodes/ChatAnthropicNode.ts`

That means some of the former provider-level duplication is already removed in:

- prompt-to-chat-message coercion
- max-token clamping and warning generation
- assistant `all-messages` output reconstruction
- request/response token output wiring
- OpenAI chat runtime orchestration and retry handling

Current outcome:

- `ChatNodeBase.ts` is now closer to node-definition/editor contract plus orchestration
- the OpenAI execution loop is isolated from the node-definition surface
- Google and Anthropic nodes now share more chat-pipeline helpers instead of each keeping their own prompt/token/output plumbing

### Current state model inside `GraphProcessor`

The class maintains both:

- per-instance state, such as project/graph/registry/node-instance maps
- per-run state, such as results, visited nodes, abort controllers, globals, loaded references, and queue state

This distinction is important because some state is reused across runs and some is rebuilt on each `processGraph(...)`.

Current behavioral detail:

- helper paths such as `getDependencyNodesDeep(...)` can trigger preprocessing before `processGraph(...)` starts, because the app uses them for run-from preloading
- `contextValues` are refreshed per `processGraph(...)` call even when reusing the same processor instance
- pause waits are abort-aware, so aborting a paused run unwinds instead of waiting forever for a later `resume`

### Preprocessing

Before execution, `GraphProcessor`:

- loads project references
- calls `preprocessGraphState(...)`
- builds node instances
- builds connection maps
- computes port definitions
- computes strongly connected components

The SCC and preprocessing work are significant because they shape cycle handling and graph validation before the main execution loop.

Current architectural detail:

- preprocessing is not only a `processGraph(...)` concern; some public helper paths depend on it being available lazily

### Event system

`GraphProcessor` uses `Emittery` and defines a rich `ProcessEvents` map.

Current event families include:

- graph lifecycle events
- node lifecycle events
- partial output events
- user-input events
- pause/resume/abort events
- trace events
- global-set events
- dynamic `userEvent:${string}` and `globalSet:${string}` channels

The processor also exposes:

- direct listener methods (`on`, `off`, `once`, `onAny`, `offAny`)
- `events()` async generator for streaming-style consumption
- dedicated `onUserEvent(...)` and `offUserEvent(...)` helpers

Fire-and-forget event emission uses [`emitDetached(emitter, event, data)`](../packages/core/src/utils/emitDetached.ts), a thin wrapper around `void emitter.emit(...)` that makes the intent explicit. All detached emissions in `GraphProcessor`, `RecordingPlayer`, and `ExecutionRecorder` use this helper instead of inline `eslint-disable` suppressions.

### Scheduling model

The processor uses `p-queue` with explicit bounded concurrency for queued node execution. The import is normalized through [`pQueueCompat.ts`](../packages/core/src/utils/pQueueCompat.ts), which handles the CJS/ESM default-export interop (see Build-and-CI docs for the CJS alias strategy).

Execution is dataflow-driven:

- nodes are queued when their dependencies become available
- completion of one node can trigger downstream nodes
- split-run can further fan a node into multiple executions

Current execution policy details:

- `GraphProcessor` resolves a `GraphProcessorConcurrency` policy per processor instance
- queued node execution uses a bounded `nodeConcurrency` limit instead of `Infinity`
- child subprocessors inherit the parent processor's concurrency policy
- split-run parallel execution uses its own bounded `splitRunConcurrency` limit instead of raw `Promise.all`

The readiness/dependency logic used by this flow now lives largely in `NodeExecutionPlanner.ts`, while `GraphProcessor` coordinates queueing and mutable execution state.

### Control-flow model

Control flow is implemented through data propagation rather than separate wire types.

Important mechanisms:

- built-in conditional port `IF_PORT`
- `control-flow-excluded` values
- special handling for loops and certain nodes that are allowed to consume excluded values

The central check is currently internalized in `#excludedDueToControlFlow(...)`.

### Subgraphs

Subgraph execution uses child `GraphProcessor` instances created by `#createSubProcessor(...)`.

Subprocessors:

- inherit executor mode
- share execution cache
- share globals
- share external functions
- inherit the parent processor's concurrency policy
- propagate events back to the parent
- participate in root-level pause/resume/abort behavior

This means subgraphs are not a separate execution engine. They are nested processors wired into the same event and lifecycle model.

The low-level event/lifecycle plumbing for that parent-child relationship now lives in `SubprocessorBridge.ts`.

### User input

User-input nodes are supported directly by the processor.

Current behavior:

- a node requests user input through `requestUserInput(...)` in process context
- processor stores pending resolvers by `NodeId`
- processor emits a `userInput` event
- callers respond through `processor.userInput(nodeId, values)`

This is how the app bridges execution to the user-input modal.

### Globals and user events

`GraphProcessor` also provides lightweight runtime communication channels:

- graph-global values via `getGlobal`, `setGlobal`, `waitForGlobal`
- user events via `raiseEvent(...)` and `waitEvent(...)`

These are shared across subgraphs because subprocessors inherit the same root structures.

## Split-Run Execution

Split-run logic has been extracted into [`SplitRunProcessor.ts`](../packages/core/src/model/SplitRunProcessor.ts).

### Why it matters

This is one of the clearest recent refactor seams in core:

- `GraphProcessor` still decides when split-run is needed
- the actual split-run loop/aggregation lives in a separate module

### Current split-run behavior

`processSplitRunNode(...)`:

- pulls input values from injected dependencies
- determines split count from array-valued inputs and `splitRunMax`
- emits `nodeStart`
- runs sequentially when `isSplitSequential` is set
- otherwise runs in parallel through a bounded queue
- emits partial outputs for each split item
- aggregates split outputs back into array outputs
- emits `nodeFinish` or routes errors back through the injected `nodeErrored(...)`

### Architectural significance

The split-run module is intentionally dependency-injected through `SplitRunDeps`.

That means:

- split-run policy is still coupled to processor semantics
- but the orchestration details are now testable/refactorable separately

## Process Context

The runtime context exposed to nodes is defined in [`ProcessContext.ts`](../packages/core/src/model/ProcessContext.ts).

There are two layers:

### `ProcessContext`

Caller-provided execution environment:

- settings
- native API
- dataset provider
- MCP provider
- audio provider
- tokenizer
- code runner
- project reference loader
- project path
- optional chat-endpoint resolution hook

### `InternalProcessContext`

Processor-built node execution context:

- executor mode
- current project
- referenced projects
- abort signal
- process ID
- context values
- graph inputs/outputs
- graph input-node values
- current node
- attached execution data
- event/global helpers
- subprocessor factory
- partial-output callback
- external functions
- execution cache
- plugin config lookup
- code runner
- trace and abort helpers
- user-input request helper

This context is one of the most important extension surfaces in the runtime.

## Programmatic API

The high-level API lives in [`packages/core/src/api/createProcessor.ts`](../packages/core/src/api/createProcessor.ts).

### `coreCreateProcessor(...)`

Returns:

- `processor`
- normalized `inputs`
- normalized `contextValues`
- `getEvents(...)`
- `getSSEStream(...)`
- `streamNode(...)`
- `run()`

This is the main composition API used by higher-level packages.

### `coreRunGraph(...)`

Thin convenience wrapper around `coreCreateProcessor(...).run()`.

### `RunGraphOptions`

Current options include:

- graph selection
- inputs and context
- native/dataset/audio/MCP providers
- external functions
- user-event handlers
- abort signal
- registry override
- trace toggle
- processor concurrency override
- chat-endpoint resolver
- tokenizer
- code runner
- project path
- project reference loader
- full settings payload
- generated event callbacks like `onNodeStart`, `onGraphFinish`, etc.

This option type is much broader than "just inputs and settings."

## Event Streaming API

Streaming helpers live in [`packages/core/src/api/streaming.ts`](../packages/core/src/api/streaming.ts).

Current functionality:

- `getProcessorEvents(...)` exposes filtered async iteration over processor events
- `getProcessorSSEStream(...)` adapts that to SSE wire format
- `getSingleNodeStream(...)` streams partial output for a single node until completion

These APIs are used directly by higher-level surfaces like the CLI and Node-serving flows.

## Serialization

Serialization lives in [`packages/core/src/utils/serialization/`](../packages/core/src/utils/serialization/).

### Current behavior

- version detection happens centrally in `serializationUtils.ts`
- project and graph deserialization dispatch by detected version
- v4 is the active serializer/deserializer path
- dataset serialization is handled separately through v4 dataset helpers

### Shared helpers

[`serializationHelpers.ts`](../packages/core/src/utils/serialization/serializationHelpers.ts) consolidates logic shared between V3 and V4 serializers:

- `serializeConnection` / `deserializeConnection` — convert `NodeConnection` to/from the compact string format
- `parseVisualData` / `packVisualDataV3` / `packVisualDataV4` — encode/decode node visual data (position, size, colors)
- `wrapInYamlEnvelope` / `unwrapYamlEnvelope` — standard YAML version-envelope wrapping with validation

Both `serialization_v3.ts` and `serialization_v4.ts` delegate to these shared helpers instead of keeping their own copies.

### Architectural significance

Serialization is not just persistence. It is also the compatibility boundary for:

- old project files
- graph import/export
- app save/load behavior
- Trivet/project attached data handling

Any structural refactor that changes graph/project/node shape must be reviewed together with serialization.

## Recording and Playback

Core includes execution recording support under `recording/` and exports:

- `ExecutionRecorder`
- recorded event types
- replay support used by `GraphProcessor.replayRecording(...)`

The app relies on this for execution replay and recording-driven UX.

## Current Refactor Seams

The most meaningful seams in core right now are:

- `GraphProcessor` vs `SplitRunProcessor` vs `NodeExecutionPlanner` vs `SubprocessorBridge`
- `NodeRegistration` vs `RegistryAssembly` vs concrete node/plugin definitions
- `ProcessContext` and `buildNodeProcessContext(...)`
- serialization modules by version, with shared helpers in `serializationHelpers.ts`
- `exports.ts` as the public boundary
- `plugins.ts` plus `model/Nodes.ts` as the two main capability registries
- `emitDetached` as the single fire-and-forget emission pattern
- `pQueueCompat` as the CJS/ESM interop boundary for p-queue

## Known Architectural Tensions

Visible from the current code:

- `GraphProcessor` still carries a very large amount of orchestration logic.
- the runtime mixes execution concerns and editor-facing metadata concerns in the same package.
- plugin and built-in node registration both affect global registry state.
- subprocessor wiring is powerful but increases hidden coupling between parent/child execution.
- control-flow semantics are powerful but non-obvious because they are data-type-driven.

## Practical Refactor Guidance

- Keep `exports.ts` stable unless downstream breakage is intended.
- Treat graph shape, serializer shape, and app save/load behavior as a single change set.
- When changing execution behavior, review `GraphProcessor`, `SplitRunProcessor`, and streaming APIs together.
- When changing node/plugin contracts, review both app editor usage and runtime construction paths.
- Be careful with registry-global behavior; several packages assume built-ins are present and plugins are additive/resettable.
