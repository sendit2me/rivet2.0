**How Nodes Work**
Rivet has three node layers:

- Serialized graph data: `ChartNode` in [NodeBase.ts](/F:/Programming/Rivet2.0/packages/core/src/model/NodeBase.ts)
- Runtime class contract: `NodeImpl` in [NodeImpl.ts](/F:/Programming/Rivet2.0/packages/core/src/model/NodeImpl.ts)
- Registry/factory: [NodeRegistration.ts](/F:/Programming/Rivet2.0/packages/core/src/model/NodeRegistration.ts)

Built-ins are registered in [Nodes.ts](/F:/Programming/Rivet2.0/packages/core/src/model/Nodes.ts). Plugins are wrapped into `PluginNodeImplClass`, so built-in and plugin nodes run through the same `GraphProcessor` path.

**Execution Flow**
A run goes roughly like this:

1. `createProcessor` / `runGraph` / app code creates a `GraphProcessor`.
2. `processGraph(...)` loads project references.
3. `preprocessGraphState(...)` creates node impls, builds node/connection maps, resolves port definitions, validates connections, computes SCC/cycle data, and optionally builds an immutable execution plan.
4. Scheduler queues start/output nodes.
5. For each node, `GraphProcessor`:
   - gathers inputs
   - checks control-flow exclusion
   - checks missing required inputs
   - creates per-node abort controller/context
   - emits events
   - calls `NodeImpl.process(...)`
   - stores outputs and queues downstream nodes

The actual node logic is often small. A lot of overhead is orchestration around the node.

**Existing Speed Work**
The repo already has a substantial speed layer:

- `createGraphRunner(..., { runtimeProfile: 'headless-fast' })`
- `createProcessor(..., { runtimeProfile: 'headless-fast' })`
- default-safe `createProcessor(...)`
- cached immutable graph plans
- cached Node CodeRunner
- narrow `fast-acyclic` scheduler
- benchmark suite: [runtimeSpeed.bench.ts](/F:/Programming/Rivet2.0/packages/node/bench/runtimeSpeed.bench.ts)
- compatibility guards: `runtimeSpeedEquivalence`, `defaultFastCompatibility`, `GraphProcessor.characterization`

Important detail: [runGraph(...)](/F:/Programming/Rivet2.0/packages/node/src/api.ts:268) still forces `runtimeProfile: 'compatible'`, so it intentionally does not get the fastest path yet.

**Likely Speed Hotspots**
The most promising areas for a future refactor plan are:

1. **Per-node runtime overhead**
   `#processNodeWithInputData(...)` creates an `AbortController`, listener, full process context object, and event payload path per node. This matters for cheap 100-500 node graphs.

2. **Scheduler/event overhead**
   Compatible scheduling uses `p-queue`, repeated readiness checks, and evented lifecycle semantics. The `fast-acyclic` scheduler avoids some of that, but only for eligible headless graphs.

3. **Subgraph calls**
   Every Subgraph / Call Graph / Referenced Graph invocation creates a child `GraphProcessor`, wires events/lifecycle, initializes run state, and preprocesses unless cached. Repeated subgraph-heavy graphs are a very important target.

4. **Dynamic port definition cost**
   Preprocessing calls `getInputDefinitions` / `getOutputDefinitions` for every node. Subgraph and referenced-graph nodes repeatedly scan graph input/output nodes. Interpolation-based nodes repeatedly parse `{{...}}` sources.

5. **Project-reference loading**
   References are recursively loaded before preprocessing. Caching exists only under selected fast policies because loader call counts can be observable.

6. **Code/Expression execution**
   Node mode has `CachedNodeCodeRunner`, but only when no custom runner is supplied. App-executor has a worker pool, but `includeRivet` still runs current-thread. Custom wrapper runners can bypass these wins.

7. **Project file parsing**
   `.rivet-project` deserialization detects YAML version and then deserializes, which means YAML may be parsed twice. This is outside node execution proper but matters for “run project file once” flows like `runGraphInFile`.

8. **App/editor paths**
   Browser/editor execution often constructs raw `GraphProcessor(..., includeTrace: true)`, which keeps it on compatible behavior. That is safer for UI/debugging but not the fastest backend path.

**Main Constraint**
The hard part is not finding overhead. It is preserving the observable contracts: recorder events, remote debugger behavior, replay metadata, partial outputs, user input, globals/events, aborts, loops/races/split-runs, project references, and custom code runners.

So the future speed refactor should probably split into “headless backend-safe” improvements first, then separately consider editor/debugger paths.


