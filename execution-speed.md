# Rivet Execution Speed Plan

## Status

Ready for implementation.

This document is an implementation plan for reducing Rivet workflow runtime overhead. It focuses on making a single workflow run faster through `runGraph(...)`, fresh `createProcessor(...).run()`, and graph-runner APIs, not on caching final outputs for repeated identical requests.

## Goal

Reduce fixed runtime overhead for cheap and medium-cost workflows without changing graph behavior.

The main target is workflows where Rivet orchestration is a visible part of total latency:

- one-shot `runGraph(...)` calls
- fresh `createProcessor(...).run()` calls where the processor is created, run once, and discarded
- explicit `runtimeProfile: 'headless-fast'` processor/runner calls
- workflows with many cheap nodes
- repeated Subgraph / Call Graph / Referenced Graph invocations
- subgraph/reference-heavy workflows where the same graph is called many times with the same or different inputs
- Code and Expression chains where execution overhead competes with actual user code

The target is substantial improvement, not a cosmetic 5% cleanup. Each implementation phase should aim for a measurable win on at least one benchmark scenario, preferably 20% or better, while preserving compatibility.

Runtime execution speed for already-loaded projects has priority over project loading speed. `runGraph(...)` and fresh `createProcessor(...).run()` are primary success gates. `runGraphInFile(...)` and project parsing can be optimized later, but only after the real execution path is faster or if measurements prove parsing dominates an important one-shot use case.

## Non-Goals

- Do not cache final graph outputs by input value.
- Do not memoize Subgraph results by input value.
- Do not change workflow outputs.
- Do not change event payload shapes unless the phase explicitly says so and tests preserve compatibility.
- Do not change recorder, replay, Remote Debugger, partial output, user input, wait-event, raise-event, globals, abort, loop, race, or split-run semantics.
- Do not optimize editor/debugger paths by removing observable lifecycle behavior.
- Do not make project mutation assumptions that are unsafe for the editor.

Allowed caches are structural/runtime caches only:

- immutable graph plans
- graph boundary indexes
- compiled code snippets
- runtime helper objects

They must not cache final node outputs unless a future feature explicitly adds opt-in memoization with separate semantics.

## Performance Rules

Every phase must make workflow runs faster or be rejected.

Use these rules when implementing:

- Measure before changing code.
- Keep the change only if at least one targeted runtime benchmark improves meaningfully and unrelated runtime benchmarks stay neutral.
- Treat a repeatable slowdown above 3% on a non-target runtime benchmark as a blocker unless the phase has an explicit user-visible tradeoff.
- Treat a repeatable slowdown above 10% on any benchmark as a blocker.
- Prefer removing work from the hot path over adding caches, wrappers, or policy checks.
- Do not add cache lookup/key-building overhead to every node unless the benchmark proves the lookup is cheaper than recomputation.
- Do not land "maybe faster" abstractions without benchmark evidence.
- Keep optimization branches local to the runtime paths they help. A subgraph-heavy optimization should not add work to simple text chains.
- If a phase only helps project loading or setup but not actual graph execution, mark it as secondary and do not let it delay runtime phases.

Primary runtime gates:

- `runGraph(...)` benchmarks must improve across cheap-chain and subgraph-heavy scenarios.
- fresh `createProcessor(...).run()` benchmarks must improve across cheap-chain and subgraph-heavy scenarios.
- `headless-fast` processor/runner benchmarks must stay fast; do not slow them while improving default-safe paths.
- `runGraphInFile(...)` is tracked, but it is not allowed to justify slowing already-loaded `runGraph(...)` or fresh `createProcessor(...)`.

## Benchmarking Contract

The first implementation step is to benchmark the current repo state before changing runtime code. Those numbers are the old-Rivet baseline for this optimization effort. Do not start an optimization phase until the baseline is recorded.

Every speed claim must compare actual workflow runs through public runtime APIs:

- old baseline `runGraph(...)` versus new `runGraph(...)`
- old baseline fresh `createProcessor(...).run()` versus new fresh `createProcessor(...).run()`
- old baseline `createGraphRunner(...)` versus new `createGraphRunner(...)` when runner behavior is targeted
- old baseline `runGraphInFile(...)` versus new `runGraphInFile(...)` only for the secondary file-loading path

For each benchmark run, record:

- baseline commit SHA and candidate commit SHA
- date, machine, OS, Node version, Yarn version, and CPU power mode if known
- sample count, iteration count, warmup iteration count, and whether packages were already built
- benchmark name, API surface, graph shape, node count, subgraph/reference count, and whether inputs are same or changing
- median, mean, minimum, maximum, standard deviation if available, absolute delta in milliseconds, and percentage delta
- pass/fail status against the performance rules

Use the same benchmark harness, same project fixtures, same runtime options, and same machine for old and new results. Run each benchmark group multiple times when results are noisy. If the spread is large enough that the result is ambiguous, treat the optimization as unproven until the benchmark is stabilized.

Benchmark reports must be honest about scope:

- Report wins for the scenarios that got faster.
- Report neutral results when no meaningful change happened.
- Report regressions, even if the main target improved.
- Do not present `headless-fast` gains as `runGraph(...)` or fresh `createProcessor(...)` gains unless those APIs were actually benchmarked.
- Do not present project-loading wins as runtime wins.

Preferred result format:

```md
## Benchmark Results - <phase>

Baseline: <sha>
Candidate: <sha>
Machine: <machine/os/node>
Samples: <n>, Iterations: <n>, Warmup: <n>

| Benchmark | API | Baseline ms | Candidate ms | Delta ms | Delta % | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| runGraph text chain 100 | runGraph | 0.00 | 0.00 | 0.00 | 0.0% | neutral |
```

## Current Runtime Model

Rivet has three node layers:

- Serialized graph data: `ChartNode` in [`packages/core/src/model/NodeBase.ts`](packages/core/src/model/NodeBase.ts)
- Runtime class contract: `NodeImpl` in [`packages/core/src/model/NodeImpl.ts`](packages/core/src/model/NodeImpl.ts)
- Registry/factory: [`packages/core/src/model/NodeRegistration.ts`](packages/core/src/model/NodeRegistration.ts)

Built-ins are registered in [`packages/core/src/model/Nodes.ts`](packages/core/src/model/Nodes.ts). Plugins are wrapped into `PluginNodeImplClass`, so built-in and plugin nodes run through the same `GraphProcessor` path.

A normal run roughly does this:

1. `createProcessor`, `runGraph`, `runGraphInFile`, app code, or a graph runner creates a processor.
2. `GraphProcessor.processGraph(...)` loads project references.
3. `preprocessGraphState(...)` creates node impls, builds node/connection maps, resolves port definitions, validates connections, computes strongly connected components, and optionally builds an immutable execution plan.
4. The scheduler queues terminal/start nodes.
5. For each node, `GraphProcessor` gathers inputs, applies exclusion/missing-input policy, creates per-node context, emits lifecycle events, calls `NodeImpl.process(...)`, stores outputs, and queues downstream nodes.

For cheap nodes, the actual node logic is often tiny. Most cost is orchestration around the node.

## Existing Speed Foundation

The repo already has important speed work:

- `createGraphRunner(..., { runtimeProfile: 'headless-fast' })`
- `createProcessor(..., { runtimeProfile: 'headless-fast' })`
- default-safe `createProcessor(...)` policy
- cached immutable graph plans
- cached Node CodeRunner for eligible headless/default runs
- `fast-acyclic` scheduler for eligible headless-fast graphs
- benchmark suite in [`packages/node/bench/runtimeSpeed.bench.ts`](packages/node/bench/runtimeSpeed.bench.ts)
- compatibility guards in `runtimeSpeedEquivalence`, `defaultFastCompatibility`, and `GraphProcessor.characterization` tests

Current important behavior:

- `createProcessor(...)` with no explicit `runtimeProfile` uses default-safe optimizations.
- `createProcessor(..., { runtimeProfile: 'headless-fast' })` enables stronger headless-only optimizations unless Remote Debugger or trace requirements force fallback.
- `createGraphRunner(..., { runtimeProfile: 'headless-fast' })` can reuse runner-owned structural state across runs.
- `runGraph(...)` still forces `runtimeProfile: 'compatible'` in [`packages/node/src/api.ts`](packages/node/src/api.ts), so it intentionally avoids the default-safe path today.

## Benchmark Scenarios

Before each phase, run enough benchmark samples to smooth noise:

```powershell
$env:RIVET_RUNTIME_BENCH_SAMPLES="5"
$env:RIVET_RUNTIME_BENCH_ITERATIONS="100"
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS="10"
node .yarn\releases\yarn-4.6.0.cjs bench:runtime-speed
```

Track at least these scenarios:

Flat workflows without subgraphs or references:

- `load once + runGraph passthrough`
- `runGraph text chain 20`
- `runGraph text chain 100`
- `runGraph text chain 500`
- `fresh createProcessor default-safe passthrough`
- `fresh createProcessor default-safe text chain 20`
- `fresh createProcessor default-safe text chain 100`
- `fresh createProcessor default-safe text chain 500`
- `runGraph wide independent text nodes 100`
- `fresh createProcessor default-safe wide independent text nodes 100`

Code and expression workflows:

- `fresh createProcessor default-safe repeated subgraph same-input 50`
- `fresh createProcessor default-safe repeated subgraph changing-input 50`
- `fresh createProcessor default-safe expression chain 20`
- `fresh createProcessor default-safe code chain 20`
- `runGraph expression chain 20`
- `runGraph code chain 20`

Subgraph workflows:

- `runGraph single subgraph call`
- `fresh createProcessor default-safe single subgraph call`
- `runGraph repeated subgraph same-input 50`
- `runGraph repeated subgraph changing-input 50`
- `fresh createProcessor default-safe repeated subgraph same-input 50`
- `fresh createProcessor default-safe repeated subgraph changing-input 50`
- `runGraph nested subgraph depth 5`
- `fresh createProcessor default-safe nested subgraph depth 5`
- `runGraph parallel subgraph fan-in`
- `fresh createProcessor default-safe parallel subgraph fan-in`

Graph runner workflows:

- `createGraphRunner compatible subgraph chain 50`
- `createGraphRunner headless-fast subgraph chain 50`
- `createGraphRunner compatible mixed subgraph fan-in`
- `createGraphRunner headless-fast mixed subgraph fan-in`

Referenced graph workflows:

- `runGraph Call Graph repeated same-input 50`
- `fresh createProcessor default-safe Call Graph repeated same-input 50`
- `runGraph Referenced Graph Alias repeated same-input 50`
- `fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50`
- `runGraph custom projectReferenceLoader referenced graph`
- `fresh createProcessor default-safe custom projectReferenceLoader referenced graph`

Code runner micro-benchmarks:

- `NodeCodeRunner compile/run one snippet`
- `CachedNodeCodeRunner run cached snippet`

Secondary setup/loading scenario:

- `runGraphInFile passthrough one-shot`
- `runGraphInFile subgraph project one-shot`
- `runGraphInFile referenced-project one-shot`

If a phase targets a missing scenario, add the benchmark first. In particular, add or keep coverage for:

- repeated direct `Subgraph` calls with same inputs
- repeated direct `Subgraph` calls with changing inputs
- nested `Subgraph` calls
- parallel Subgraph fan-out/fan-in
- `Call Graph` calls
- `Referenced Graph Alias` calls
- referenced-project loading with a custom loader
- flat workflows with no subgraphs or references
- wide independent-node workflows that can expose scheduler overhead
- Code/Expression workflows that expose code-runner and interpolation overhead

Keep a small compatibility benchmark group for features that are not primary optimization targets but can be affected by scheduler or processor changes:

- loop workflow
- race workflow
- split-run workflow
- wait-event / raise-event workflow
- graph with global set/get
- graph with missing optional inputs
- graph with control-flow-excluded outputs

These compatibility benchmarks do not need to be large. Their job is to catch "got faster by breaking behavior" changes.

Record both absolute milliseconds and percentage change. For tiny graphs, a tiny absolute regression can look large by percentage, so compare both:

- target runtime benchmark: should improve in absolute time and percentage
- unrelated runtime benchmark: should not regress beyond the performance rules above
- secondary setup benchmark: useful, but does not justify slowing runtime execution

When a phase targets `runGraph(...)`, also compare fresh `createProcessor(...)` with the same graph shape. When a phase targets fresh `createProcessor(...)`, also compare `runGraph(...)` unless the phase is explicitly processor-only.

## Implementation Phases

### P0: Refresh Baselines And Equivalence Guards

Purpose:

Make sure speed wins are real and compatibility failures are caught before optimization changes land. This phase must run first and must capture the current checkout as the baseline before runtime code changes.

Files:

- [`packages/node/bench/runtimeSpeed.bench.ts`](packages/node/bench/runtimeSpeed.bench.ts)
- [`packages/node/test/runtimeSpeedEquivalence.test.ts`](packages/node/test/runtimeSpeedEquivalence.test.ts)
- [`packages/node/test/defaultFastCompatibility.test.ts`](packages/node/test/defaultFastCompatibility.test.ts)
- [`packages/core/test/model/GraphProcessor.characterization.test.ts`](packages/core/test/model/GraphProcessor.characterization.test.ts)

Steps:

1. Review benchmark scenarios against the target list above.
2. Add missing benchmark fixtures for `Call Graph`, `Referenced Graph Alias`, and repeated same-input versus changing-input subgraph/reference calls if coverage is incomplete.
3. Ensure each important fixture can run through both `runGraph(...)` and fresh `createProcessor(...).run()` unless it is explicitly API-specific.
4. Keep benchmark fixtures deterministic and cheap enough for local runs.
5. Add equivalence checks for any new benchmark fixture shape before optimizing it.
6. Record the current commit SHA before optimization starts.
7. Run the benchmark suite multiple times on the current checkout and record baseline numbers using the Benchmarking Contract format.
8. Record the fastest and slowest benchmark groups separately: runtime execution, code execution, graph runner reuse, and secondary project loading.
9. After each phase, rerun the same benchmark matrix against the candidate commit and compare it to the original baseline plus the previous phase.

Risks:

- Benchmarks without equivalence tests can reward broken behavior.
- Too many slow benchmarks will make the suite unpleasant and discourage running it.
- Noisy single-sample numbers can hide regressions.

Acceptance criteria:

- Benchmarks cover the target runtime shapes.
- Equivalence tests cover optimized and compatible paths for the new fixture shapes.
- Baseline numbers for the current checkout are recorded before optimization phases.
- Each later phase can produce an old-versus-new comparison for `runGraph(...)` and fresh `createProcessor(...).run()`.
- Runtime benchmark gates are explicit before the first optimization lands.

### P1: Let `runGraph(...)` Use Default-Safe Optimizations

Purpose:

Make common programmatic one-shot `runGraph(...)` calls faster without requiring users to change API usage.

Current state:

`runGraph(...)` currently calls `createProcessor(project, { ...options, runtimeProfile: 'compatible' })`, which bypasses default-safe optimizations. Default-safe `createProcessor(...)` already keeps the compatible scheduler, falls back for Remote Debugger and trace-sensitive paths, uses cached default CodeRunner only when no custom runner is supplied, and caches only structural subprocessor data.

Files:

- [`packages/node/src/api.ts`](packages/node/src/api.ts)
- [`packages/node/test/api.test.ts`](packages/node/test/api.test.ts)
- [`packages/node/test/runtimeSpeedEquivalence.test.ts`](packages/node/test/runtimeSpeedEquivalence.test.ts)
- [`packages/node/test/defaultFastCompatibility.test.ts`](packages/node/test/defaultFastCompatibility.test.ts)
- [`developer-docs/PACKAGES.md`](developer-docs/PACKAGES.md)

Steps:

1. Change `runGraph(...)` to omit the forced `runtimeProfile: 'compatible'`.
2. Benchmark before and after this one-line policy change before adding any extra API surface.
3. Preserve an explicit compatibility escape hatch only if tests or wrapper feedback prove one is needed. Avoid adding `runtimeProfile` to `runGraph(...)` unless there is a real compatibility reason.
4. Confirm Remote Debugger runs still fall back to compatible behavior through runtime policy.
5. Confirm custom `codeRunner`, custom providers, project reference loaders, and runtime callbacks still run.
6. Update docs to explain that `runGraph(...)` uses default-safe structural optimizations, not `headless-fast`.

Risks:

- Some users may rely on exact event timing or loader call counts from compatible mode.
- Default-safe loaded-project caching can make project-reference loader call counts differ inside one run.
- If `runtimeProfile` is added to `runGraph`, it becomes public API and needs docs/tests.
- Default-safe setup might theoretically be slower for the tiniest passthrough graph. If that happens, add a cheap-graph cutoff or keep `runGraph(...)` compatible until a lower-overhead default-safe path exists.

Acceptance criteria:

- `runGraph(...)` remains behavior-equivalent in compatibility tests.
- Remote Debugger, recordings, custom code runner, project references, and abort tests still pass.
- `runGraph` benchmark scenarios improve or remain neutral under the performance rules.
- Fresh `createProcessor(...)` default-safe benchmark scenarios remain neutral or improve.

### P2: Add Runtime Graph Boundary Caches For Subgraph And Reference Nodes

Purpose:

Reduce repeated graph input/output scans and repeated input-object construction in subgraph-heavy workflows without slowing graphs that do not use subgraphs/references. This phase primarily targets fresh `createProcessor(...).run()` and `runGraph(...)` for subgraph/reference-heavy already-loaded projects.

Current hotspots:

- `SubGraphNodeImpl.getInputDefinitions`, `getGraphOutputs`, `getEditors`, and `process(...)` scan graph nodes for `graphInput` / `graphOutput`.
- `ReferencedGraphAliasNodeImpl` does the same for referenced projects.
- `process(...)` builds input maps with repeated object spreads.
- These costs repeat for every Subgraph / Referenced Graph invocation, even when graph boundaries are stable during a run.

Files:

- [`packages/core/src/model/nodes/SubGraphNode.ts`](packages/core/src/model/nodes/SubGraphNode.ts)
- [`packages/core/src/model/nodes/ReferencedGraphAliasNode.ts`](packages/core/src/model/nodes/ReferencedGraphAliasNode.ts)
- [`packages/core/src/model/nodes/CallGraphNode.ts`](packages/core/src/model/nodes/CallGraphNode.ts)
- possible new helper: `packages/core/src/model/GraphBoundaryCache.ts`
- [`packages/core/test/model/nodes/SubGraphNode.test.ts`](packages/core/test/model/nodes/SubGraphNode.test.ts)
- referenced graph / call graph tests
- runtime benchmarks

Steps:

1. Add a small helper that derives graph boundary inputs/outputs from a `Project` plus `graphId`.
2. First apply no-cache low-risk wins: replace reduce-with-object-spread input map construction with direct object mutation.
3. Benchmark the no-cache change separately.
4. Add a runtime-scoped graph boundary cache only if repeated boundary scans remain visible in benchmarks.
5. Scope runtime caching to a processor/run context or an explicitly passed cache object, not a long-lived global cache that can go stale when the editor mutates graph objects in place.
6. Use the helper in Subgraph and Referenced Graph runtime `process(...)` paths.
7. Keep editor `getEditors(...)` behavior correct; prefer no editor caching unless a UI benchmark proves it matters.
8. Keep graph input/output ordering and duplicate-id behavior exactly as today.
9. Extend benchmarks for repeated Subgraph, Referenced Graph, and Call Graph cases if needed.

Risks:

- A module-level WeakMap can become stale if editor code mutates a graph object in place.
- Graph input/output duplicate handling must stay stable.
- Referenced projects can change independently between runs; cache lifetime must not outlive safe runtime boundaries.
- `CallGraph` uses dynamic graph references, so it may need only helper reuse, not static port definitions.
- Cache lookup overhead can make small single-subgraph workflows slower. Gate cache use on repeated graph boundary access within a run if needed.

Acceptance criteria:

- Repeated subgraph/reference benchmarks improve.
- Both `runGraph(...)` and fresh `createProcessor(...).run()` improve on repeated subgraph/reference benchmarks.
- Non-subgraph text/code/expression benchmarks remain neutral.
- Graph input/output definitions and runtime outputs remain equivalent.
- Editor settings panels still reflect graph input/output changes.

### P3: Reduce Fresh Subprocessor Construction Cost

Purpose:

Make repeated Subgraph / Call Graph / Referenced Graph calls faster when each call still needs its own independent execution state.

Current state:

Each subgraph invocation creates a child `GraphProcessor`, wires lifecycle/events, initializes state, and preprocesses unless a structural plan is cached. Execution-plan caching helps, but processor construction and state setup still repeat.

Files:

- [`packages/core/src/model/GraphProcessor.ts`](packages/core/src/model/GraphProcessor.ts)
- [`packages/core/src/model/SubprocessorBridge.ts`](packages/core/src/model/SubprocessorBridge.ts)
- [`packages/core/src/model/GraphPreprocessor.ts`](packages/core/src/model/GraphPreprocessor.ts)
- [`packages/core/test/model/GraphProcessor.test.ts`](packages/core/test/model/GraphProcessor.test.ts)
- [`packages/core/test/model/GraphProcessor.characterization.test.ts`](packages/core/test/model/GraphProcessor.characterization.test.ts)
- runtime benchmarks

Steps:

1. Measure where fresh subprocessor time is spent after P1/P2.
2. If construction is not a top contributor after P1/P2, defer this phase.
3. Extract a lightweight subprocessor construction path only for reused immutable graph plans and loaded-project cache, while creating fresh mutable run state.
4. Keep node result maps, globals, abort state, pause state, errors, visited/excluded nodes, execution metadata, and partial output state per subprocessor instance.
5. Do not reuse `GraphProcessor` objects across concurrent calls.
6. Do not reuse `NodeImpl` instances until a separate audit proves all built-in and plugin impls are stateless across runs.
7. Preserve event forwarding through `SubprocessorBridge`.

Risks:

- Reusing mutable processor state would corrupt concurrent subgraph calls.
- Reusing `NodeImpl` instances can leak state if any plugin or built-in implementation mutates itself.
- Event metadata for nested graphs is easy to subtly break.
- Abort propagation through nested subprocessors must remain exact.

Acceptance criteria:

- Subgraph chain and mixed subgraph fan-in benchmarks improve.
- Fresh `createProcessor(...).run()` improves for subgraph-heavy workflows.
- `runGraph(...)` improves for the same subgraph-heavy shapes once it uses default-safe policy.
- Single top-level cheap graph benchmarks remain neutral.
- Nested graph event characterization tests still pass.
- Concurrent subgraph/split-run tests still pass.

### P4: Reduce Per-Node Context And Abort Overhead

Purpose:

Improve cheap 100-500 node workflows after safer structural wins land.

Current hotspots:

For every node, `GraphProcessor` creates a node abort controller, binds an abort listener, builds a full internal process context object, copies external functions, and emits lifecycle events.

Files:

- [`packages/core/src/model/GraphProcessor.ts`](packages/core/src/model/GraphProcessor.ts)
- [`packages/core/src/model/ProcessContextBuilder.ts`](packages/core/src/model/ProcessContextBuilder.ts)
- [`packages/core/src/model/NodeImpl.ts`](packages/core/src/model/NodeImpl.ts)
- GraphProcessor characterization tests
- runtime benchmarks

Steps:

1. Measure per-node overhead after P1-P3.
2. Start with low-risk object-allocation reductions:
   - avoid copying empty `externalFunctions`
   - avoid rebuilding stable context fragments
   - reuse immutable empty objects where safe
3. Benchmark each allocation reduction independently where practical.
4. Consider a node capability flag only after measurement proves per-node abort controller creation is a major cost.
5. If adding capabilities, default all existing/plugin nodes to the compatible path.
6. Keep lifecycle events and abort semantics unchanged.

Risks:

- A shared mutable context object can leak data between nodes.
- Skipping abort controllers for nodes that use `context.signal` can break cancellation.
- Event order and trace output are observable.
- Micro-optimizations can make code worse without meaningful speed gain.

Acceptance criteria:

- Cheap chain benchmarks improve measurably.
- Both `runGraph(...)` and fresh `createProcessor(...).run()` improve on cheap-chain benchmarks.
- Subgraph-heavy benchmarks stay neutral or improve.
- Abort, pause/resume, user input, wait-event, partial output, and trace tests still pass.
- Code remains simpler or clearly justified by benchmark wins.

### P5: Cache Or Precompute Dynamic Port Definitions Safely

Purpose:

Reduce preprocessing cost for large cheap graphs and graph-reference-heavy graphs.

Current state:

`preprocessGraphState(...)` calls `getInputDefinitionsIncludingBuiltIn(...)` and `getOutputDefinitions(...)` for every node. Many definitions are static or depend only on node data and local connections. Some are dynamic and depend on project/referenced-project graph boundaries or interpolation sources.

Files:

- [`packages/core/src/model/GraphPreprocessor.ts`](packages/core/src/model/GraphPreprocessor.ts)
- [`packages/core/src/model/NodeImpl.ts`](packages/core/src/model/NodeImpl.ts)
- interpolation-heavy nodes such as Text, Prompt, Object, Code, Expression
- graph boundary nodes such as Subgraph and Referenced Graph Alias
- relevant node tests and runtime benchmarks

Steps:

1. Classify built-in nodes by definition stability:
   - static by node type
   - depends on node data
   - depends on current connections
   - depends on project/referenced-project graph boundaries
   - depends on interpolation parsing
2. Measure definition-building share of runtime before adding a cache.
3. If definition building is not a visible runtime cost, defer this phase.
4. Add a narrow cache for safe classes first. Prefer cache keys based on node object identity plus relevant node data fields inside one preprocess/run cache.
5. Do not cache plugin node definitions unless the plugin API exposes an explicit cache-safety signal.
6. Cache parsed interpolation port names for nodes that already parse `{{...}}` text to build input definitions only if parsing shows up in benchmarks.
7. Keep invalid-connection pruning behavior unchanged.

Risks:

- Over-caching dynamic plugin definitions can break plugins that compute ports from runtime-like state.
- Editor in-place node mutation can make long-lived caches stale.
- Definition caching that ignores connections can break nodes like Array, Coalesce, Join, Passthrough, Race Inputs, Loop Controller, or Delay.
- Cache-key construction can cost more than recomputing simple definitions.

Acceptance criteria:

- Preprocessing benchmarks improve for large cheap graphs.
- Fresh `createProcessor(...).run()` improves for large cheap graphs where preprocessing is part of the one-shot processor run.
- `runGraph(...)` improves for the same graph shapes once it uses default-safe policy.
- Overall runtime benchmarks improve or remain neutral.
- Dynamic input discovery remains correct for interpolation nodes.
- Connection validation tests still pass.
- Plugin compatibility remains conservative.

### P6: Optimize One-Shot Project File Loading

Purpose:

Reduce latency for `runGraphInFile(...)` and other "run this project file once" paths where parsing/materialization is part of total user-visible latency.

Priority:

Secondary. This phase should not happen before runtime execution phases unless benchmarks show project parsing dominates the user's actual one-shot path.

Current hotspot:

Project deserialization detects YAML/project version and then deserializes. YAML may be parsed more than once. This is outside node execution proper, but it matters to endpoint and CLI-style one-shot runs.

Files:

- project serialization/deserialization utilities under `packages/core/src/utils/serialization/`
- [`packages/node/src/api.ts`](packages/node/src/api.ts)
- tests for loading project strings/files
- runtime benchmarks

Steps:

1. Add a benchmark that isolates `loadProjectFromFile` / `loadProjectFromString` from graph execution.
2. Trace the current parser/version-detection path and count YAML parses.
3. Refactor version detection to parse once where possible and pass the parsed document/object into version-specific deserialization.
4. Preserve attached-data loading behavior.
5. Preserve legacy project version support.

Risks:

- Project serialization has legacy compatibility expectations.
- Attached data and project-only loading may share code but have different return shapes.
- YAML parser errors and version errors must stay readable.

Acceptance criteria:

- `runGraphInFile passthrough one-shot` improves.
- Already-loaded runtime benchmarks do not regress.
- Project serialization/deserialization tests pass for all supported versions.
- Error messages remain at least as useful as before.

### P7: Reassess `fast-acyclic` Expansion Last

Purpose:

Decide whether to broaden the fast scheduler after safer wins are exhausted.

Current state:

`fast-acyclic` is intentionally narrow and excludes loop/race/user-input/wait-event-sensitive behavior. It is already available through `headless-fast` paths.

Steps:

1. Compare post-P1-P6 compatible/default-safe benchmarks against headless-fast.
2. Identify the remaining gap attributable specifically to scheduler behavior.
3. Only broaden eligibility if the remaining runtime gap is large enough to justify scheduler risk.
4. Only broaden eligibility if characterization tests prove event/order/abort behavior stays compatible for that node class.
5. Keep editor/Remote Debugger paths compatible unless separately planned.

Risks:

- Scheduler changes are high blast-radius.
- Loops, races, user input, wait-event, and abort timing are easy to break.
- Faster node start order can change observable event order.

Acceptance criteria:

- Any scheduler expansion has targeted benchmarks and characterization coverage.
- Unsupported node types remain protected.
- Default behavior remains compatible where required.

## Recommended Order

1. P0: Refresh baselines and equivalence guards.
2. P1: Move `runGraph(...)` from forced compatible mode to default-safe mode.
3. P2: Add runtime graph boundary caches for Subgraph / Referenced Graph.
4. P3: Reduce fresh subprocessor construction cost.
5. P4: Reduce per-node context and abort overhead.
6. P5: Cache safe dynamic port definitions only if measured definition cost justifies it.
7. P6: Optimize one-shot project file loading as a secondary path.
8. P7: Reassess broader `fast-acyclic` scheduler eligibility.

This order prioritizes substantial wins with lower behavioral risk before touching the hottest and most delicate `GraphProcessor` internals.

Expected primary impact by phase:

- P1 should make `runGraph(...)` faster by letting it use the existing default-safe path.
- P2 and P3 should make both `runGraph(...)` and fresh `createProcessor(...).run()` faster for subgraph/reference-heavy workflows.
- P4 should make both `runGraph(...)` and fresh `createProcessor(...).run()` faster for cheap-node chains.
- P5 should make fresh `createProcessor(...).run()` and `runGraph(...)` faster only if definition building is measured as a real cost.
- P6 should improve only `runGraphInFile(...)` / loading-heavy one-shot flows and must not slow loaded runtime execution.

## Validation Commands

Focused benchmark:

```powershell
$env:RIVET_RUNTIME_BENCH_SAMPLES="5"
$env:RIVET_RUNTIME_BENCH_ITERATIONS="100"
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS="10"
node .yarn\releases\yarn-4.6.0.cjs bench:runtime-speed
```

Focused tests:

```powershell
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-node exec tsx --test test/runtimeSpeedEquivalence.test.ts test/defaultFastCompatibility.test.ts test/api.test.ts test/graphRunner.test.ts
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-core exec tsx --test test/model/GraphProcessor.test.ts test/model/GraphProcessor.characterization.test.ts
```

Repository gates:

```powershell
node .yarn\releases\yarn-4.6.0.cjs test
node .yarn\releases\yarn-4.6.0.cjs lint
node .yarn\releases\yarn-4.6.0.cjs workspace docs run typecheck
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-core run build:esm
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-node run build:esm
git diff --check
```

## Final Success Criteria

- Benchmarks show meaningful wins in the target scenarios.
- Benchmark results compare the original old-Rivet baseline against the final candidate for actual `runGraph(...)` and fresh `createProcessor(...).run()` workflow runs.
- The final report clearly says which user scenarios got faster, by how many milliseconds and percent, and which scenarios stayed neutral or regressed.
- No workflow output changes.
- No final-output memoization or same-input result caching is introduced.
- Recorder and replay behavior remains compatible.
- Remote Debugger behavior remains compatible.
- Custom project reference loaders and custom code runners remain honored.
- Editor paths stay safe unless explicitly optimized in a separate phase.
- Developer docs are updated with each implementation phase.
