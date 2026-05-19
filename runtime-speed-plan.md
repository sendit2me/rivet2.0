# Rivet Runtime Speed Plan

## Summary

Optimize headless/programmatic Node execution first. This first wave is now
implemented. It covers both reusable-runner services that load one project and
run it many times, and wrapper endpoint execution that creates a fresh processor
for one HTTP request, runs it once, and cannot rely on cache state from previous
processor runs.

The current repo code now contains four runtime-speed improvements:

1. Reuse stable Node runtime setup across repeated runs.
2. Cache Code/Expression compilation in the Node runtime.
3. Cache immutable graph planning and adjacency data for repeated headless runs.
4. Reduce single-run `GraphProcessor` scheduler/preprocessing overhead for
   fresh `createProcessor(...).run()` endpoint calls, then default the safe
   single-run pieces for omitted Node `createProcessor(...)` runtime profiles.

Default Rivet behavior must remain compatible for the editor, Browser mode,
Remote Debugger, recording, app-executor, and existing `runGraph(...)` /
`runGraphInFile(...)` callers. Fast profiles remain Node-only. For wrapper
endpoints, the omitted Node `createProcessor(...)` default now uses only the
safe single-run pieces that do not depend on cross-request or
repeated-processor cache state. More aggressive scheduler and reference-loading
behavior stays behind explicit `runtimeProfile: 'headless-fast'`.

## Current Code Findings

These findings were checked against the current source before revising this
plan.

- [`packages/node/src/api.ts`](packages/node/src/api.ts) creates the Node wrapper
  around core. `runGraphInFile(...)` still reads and deserializes the project on
  every call, and `runGraph(...)` still creates a processor per call.
- Node `createProcessor(...).run()` constructs default runtime dependencies on
  each run when callers do not provide them: `NodeNativeApi`, `NodeMCPProvider`,
  fallback tokenizer, `NodeProjectReferenceLoader`, and resolved process
  settings. `runGraph(...)` and compatible-profile `createProcessor(...)` use
  `NodeCodeRunner`; omitted-default `createProcessor(...)` can use the
  run-scoped cached Node CodeRunner when no custom `codeRunner` is supplied.
- [`packages/core/src/api/createProcessor.ts`](packages/core/src/api/createProcessor.ts)
  converts `inputs` and `context` when the processor is created, not when
  `run()` is called. A reusable runner that accepts per-run inputs cannot just
  wrap the existing `coreCreateProcessor(...).run()` method.
- [`GraphProcessor.processGraph(...)`](packages/core/src/model/GraphProcessor.ts)
  still creates mutable run state every run. It preprocesses each graph on the
  compatible path, but can reuse graph-keyed immutable execution plans when a
  Node fast path supplies a runtime cache. It loads project references every run
  unless the explicit loaded-project-reference cache is enabled.
- [`GraphPreprocessor`](packages/core/src/model/GraphPreprocessor.ts) creates
  node instances, validates connections, computes dynamic port definitions, and
  computes SCC/cycle data. Port definitions can depend on connections, project,
  registry, and loaded project references, so caching must be tied to an
  immutable project/registry/reference snapshot.
- [`NodeExecutionPlanner`](packages/core/src/model/NodeExecutionPlanner.ts)
  repeatedly scans connection and definition arrays during scheduling. Cached
  adjacency maps are a lower-risk first step than replacing the scheduler.
- [`NodeCodeRunner`](packages/node/src/native/NodeCodeRunner.ts) creates a new
  `AsyncFunction` for every Code/Expression execution. The Node fast paths use
  [`CachedNodeCodeRunner`](packages/node/src/native/CachedNodeCodeRunner.ts)
  only when the caller did not pass a custom `codeRunner`.

## Priority Order

### P0: Benchmarks And Equivalence Guards (DONE)

Add repeatable benchmarks before runtime changes. This keeps the work honest and
lets us reject high-effort changes that do not move real workloads.

Measure:

- `runGraphInFile(...)` one-shot cost, including file read and deserialize.
- `loadProjectFromFile(...)` once plus repeated `runGraph(...)`.
- existing `createProcessor(...).run()` repeated with stable options.
- direct `GraphProcessor.processGraph(...)` with stable context.
- cheap built-in DAGs at 20, 100, and 500 nodes.
- Expression-heavy and new Code-heavy graphs.
- graphs with subgraphs/project references if they are common in production.
- lazy preprocessing/dependency planning and CodeRunner-only microbenchmarks.

Add equivalence tests that compare the existing compatible path with each new
fast path before exposing it broadly.

Implementation status:

- Added shared runtime-speed graph fixtures in
  [`packages/node/test/runtimeSpeedFixtures.ts`](packages/node/test/runtimeSpeedFixtures.ts).
- Added compatibility guard coverage in
  [`packages/node/test/runtimeSpeedEquivalence.test.ts`](packages/node/test/runtimeSpeedEquivalence.test.ts).
  The direct `GraphProcessor` mode in that suite is a diagnostic baseline for
  provider-free fixtures; public Node API behavior remains pinned through
  `runGraph(...)`, `createProcessor(...).run()`, and
  `createGraphRunner(...).run(...)`.
- Added the repeatable benchmark command
  `yarn bench:runtime-speed`, backed by
  [`packages/node/bench/runtimeSpeed.bench.ts`](packages/node/bench/runtimeSpeed.bench.ts).
- The benchmark suite includes nested subgraph, wide fan-in, and mixed
  subgraph fan-in fixtures so graph-keyed plan caching and orchestration-heavy
  DAG shapes stay visible in regular runtime-speed runs instead of living only
  in ad hoc probes.
- Benchmark iteration counts can be tuned with
  `RIVET_RUNTIME_BENCH_ITERATIONS` and
  `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS`.
  `RIVET_RUNTIME_BENCH_SAMPLES` runs each benchmark case multiple times and
  reports the average, min/max sample means, and standard deviation.

Local baseline recorded on 2026-05-19 with
`RIVET_RUNTIME_BENCH_ITERATIONS=200` and
`RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=20` and
`RIVET_RUNTIME_BENCH_SAMPLES=5`:

| Case | Mean ms | Std dev ms |
| --- | ---: | ---: |
| `runGraphInFile` passthrough one-shot | `1.075` | `0.064` |
| Load once plus `runGraph` passthrough | `0.114` | `0.008` |
| Reuse `createProcessor` passthrough | `0.083` | `0.009` |
| Direct `GraphProcessor` text chain 20 | `0.500` | `0.059` |
| `runGraph` text chain 20 | `0.510` | `0.008` |
| `runGraph` text chain 100 | `3.098` | `0.092` |
| `runGraph` text chain 500 | `35.175` | `1.075` |
| `runGraph` Expression chain 20 | `2.955` | `0.071` |
| `runGraph` Code chain 20 | `10.391` | `0.363` |
| Lazy preprocess/dependency text chain 500 | `27.297` | `1.702` |
| `NodeCodeRunner` compile/run one snippet | `0.001` | `0.000` |

### P1: Reusable Headless Node Runner (DONE)

Add `createGraphRunner(project, options)` in `@valerypopoff/rivet2-node`.
Do not add `runtimeProfile` to broad core `RunGraphOptions` yet.

```ts
const runner = createGraphRunner(project, {
  graph: "main",
  runtimeProfile: "headless-fast",
});

const outputs = await runner.run({
  inputs,
  context,
  abortSignal,
});
```

Creation-time options are fixed:

- graph selection
- registry/plugin setup
- native providers
- code runner
- tokenizer
- project path and project-reference loader
- settings defaults and plugin env
- trace/event policy

Per-run options may vary:

- inputs
- context values
- abort signal

Implementation notes:

- The runner must convert loose `inputs` and `context` per run. It cannot rely
  on `coreCreateProcessor(...).run()` because that helper captures inputs and
  context at creation time.
- Reuse stable Node defaults inside the runner rather than constructing them on
  every run.
- Preserve concurrent endpoint behavior. If one runner receives overlapping
  `run(...)` calls, use separate run-scoped processors or a processor lease
  rather than sharing one running `GraphProcessor`.
- Keep existing `runGraph(...)`, `runGraphInFile(...)`, and `createProcessor(...)`
  behavior unchanged.
- Remote Debugger, recording, SSE/event consumers, editor run-from, and Browser
  mode should continue to use the compatible APIs first.

Expected payoff:

- Meaningful reduction for repeated backend runs even before changing core
  scheduling.
- Low risk because it is additive and can initially delegate to the existing
  `GraphProcessor.processGraph(...)` execution path.

Implementation status:

- Added `createGraphRunner(project, options)` to
  [`packages/node/src/api.ts`](packages/node/src/api.ts).
- The runner resolves stable Node runtime setup at creation, converts loose
  `inputs` and `context` per run, and treats `abortSignal` as run-scoped.
- `runtimeProfile` is accepted on the runner API. At this P1 point, both
  profiles kept the compatible `GraphProcessor` execution path, and the
  `headless-fast` profile owned only runner-specific Code-family acceleration
  as described in P2. Later phases added cached planning and the narrow
  fast-acyclic scheduler for eligible `headless-fast` runs.
- Each run uses a run-scoped `GraphProcessor` so mutable processor state,
  including Global node values, cannot leak between backend requests.
- Added focused runner coverage in
  [`packages/node/test/graphRunner.test.ts`](packages/node/test/graphRunner.test.ts)
  for per-run inputs/context, overlapping runs, abort signals, disposal, and
  Global node isolation.
- Added `createGraphRunner` to the public equivalence guards and runtime
  benchmark cases.
- The original P0 baseline above is intentionally preserved. After P1, the same
  averaged benchmark shape was rerun on 2026-05-19 with
  `RIVET_RUNTIME_BENCH_ITERATIONS=200`,
  `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=20`, and
  `RIVET_RUNTIME_BENCH_SAMPLES=5`:

| Case | Mean ms | Std dev ms |
| --- | ---: | ---: |
| `runGraphInFile` passthrough one-shot | `0.964` | `0.062` |
| Load once plus `runGraph` passthrough | `0.117` | `0.016` |
| Reuse `createProcessor` passthrough | `0.074` | `0.007` |
| `createGraphRunner` passthrough | `0.084` | `0.008` |
| Direct `GraphProcessor` text chain 20 | `0.469` | `0.054` |
| `runGraph` text chain 20 | `0.508` | `0.045` |
| `runGraph` text chain 100 | `2.918` | `0.055` |
| `runGraph` text chain 500 | `32.908` | `0.464` |
| `createGraphRunner` text chain 500 | `33.171` | `0.468` |
| `runGraph` Expression chain 20 | `2.716` | `0.046` |
| `runGraph` Code chain 20 | `9.396` | `0.069` |
| Lazy preprocess/dependency text chain 500 | `25.280` | `0.130` |
| `NodeCodeRunner` compile/run one snippet | `0.001` | `0.000` |

P1 keeps a useful public fast-path seam and is slightly faster than
loaded-project `runGraph` for the tiny passthrough case, but it is intentionally
close to existing compatible execution because each run uses a fresh
`GraphProcessor` to avoid state leaks. Larger cheap graphs still point to cached
graph planning/preprocessing as the next substantial speed target.

### P2: Cached Headless Node CodeRunner (DONE)

Add a cached Node CodeRunner for headless Node execution.

The current `NodeCodeRunner` recompiles an `AsyncFunction` on every Code or
Expression execution. Cache compiled functions by:

- source code
- argument list / permission shape
- presence of graph inputs and context arguments
- whether `Rivet` is included

Keep these compatibility rules:

- never cache outputs
- never cache input values
- keep local variables fresh per invocation
- preserve `require`, `process`, `fetch`, `console`, and `Rivet` permission
  behavior
- preserve stack/source diagnostics as much as possible
- keep `includeRivet` loading behavior compatible

Expose it through `createGraphRunner(..., { runtimeProfile: "headless-fast" })`.
Keep the existing explicit `codeRunner` option as the compatibility escape
hatch, but do not make the cached runner a new public API in the first pass. Do
not apply this to the app-executor worker isolation path in the first pass.

Expected payoff:

- Localized win for Code/Expression-heavy headless workflows where JavaScript
  compilation is visible compared with graph orchestration.
- Localized implementation and test surface compared with a scheduler rewrite.

Implementation status:

- Added a cached Node CodeRunner for the `headless-fast` profile in
  [`packages/node/src/native/CachedNodeCodeRunner.ts`](packages/node/src/native/CachedNodeCodeRunner.ts).
- `createGraphRunner(..., { runtimeProfile: 'headless-fast' })` now uses the
  cached runner when the caller does not provide an explicit `codeRunner`.
- The default `NodeCodeRunner` used by `runGraph(...)`,
  `createProcessor(...)`, and compatible runners remains uncached.
- The cache keys compiled functions by the existing source string and injected
  argument shape. It does not cache inputs, graph inputs, context values, or
  outputs, and every function invocation still gets fresh local variables.
- The runner-owned cache is cleared when `runner.dispose()` is called.
- `Code` and `Code (legacy)` now append stable per-node source URLs rather than
  per-process source URLs so repeated backend runs can reuse compiled functions
  while keeping line/column error enrichment.
- Added direct cache coverage in
  [`packages/node/test/cachedNodeCodeRunner.test.ts`](packages/node/test/cachedNodeCodeRunner.test.ts)
  and added `createGraphRunner` `headless-fast` to the public equivalence
  guards.
- Benchmarks were rerun on 2026-05-19 with the same averaged shape:
  `RIVET_RUNTIME_BENCH_ITERATIONS=200`,
  `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=20`, and
  `RIVET_RUNTIME_BENCH_SAMPLES=5`. A reassessment pass added direct
  compatible-runner comparison rows for Code and Expression chains so
  `headless-fast` is compared against the same runner API shape.

| Case | Mean ms | Std dev ms |
| --- | ---: | ---: |
| `runGraphInFile` passthrough one-shot | `1.143` | `0.051` |
| Load once plus `runGraph` passthrough | `0.132` | `0.012` |
| Reuse `createProcessor` passthrough | `0.107` | `0.006` |
| `createGraphRunner` passthrough | `0.119` | `0.009` |
| Direct `GraphProcessor` text chain 20 | `0.771` | `0.059` |
| `runGraph` text chain 20 | `0.623` | `0.041` |
| `runGraph` text chain 100 | `3.425` | `0.138` |
| `runGraph` text chain 500 | `35.352` | `1.062` |
| `createGraphRunner` text chain 500 | `36.267` | `1.487` |
| `runGraph` Expression chain 20 | `2.866` | `0.037` |
| `createGraphRunner` compatible Expression chain 20 | `2.984` | `0.127` |
| `createGraphRunner` headless-fast Expression chain 20 | `2.785` | `0.052` |
| `runGraph` Code chain 20 | `6.655` | `0.184` |
| `createGraphRunner` compatible Code chain 20 | `6.584` | `0.142` |
| `createGraphRunner` headless-fast Code chain 20 | `6.741` | `0.083` |
| Lazy preprocess/dependency text chain 500 | `28.836` | `2.306` |
| `NodeCodeRunner` compile/run one snippet | `0.002` | `0.001` |
| `CachedNodeCodeRunner` run cached snippet | `0.001` | `0.000` |

P2 is behaviorally safe, but direct runner comparisons show only a small
Expression-chain win and no reliable Code-chain graph-level win in this run.
The rounded microbenchmark shows the cached runner itself is cheaper for a
single snippet, but JavaScript compilation is already very small compared with
whole-graph orchestration for these fixtures. The next substantial speed target
remains cached immutable graph planning and dependency data rather than more
CodeRunner work.

### P3: Cached Immutable Graph Plan And Adjacency Maps (DONE)

Add a reusable graph execution plan for immutable headless runner snapshots.

The plan should contain:

- nodes by id
- validated connections
- port definitions
- input connections by node/port
- output connections by node/port
- input nodes by node
- output nodes by node
- missing-required-input metadata
- start/output node sets
- SCC/cycle data

Use the cached plan inside the existing `GraphProcessor` /
`NodeExecutionPlanner` model before building a new scheduler. The first win
should be fewer repeated array scans and less repeated preprocessing, while
preserving the current execution semantics.

Important constraints:

- Cache only for immutable project snapshots.
- Treat graph edits, registry/plugin changes, settings that affect node
  definitions, or project-reference changes as requiring a new runner.
- Do not share `NodeImpl` runtime instances between runs. Built-in nodes are
  currently instance-stateless, but custom registries should keep compatible
  fresh-instance semantics.
- Cache only post-validation connection maps and treat them as read-only during
  execution.
- Keep compatible execution as the fallback for editor workflows and dynamic
  project-reference scenarios.

Expected payoff:

- Stronger win for many cheap nodes where preprocessing and planner scans are a
  visible part of total runtime.
- Lower risk than replacing the scheduler outright.

Implementation status:

- `preprocessGraphState(...)` now returns a graph execution plan with validated
  connection maps, input/output adjacency, missing-required-input lists, start
  nodes, SCC metadata, and cycle indexes.
- `NodeExecutionPlanner` consumes those precomputed maps when the processor has
  a plan and keeps its previous array-scan fallback for compatible paths.
- `GraphProcessor` accepts an internal runtime cache. It reuses graph-keyed
  cached plans and loaded project-reference snapshots when provided, while still
  rebuilding all mutable run state and fresh `NodeImpl` instances for every
  `processGraph(...)` call.
- `createGraphRunner(..., { runtimeProfile: 'headless-fast' })` owns that cache
  across its run-scoped processors and passes it into subprocessors, so
  subgraph, call-graph, loop, cron, tool-delegation, and referenced-graph calls
  can reuse their own immutable plans. `compatible`, `runGraph(...)`,
  `createProcessor(...)`, Browser/editor execution, Remote Debugger,
  recordings, and app-executor runs keep the existing per-run preprocessing
  path.
- The cache is scoped to the runner's immutable project/registry/settings
  snapshot and is cleared on `runner.dispose()`.
- Added coverage proving the fast profile reuses definition/planner work while
  still instantiating fresh node implementations per run.
- Benchmarks were rerun on 2026-05-19 after the subprocessor cache reassessment
  with
  `RIVET_RUNTIME_BENCH_ITERATIONS=200`,
  `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=20`, and
  `RIVET_RUNTIME_BENCH_SAMPLES=5`.

| Case | Mean ms | Std dev ms |
| --- | ---: | ---: |
| `runGraphInFile` passthrough one-shot | `1.052` | `0.050` |
| Load once plus `runGraph` passthrough | `0.127` | `0.004` |
| Reuse `createProcessor` passthrough | `0.091` | `0.009` |
| `createGraphRunner` passthrough | `0.102` | `0.005` |
| Direct `GraphProcessor` text chain 20 | `0.563` | `0.066` |
| `runGraph` text chain 20 | `0.586` | `0.013` |
| `runGraph` text chain 100 | `3.700` | `0.167` |
| `runGraph` text chain 500 | `39.811` | `0.616` |
| `createGraphRunner` text chain 500 | `39.698` | `0.417` |
| `createGraphRunner` headless-fast text chain 500 | `9.778` | `0.208` |
| `createGraphRunner` compatible subgraph chain 50 | `12.813` | `0.343` |
| `createGraphRunner` headless-fast subgraph chain 50 | `11.365` | `0.334` |
| `runGraph` Expression chain 20 | `3.321` | `0.068` |
| `createGraphRunner` compatible Expression chain 20 | `3.088` | `0.042` |
| `createGraphRunner` headless-fast Expression chain 20 | `2.901` | `0.025` |
| `runGraph` Code chain 20 | `7.552` | `0.066` |
| `createGraphRunner` compatible Code chain 20 | `7.672` | `0.064` |
| `createGraphRunner` headless-fast Code chain 20 | `8.147` | `0.962` |
| Lazy preprocess/dependency text chain 500 | `30.209` | `0.375` |
| `NodeCodeRunner` compile/run one snippet | `0.001` | `0.000` |
| `CachedNodeCodeRunner` run cached snippet | `0.001` | `0.000` |

P3 delivered the first large runtime win in the benchmark suite: the 500-node
text chain dropped from `39.698ms` with the compatible runner to `9.778ms` with
the `headless-fast` runner. A reassessment pass kept cached planning but changed
fast runs back to fresh `NodeImpl` instances, preserving safer custom-node
instance semantics without losing the measured win. A second reassessment pass
found that subprocessors were still on the compatible preprocessing path, so the
runtime cache was changed from one root plan to graph-keyed plans and passed
into child processors. A permanent 50-subgraph chain benchmark now measured
`12.813ms` compatible versus `11.365ms` `headless-fast`, confirming the nested
cache helps without changing the larger 500-node root-graph result. This latest
run was slower than the previous P3 run across most cases, so compare relative
wins more than absolute milliseconds. Small 20-node Code/Expression fixtures are
still mostly dominated by node work and benchmark noise, so P4 should only be
pursued if large cheap DAGs still need more speed after this cache.

Follow-up scheduler-decision benchmark coverage was rerun on 2026-05-19 with
the same averaged run shape. This pass added permanent wide fan-in and mixed
subgraph fan-in rows to check whether a strict fast acyclic scheduler has a
clear enough target after P3:

| Case | Mean ms | Std dev ms |
| --- | ---: | ---: |
| `runGraphInFile` passthrough one-shot | `0.977` | `0.048` |
| Load once plus `runGraph` passthrough | `0.109` | `0.004` |
| Reuse `createProcessor` passthrough | `0.079` | `0.008` |
| `createGraphRunner` passthrough | `0.086` | `0.003` |
| Direct `GraphProcessor` text chain 20 | `0.468` | `0.054` |
| `runGraph` text chain 20 | `0.505` | `0.019` |
| `runGraph` text chain 100 | `2.940` | `0.090` |
| `runGraph` text chain 500 | `33.426` | `0.312` |
| `createGraphRunner` text chain 500 | `33.163` | `0.215` |
| `createGraphRunner` headless-fast text chain 500 | `7.972` | `0.128` |
| `createGraphRunner` compatible subgraph chain 50 | `10.112` | `0.257` |
| `createGraphRunner` headless-fast subgraph chain 50 | `9.084` | `0.153` |
| `createGraphRunner` compatible wide fan-in 200 | `22.578` | `0.748` |
| `createGraphRunner` headless-fast wide fan-in 200 | `4.798` | `0.054` |
| `createGraphRunner` compatible mixed subgraph fan-in | `8.947` | `0.174` |
| `createGraphRunner` headless-fast mixed subgraph fan-in | `7.194` | `0.223` |
| `runGraph` Expression chain 20 | `3.296` | `0.065` |
| `createGraphRunner` compatible Expression chain 20 | `3.179` | `0.126` |
| `createGraphRunner` headless-fast Expression chain 20 | `3.007` | `0.030` |
| `runGraph` Code chain 20 | `7.311` | `0.924` |
| `createGraphRunner` compatible Code chain 20 | `6.268` | `0.041` |
| `createGraphRunner` headless-fast Code chain 20 | `6.118` | `0.032` |
| Lazy preprocess/dependency text chain 500 | `25.717` | `0.539` |
| `NodeCodeRunner` compile/run one snippet | `0.001` | `0.000` |
| `CachedNodeCodeRunner` run cached snippet | `0.001` | `0.000` |

The clearest wins are for large, cheap, repeated backend runs through
`createGraphRunner(..., { runtimeProfile: 'headless-fast' })`:

| Scenario | Compatible runner | `headless-fast` runner | Win |
| --- | ---: | ---: | ---: |
| 500 cheap Text-node chain | `33.163ms` | `7.972ms` | `4.2x`, `76%` less time |
| 200-branch wide fan-in | `22.578ms` | `4.798ms` | `4.7x`, `79%` less time |
| Mixed subgraph fan-in | `8.947ms` | `7.194ms` | `1.24x`, `20%` less time |
| 50 chained subgraphs | `10.112ms` | `9.084ms` | `1.11x`, `10%` less time |
| 20 Expression nodes | `3.179ms` | `3.007ms` | `1.06x`, `5%` less time |
| 20 Code nodes | `6.268ms` | `6.118ms` | `1.02x`, `2%` less time |

For Rivet users, this means programmatic Node integrations that load a project
once and run the same workflow many times can be substantially faster when the
workflow is made of many cheap nodes, long chains, or wide fan-out/fan-in
sections. Tiny workflows were already very fast and do not move much. LLM,
HTTP, database, and other external-call-heavy workflows usually will not see
large end-to-end gains because network/provider time dominates the graph
orchestration overhead. Editor, Browser, Remote Debugger, recording, and other
observable execution modes intentionally stay on the compatible path unless
they are explicitly moved later.

### P4: Broad Strict Fast Acyclic Scheduler (DEFERRED)

Do not implement a broad scheduler rewrite as the next runtime-speed step. The
current benchmark data shows that cached immutable graph planning already
delivers the substantial reusable-runner win on the scheduler-heavy fixtures we
have measured. A separate scheduler for all graph shapes should stay as a future
evidence-gated project, not active work.

Only reconsider a new scheduler if a real workflow or benchmark shows
`headless-fast` remains substantially slow after cached planning and the
remaining bottleneck is scheduler orchestration rather than node execution,
subgraph overhead, Code/LLM/HTTP latency, data size, or output rendering.

Eligibility should be intentionally narrow:

- acyclic graph
- no loop/race/split-run behavior
- no user-input/wait-event pause semantics
- no preloaded editor run-from/run-to state
- no recording or Remote Debugger event requirements
- no unsupported subprocess behavior

The scheduler can use ready-count scheduling over the cached adjacency plan, but
must preserve:

- graph outputs
- thrown errors
- control-flow exclusion
- required-input exclusion
- abort behavior
- node concurrency limits

Fallback to compatible `GraphProcessor` must be automatic for unsupported graph
features.

Decision after the permanent P3 and follow-up orchestration benchmark passes:

- Do not implement P4 now.
- The 500-node cheap graph already has a large `headless-fast` win from cached
  planning, and the nested, wide fan-in, and mixed subgraph fan-in rows now
  confirm the graph-keyed plan cache helps the main scheduler-heavy shapes too.
- A broad scheduler still may be worthwhile for very large cheap acyclic DAGs,
  but it should be justified by a benchmark where `headless-fast` remains
  substantially slower after cached planning. Until then, its semantic risk is
  higher than its proven incremental payoff.
- P5 introduced a narrow internal ready-queue scheduler only for eligible
  `headless-fast` Node runs. That is not the broad P4 rewrite: it falls back for
  cycles, split-run, trace, preloaded/run-to, loop, race, user-input, and
  wait-event graphs, and still uses normal node processing/event methods.

Expected payoff:

- Potentially large for big cheap-node DAGs.
- High effort and higher semantic risk, so it is not a first implementation
  target.

### P5: Single-Run Fast CreateProcessor (DONE)

Add `runtimeProfile: 'headless-fast'` to the Node package
`createProcessor(...)` API only if it makes a fresh processor's first and only
`run()` faster. This is the wrapper endpoint target: each request creates one
processor, passes request inputs/context at creation time, runs once, and
discards the processor.

This phase must not depend on cache state from previous endpoint requests or
previous processor runs. Processor-owned caches can still be used as temporary
intra-run implementation details, but the benchmark must measure the cold
single-run path.

Implementation shape:

- Add fresh-processor benchmark rows before implementation:
  `createProcessor(...).run()` compatible versus proposed `runtimeProfile:
  'headless-fast'`, creating a new processor inside each measured iteration.
- Keep `NodeRunGraphOptions` compatible and without `runtimeProfile`, so
  `runGraph(...)` stays unchanged unless a separate future API decision is
  made.
- Add a Node-only `NodeCreateProcessorOptions = NodeRunGraphOptions & {
  runtimeProfile?: 'compatible' | 'headless-fast' }`.
- Change Node `createProcessor(project, options)` to accept
  `NodeCreateProcessorOptions`.
- In the initial P5 rollout, keep omitted `runtimeProfile` and
  `'compatible'` behavior equivalent to the old compatible path. P8 is the
  later step that changes omitted `runtimeProfile` to the default-safe policy.
- When `runtimeProfile` is `'headless-fast'`, optimize work inside the same
  `GraphProcessor.processGraph(...)` call:
  - build and use execution-plan maps during that run so scheduling does not
    repeatedly scan connection/definition arrays;
  - reduce `PQueue` and ready-node orchestration overhead for eligible graph
    shapes only if ProcessEvents, errors, aborts, control-flow exclusion, and
    graph outputs stay equivalent;
  - avoid extra setup that is only valuable for cross-run caching.
- Custom `codeRunner` must still win. The wrapper passes `ManagedCodeRunner`,
  so Node's cached CodeRunner is not an endpoint speed answer unless that custom
  runner gets its own one-run improvement.
- If `remoteDebugger !== undefined`, attach the Remote Debugger exactly as
  today and ignore `runtimeProfile: 'headless-fast'` for that processor. Remote
  Debugger runs must use compatible execution until that event/debugger surface
  is deliberately designed and tested for the fast path.
- Recording must remain event-compatible. Since `ExecutionRecorder` attaches to
  the returned processor after creation, `headless-fast` cannot silently skip,
  reorder, or reshape process events.

Expected payoff:

- Potentially substantial for fresh endpoint requests that execute large cheap
  DAGs where scheduler/preprocessing overhead dominates.
- Smaller for tiny workflows that are already sub-millisecond to low-millisecond.
- Usually small for LLM/HTTP/database-heavy workflows because external latency
  dominates graph orchestration.
- No claimed wrapper benefit from repeated-processor or cross-request caching in
  this phase.

Implementation status:

- Added `NodeCreateProcessorOptions` with `runtimeProfile?: 'compatible' |
  'headless-fast'`.
- `remoteDebugger !== undefined` forces compatible execution even when
  `headless-fast` is present.
- Fast `createProcessor(...)` uses run-scoped graph-plan/reference caches and a
  run-scoped cached Node CodeRunner only when no custom `codeRunner` is passed.
  Caches are cleared before and after `run()`.
- Added a narrow `fast-acyclic` scheduler for eligible headless runs. It uses a
  ready queue from source nodes but delegates node processing, exclusions,
  events, subgraph creation, and output handling to existing `GraphProcessor`
  methods.
- Fixed a broader single-run preprocessor bottleneck: valid graphs no longer
  scan every connection bucket for invalid-connection cleanup when the current
  node found no invalid connections.
- Follow-up hardening removed the same shape of accidental repeated scans from
  invalid-connection cleanup, execution-plan output grouping, and the compatible
  `NodeExecutionPlanner` fallback path. Invalid port connections are now removed
  only from their endpoint buckets, and wide fan-out output grouping is built in
  one pass.
- Added repeated-subgraph benchmark fixtures for both same-input and
  changing-input calls to the same subgraph.

Local measurement after P5 and the follow-up scan cleanup on 2026-05-19 with
`RIVET_RUNTIME_BENCH_ITERATIONS=100`,
`RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=10`, and
`RIVET_RUNTIME_BENCH_SAMPLES=3`:

| Scenario | Compatible | `headless-fast` | Win |
| --- | ---: | ---: | ---: |
| Fresh `createProcessor` text chain 500 | `12.573ms` | `9.891ms` | `1.27x`, `21.3%` less time |
| Fresh repeated subgraph same-input 50 | `13.804ms` | `10.107ms` | `1.37x`, `26.8%` less time |
| Fresh repeated subgraph changing-input 50 | `11.601ms` | `10.364ms` | `1.12x`, `10.7%` less time |
| `runGraph` text chain 500 before/after preprocessor cleanup | `35.043ms` pre-cleanup | `9.271ms` post-cleanup | `3.78x`, `73.5%` less time |
| Lazy preprocess/dependency text chain 500 before/after cleanup | `26.931ms` pre-cleanup | `1.475ms` post-cleanup | `18.3x`, `94.5%` less time |

The follow-up scan cleanup also changed the 200-branch reusable-runner wide
fan-in row from the earlier `22.578ms` compatible / `4.798ms` fast measurement
to `7.569ms` compatible / `3.088ms` fast. That confirms the issue was not only
in the fast profile: the compatible planner fallback also had accidental
repeated scans that matter for wide graphs.

The broadest endpoint win came from the compatible preprocessor cleanup, so
callers benefit even without opting into `runtimeProfile`. The fast
`createProcessor` profile is still useful for eligible acyclic and repeated
subgraph runs, but not every graph reaches the `20%` target from the profile
alone.

### P6: Default-Fast Compatibility Characterization (DONE)

Before making `createProcessor(...)` use the fast profile by default, prove that
the remaining fast-only behavior is not just output-equivalent, but compatible
with the observable surfaces endpoint wrappers can still care about.

This phase does not change defaults. It adds characterization coverage and
records which parts of `headless-fast` are safe to promote automatically.

What to test:

- Process event order and payload parity for compatible versus `headless-fast`
  `createProcessor(...).run()`:
  - linear chains;
  - branching DAGs;
  - wide fan-in DAGs;
  - same-source fan-in where one source feeds multiple target input ports;
  - missing-required-input exclusion;
  - control-flow exclusion;
  - subgraph chains;
  - repeated same-input subgraph calls;
  - async nodes;
  - thrown node errors;
  - aborts.
- `ExecutionRecorder` parity for successful and failed runs, including replay
  project data, serialized event shape, output visibility, and error metadata.
- Explicit callback behavior for `onNodeStart`, `onNodeFinish`, `onNodeError`,
  `onNodeExcluded`, `onGraphStart`, `onGraphFinish`, `onGraphError`,
  `onPartialOutput`, `onAbort`, `onGraphAbort`, `onDone`, and `onTrace`.
- Project-reference loader behavior with:
  - stable referenced projects;
  - repeated references to the same project inside one run;
  - references whose loader has observable call counts;
  - loader failures.
- Code/Expression behavior with the default Node runner:
  - syntax errors;
  - runtime errors;
  - stack/error messages;
  - permitted `require`, `process`, `fetch`, `console`, and `Rivet` access;
  - no global/local state leakage between nodes or runs.
- Fallback behavior for graphs that must stay compatible:
  - Remote Debugger present;
  - trace mode requested;
  - run-to/preloaded editor state;
  - loops;
  - races;
  - split-run;
  - user input;
  - wait-event.

Wrapper runtime questions to answer before P7/P8:

- Processor lifecycle:
  - Does each endpoint request create one fresh `createProcessor(...)`, run it
    once, and discard it?
  - Is any processor object reused across endpoint calls or run concurrently?
  - Are published endpoints, latest endpoints, local/dev endpoints, and replay
    endpoints all using the same execution path?
  - Does any wrapper path use `runGraph(...)`, `createGraphRunner(...)`, or
    direct `GraphProcessor` instead of `createProcessor(...)`?
- Exact `createProcessor(...)` options:
  - Which options are always passed?
  - Which options are conditional per endpoint kind?
  - Does the wrapper pass `codeRunner`, `datasetProvider`,
    `projectReferenceLoader`, `remoteDebugger`, `remoteDebuggerRequestId`,
    `context`, `inputs`, `tokenizer`, `registry`, `nativeApi`, `mcpProvider`,
    `audioProvider`, `getChatNodeEndpoint`, `editorExecutionCache`, event
    callbacks, settings, or provider config?
  - Are any options mutated after processor creation?
- Remote Debugger:
  - Which endpoint modes can attach `remoteDebugger`?
  - Are published endpoints always debugger-free?
  - Are latest endpoints debugger-enabled only behind a feature flag?
  - Does the wrapper rely on exact debugger event order, timing, request ids, or
    graph/node lifecycle payloads?
  - Can a run be recorded while a Remote Debugger is attached?
  - Should `remoteDebugger !== undefined` always force compatible execution, or
    are there wrapper cases where a debugger object exists but no client is
    attached?
- Recordings and replay:
  - When are `ExecutionRecorder` instances attached relative to
    `processor.run()`?
  - Are successful, failed, and aborted runs all recorded?
  - Does the wrapper record partial outputs, and is that controlled by env?
  - Which recorder fields are used by the editor replay UI?
  - Do recordings need strict event ordering parity or only final visible output
    parity?
  - Are failed node outputs, caught node errors, and thrown graph errors all
    expected to replay exactly as live editor execution would show them?
- Project loading and mutability:
  - Are project objects cloned per request or reused by reference from a cache?
  - Can Rivet execution mutate the project object, graph object, nodes, or
    connections in a way that could leak between requests?
  - How are filesystem and managed project/materialization caches invalidated?
  - Can referenced projects change independently while the server process is
    running?
  - Does the wrapper provide a custom reference loader, and can it have
    side effects or dynamic results inside one run?
- Custom Code/Expression execution:
  - Does the wrapper pass a custom `codeRunner`?
  - Does that runner use `AsyncFunction`, workers, VM contexts, or another
    isolation mechanism?
  - Can workflow code rely on `require`, module cache, globals, `process`,
    `fetch`, filesystem access, runtime libraries, or other side effects?
  - Are stack traces, error names, and error messages part of the endpoint or
    recording contract?
  - Is it acceptable for default-fast mode to skip Node's cached CodeRunner when
    a custom runner is present?
- Inputs, context, settings, and providers:
  - Are `inputs` and `context` passed only at processor creation time?
  - Do request body, headers, auth data, datasets, provider settings, API keys,
    plugin env, or process env vary per request?
  - Which settings must take effect immediately without restarting the wrapper?
  - Are dataset/provider objects request-scoped or shared across concurrent
    requests?
  - Can providers observe call order or call counts?
- Graph feature usage:
  - Do production workflows commonly use subgraphs, project references, loops,
    races, split-run, user input, wait-event, raise-event, globals, or external
    functions?
  - Are repeated calls to the same subgraph common, with same inputs, different
    inputs, or both?
  - Are LLM/chat nodes with streaming or partial outputs common?
  - Are long-running HTTP/LLM/database nodes dominant, or are tiny/cheap
    workflows a real endpoint workload?
- Concurrency, aborts, and timeouts:
  - Can multiple requests run the same project concurrently?
  - Can multiple requests share the same cached project object by reference?
  - How are request aborts, server timeouts, client disconnects, and wrapper
    shutdown propagated into Rivet processors?
  - Does the wrapper expect deterministic behavior when an abort races with node
    completion?
- Endpoint response contract:
  - Do consumers receive only final outputs, or any live event stream?
  - How are output values serialized, especially `undefined`, binary/large
    values, errors, and attached data?
  - How are graph errors mapped to HTTP status and response body?
  - Do consumers or tests depend on exact error message text or cause chains?
- Fallback and rollout controls:
  - Can the wrapper pass `runtimeProfile: 'compatible'` globally as a rollback?
  - Can it choose a fast/default policy per endpoint kind, project, or workflow
    revision?
  - Are there immutable published revisions where default-fast is acceptable
    earlier than latest/live filesystem workflows?
  - Is there telemetry for tiny workflows, Code/Expression-heavy workflows,
    subgraph-heavy workflows, and external-call-heavy workflows?
  - What wrapper-level benchmarks or golden recordings should be run before
    enabling omitted-`runtimeProfile` default-fast behavior?

Wrapper answers and default-fast implications:

- Endpoint processor lifecycle is ideal for single-run optimization:
  endpoints create one fresh `createProcessor(...)`, call `run()` once, and
  discard the processor. The wrapper does not use `runGraph(...)`,
  `createGraphRunner(...)`, or direct `GraphProcessor` for endpoint execution.
- Replay is not a server-side graph run. It reads stored recording artifacts and
  opens them in the editor, so replay risk comes from recorder event shape, not
  from `createProcessor(...)` being called during replay.
- The wrapper always passes a request-scoped custom `ManagedCodeRunner`,
  `datasetProvider`, `projectReferenceLoader`, `context`, and `inputs`.
  Therefore default-fast must never bypass the custom runner, and the default
  Node cached CodeRunner is not a wrapper endpoint win unless the wrapper stops
  passing a custom runner.
- Published and internal published endpoints pass `remoteDebugger: undefined`.
  Latest endpoints may pass the latest-debugger object, and that object can
  exist even when no websocket client is attached. Keep
  `remoteDebugger !== undefined` as a hard compatible fallback.
- Latest runs can be recorded while Remote Debugger is attached. Recorder and
  debugger attachments are independent, so any future fast debugger work must
  prove both surfaces together. It is not enough to test debugger-only or
  recorder-only behavior.
- `ExecutionRecorder.record(processor.processor)` is called before
  `processor.run()`. Successful, failed, and suspicious runs are recorded.
  Partial-output recording is controlled by
  `RIVET_RECORDINGS_INCLUDE_PARTIAL_OUTPUTS` and defaults to `false`.
  Recording replay consumes the full deserialized recorder, so event order and
  shape are a hard compatibility gate for defaulting the scheduler.
- Endpoint HTTP consumers receive only final JSON output. The main `any` output
  path returns `output.value ?? null`, so JavaScript `undefined` becomes `null`
  in that response shape. This makes final HTTP response parity necessary but
  not sufficient; recorder replay still needs stricter parity.
- Filesystem mode can reuse a cached parsed `Project` object by reference across
  concurrent requests. Managed mode reparses fresh project objects from cached
  revision contents. Before default-fast, add project immutability guards around
  endpoint-style execution so Rivet does not mutate graph/project/node objects
  in a way that can leak through filesystem caches.
- Referenced projects can change independently. The wrapper's custom reference
  loader is request-scoped, can read filesystem or managed storage, can fill
  local caches, and can return dynamic results across calls if underlying
  projects change. Do not default loaded-project reference caching when a custom
  `projectReferenceLoader` is present until call-count and freshness behavior
  are explicitly accepted.
- Request body, headers, auth context, datasets, project settings, publication
  state, managed revisions, and active managed runtime-library release may vary
  between requests. Dataset provider, reference loader, code runner, recorder,
  and processor are request-scoped; storage caches and latest debugger singleton
  are shared.
- Request abort/client disconnect is not currently wired into processor abort.
  Abort parity remains important for public Node APIs, but it is not the first
  wrapper default-fast gate.
- Multiple requests can run the same project concurrently. In filesystem mode
  they can share the same cached project object by reference, so default-fast
  tests must include concurrent same-project calls.
- Production graph feature telemetry is not available. The wrapper does not
  restrict subgraphs, references, loops, races, split-run, globals, external
  functions, LLM/chat streaming, or partial outputs. The fast default must rely
  on feature-detection fallback instead of usage assumptions.
- Best early rollout candidates are immutable managed published revisions and
  filesystem published snapshots. Latest/live filesystem workflows are riskier
  because they can attach Remote Debugger and represent changing project state.
- The wrapper can add `runtimeProfile: 'compatible'` globally as a rollback and
  can choose policy by endpoint kind, project, or revision. Treat this rollback
  as a release requirement before a hosted wrapper consumes the omitted-default
  behavior.
- Wrapper-level validation before a deployed wrapper rollout should include
  endpoint integration tests, latest-debugger tests, recording/replay tests,
  filesystem and managed cache invalidation tests, concurrent same-workflow
  calls, a tiny-workflow benchmark, a Code-node/runtime-library fixture, a
  project-reference fixture, and golden recordings for success, failure,
  partial-output, and subgraph cases.

Implementation result:

- Added
  [`packages/node/test/defaultFastCompatibility.test.ts`](packages/node/test/defaultFastCompatibility.test.ts)
  as the P6 characterization suite for Node `createProcessor(...)`. The suite
  compares explicit compatible and explicit `headless-fast` runs for final
  outputs, callback-visible graph/node events, serialized recorder event shape,
  partial-output callbacks, user-input callbacks, global-set events, raised
  user events, runtime and syntax errors, aborts, async nodes, exclusions, Code
  and Expression nodes, wide fan-in DAGs, same-source fan-in DAGs, subgraph
  chains, repeated same-input subgraphs, and mixed subgraph fan-in.
- The suite proves custom `codeRunner` ownership is preserved under
  `headless-fast`: custom runners are still called for Code-family nodes, and
  the Node cached CodeRunner is not used when a custom runner is present.
- The suite proves `includeTrace: true` and `remoteDebugger !== undefined`
  remain on the compatible observable path when `headless-fast` is requested.
- The suite proves project-reference loader failures reject equivalently, and
  concurrent endpoint-style fast runs over the same shared project object do not
  mutate the project.
- The suite intentionally compares recorder events after serialize/deserialize.
  That matches replay reality and avoids pretending JSON can preserve
  `undefined` object properties such as `control-flow-excluded.value`.
- The suite treats Subgraph node `duration` outputs as timing-dependent values.
  Exact numeric duration parity is not a useful correctness signal because the
  value naturally changes with scheduler speed and machine timing. If a workflow
  consumes duration as a business value, changing execution speed can change that
  value even when node semantics are otherwise equivalent.
- The suite documents one concrete blocker for defaulting the full
  `headless-fast` profile: loaded-project reference caching changes observable
  custom `projectReferenceLoader` call counts inside one run. Compatible mode
  can call the loader again for subprocessors, while `headless-fast` reuses the
  loaded snapshot through the run-scoped runtime cache. Do not default that
  cache when a custom `projectReferenceLoader` is present unless the wrapper
  accepts the call-count/freshness contract or the runtime falls back
  automatically.

Acceptance criteria:

- If only output equivalence holds, keep `headless-fast` opt-in.
- If outputs, callback-visible events, recorder replay, errors, aborts, and
  reference loading are equivalent for eligible graphs, move to P7 with those
  pieces eligible for defaulting. If one surface differs, P7 must split it out
  behind an explicit profile or an automatic fallback.
- Any intentional difference must be documented as a blocker or guarded by an
  automatic fallback.
- Do not let a hosted wrapper consume the omitted-default policy without
  custom `ManagedCodeRunner`, custom `projectReferenceLoader`, request-scoped
  providers, recordings, filesystem shared project references, concurrent
  same-project calls, and the global compatible rollback path covered by
  Rivet-side characterization plus wrapper-side integration tests.

### P7: Split Default-Safe Fast Pieces From Explicit Fast Mode (DONE)

After P6, split the current `headless-fast` behavior into smaller internal
capabilities so defaults can move conservatively.

The goal is not to make every fast mechanism default at once. The goal is to
promote only pieces that are proven compatible, while keeping the explicit
`runtimeProfile: 'headless-fast'` knob for more aggressive eligible execution.

Implementation shape:

- Introduce an internal decision helper for Node `createProcessor(...)`, for
  example `resolveCreateProcessorRuntimePolicy(options)`, so defaulting rules
  are centralized and testable instead of scattered through `api.ts`.
- Separate the current fast profile into policy flags:
  - run-scoped graph execution-plan cache;
  - run-scoped loaded-project reference cache;
  - run-scoped cached default CodeRunner;
  - narrow `fast-acyclic` scheduler;
  - forced compatible fallback reasons.
- Make the default policy use only the flags that P6 proves compatible for
  ordinary endpoint execution.
- Keep `runtimeProfile: 'compatible'` as an explicit escape hatch that disables
  all optional fast behavior.
- Keep `runtimeProfile: 'headless-fast'` as an explicit request for the most
  aggressive eligible headless policy.
- Keep Remote Debugger and trace-sensitive runs on compatible scheduling unless
  separate tests explicitly prove parity.
- Surface fallback reasons in tests, not necessarily public API. The important
  production behavior is safe automatic selection, not exposing a new diagnostic
  contract.

Suggested first default:

- Default the run-scoped graph execution-plan cache only if P6 proves event,
  recorder, concurrency, and project immutability parity.
- Do not default the loaded-project reference cache when a custom
  `projectReferenceLoader` is present until P6 proves loader call-count and
  freshness behavior are acceptable.
- Default the run-scoped cached CodeRunner only if no custom `codeRunner` is
  present and P6 proves error/stack and permission parity. In the current
  wrapper endpoint path, this means the cached CodeRunner should stay inactive
  because `ManagedCodeRunner` is always passed.
- P6 pinned `fast-acyclic` event ordering and serialized-recorder parity for
  branching, fan-in, subgraph, async, exclusion, abort, and error cases, but
  exposed the timing-dependent Subgraph `duration` output caveat. Default the
  scheduler only when timing-output variance is accepted or when the policy can
  fall back for graphs that consume timing-dependent outputs.

Acceptance criteria:

- Existing callers of `createProcessor(project, options)` get the compatible
  result and observable behavior.
- `runtimeProfile: 'compatible'` remains a reliable rollback path.
- `runtimeProfile: 'headless-fast'` remains available for callers who accept the
  fast policy explicitly.
- Remote Debugger presence, trace-sensitive options, and unsupported graph
  features force compatible scheduling.
- Custom `codeRunner` and custom `projectReferenceLoader` behavior is preserved
  unless a narrower fast flag is explicitly proven safe with those custom
  providers.
- Benchmarks compare:
  - old compatible baseline;
  - new default auto policy;
  - explicit `headless-fast`;
  - explicit `compatible`.

Implementation result:

- Added internal
  [`packages/node/src/createProcessorRuntimePolicy.ts`](packages/node/src/createProcessorRuntimePolicy.ts)
  so Node `createProcessor(...)` runtime selection is centralized and directly
  testable.
- The policy now splits explicit `headless-fast` into independent flags:
  run-scoped runtime cache, loaded-project-reference caching, default cached
  CodeRunner usage, fast scheduler selection, and fallback reasons.
- At the end of P7, omitted `runtimeProfile` and explicit
  `runtimeProfile: 'compatible'` still resolved to a fully compatible policy
  with no optional fast pieces. P8 is the separate step that flips omitted
  `runtimeProfile` to the default-safe fast policy.
- `remoteDebugger !== undefined` resolves to the fully compatible policy even
  when `headless-fast` is requested.
- `includeTrace: true` keeps compatible scheduling but does not turn off other
  explicit fast pieces, because trace sensitivity is a scheduler/event-ordering
  concern rather than a CodeRunner or graph-plan-cache concern.
- `GraphProcessor` now receives `cacheLoadedProjects` separately from
  `runtimeCache`. That makes graph-plan caching and project-reference snapshot
  caching separable for future default-safe policies.
- A reassessment pass tightened that separation: if a project has references
  and loaded-reference caching is not enabled, core now skips execution-plan
  caching too because referenced project definitions can affect node port plans.
- Added
  [`packages/node/test/createProcessorRuntimePolicy.test.ts`](packages/node/test/createProcessorRuntimePolicy.test.ts)
  to pin omitted/compatible policy, explicit `headless-fast` flags, custom
  CodeRunner ownership, Remote Debugger fallback, and trace scheduling fallback.

### P8: Make Safe Fast Policy The Node CreateProcessor Default (DONE)

After P6 and P7, Node `createProcessor(...)` can make omitted `runtimeProfile`
resolve to the default-safe fast policy instead of the fully compatible policy.

This should still be a Node package change only. Do not change core
`RunGraphOptions`, Browser/editor execution, app-executor behavior, or
Remote-Debugger-compatible execution in the same step.

Implementation shape:

- Change `NodeCreateProcessorOptions.runtimeProfile` semantics to:
  - omitted: automatic default-safe policy;
  - `'compatible'`: force old compatible behavior;
  - `'headless-fast'`: force aggressive eligible fast behavior.
- Keep `runGraph(...)` behavior explicit. For this rollout, it passes
  `runtimeProfile: 'compatible'` internally so the convenience API remains on
  the old compatible path for one release.
- Keep `createGraphRunner(...)` semantics unchanged unless benchmarks or wrapper
  feedback justify aligning its omitted default too.
- Update API docs and developer docs with the new default and the rollback knob.
- Add wrapper rollout guidance:
  - how to force compatibility;
  - recommended first rollout to published/internal published endpoints before
    latest/dev endpoints;
  - which surfaces still force compatible fallback;
  - which benchmark scenarios should improve.

Acceptance criteria:

- Existing test suites pass with omitted `runtimeProfile`.
- New compatibility characterization tests pass with omitted `runtimeProfile`,
  explicit `'compatible'`, and explicit `'headless-fast'`.
- Benchmarks show default omitted `runtimeProfile` improves the target endpoint
  scenarios without regressing tiny workflows beyond noise.
- Rivet-side tests cover the exact wrapper-style option seams available in this
  repo: custom `codeRunner`, custom `projectReferenceLoader`, request `inputs`,
  request `context`, recorder attachment, and debugger fallback.
- External wrapper endpoint tests should still be run before rollout because
  published/latest endpoint routing, filesystem/managed materialization caches,
  latest-debugger availability, and endpoint recording persistence live outside
  this repo.
- Rivet-side concurrent same-project tests prove endpoint-style runs do not
  mutate or cross-contaminate a shared parsed `Project` object.
- If the default-safe policy enables execution-plan caching while leaving
  loaded-reference caching disabled, projects with references must keep the
  guarded fallback and rebuild plans per run unless a freshness key for
  referenced project definitions is added.

Implementation result:

- Omitted Node `createProcessor(...)` runtime profiles now resolve to the
  default-safe policy:
  - run-scoped runtime cache for subprocessor execution plans only;
  - no loaded-project-reference cache;
  - compatible scheduler;
  - run-scoped cached default Node CodeRunner only when no custom `codeRunner`
    is supplied.
- `runtimeProfile: 'compatible'` remains the old compatible rollback path with
  no optional fast pieces.
- `runtimeProfile: 'headless-fast'` remains the aggressive profile with
  loaded-reference caching and the narrow fast scheduler when eligible.
- Unknown `runtimeProfile` runtime values from untyped JavaScript callers use
  the compatible rollback path rather than the omitted default-safe path.
- `remoteDebugger !== undefined` forces full compatibility for omitted and
  explicit fast profiles.
- Omitted trace-sensitive runs force full compatibility; explicit
  `headless-fast` trace runs keep only compatible scheduling so the explicit
  profile can still use other fast pieces.
- `runGraph(...)` now delegates through `createProcessor(...)` with
  `runtimeProfile: 'compatible'` so it does not inherit the new omitted
  `createProcessor(...)` default in this rollout.
- `defaultFastCompatibility.test.ts` now compares omitted default-safe,
  explicit compatible, and explicit `headless-fast` runs. It also pins that the
  omitted default keeps compatible `projectReferenceLoader` call counts while
  `headless-fast` may reduce them.
- The external hosted wrapper still needs its own endpoint/latest-debugger,
  filesystem/managed cache, and recording-persistence integration tests before
  enabling this in a deployed wrapper release. Those tests are outside this
  Rivet checkout; this repo covers the processor/API semantics they depend on.
- A benchmark reassessment found that caching the one-shot root execution plan
  regressed plain 500-node `createProcessor(...)` runs because the root plan
  could not be reused. The default-safe policy therefore uses
  `executionPlanCacheMode: 'subprocessors'`; explicit `headless-fast` and
  reusable `createGraphRunner(..., { runtimeProfile: 'headless-fast' })` still
  cache all graph plans.
- A final reassessment added a core `GraphProcessor` characterization guard for
  that cache mode, proving child processors can populate the runtime execution
  plan cache while the one-shot root graph stays uncached.
- The P8 benchmark pass used 3 samples of 20 measured iterations after 3 warmup
  iterations. Default-safe one-shot `createProcessor(...)` avoided the earlier
  plain-chain regression and stayed effectively at compatible speed while still
  giving small safe wins where subprocessors can reuse plans:

| Scenario | Compatible | Default-safe | Explicit `headless-fast` |
| --- | ---: | ---: | ---: |
| Fresh `createProcessor` text chain 500 | `11.691ms` | `11.592ms` | `9.590ms` |
| Fresh `createProcessor` repeated subgraph same-input 50 | `14.011ms` | `13.954ms` | `10.650ms` |
| Fresh `createProcessor` repeated subgraph changing-input 50 | `11.893ms` | `11.526ms` | `10.441ms` |

This is deliberately conservative: omitted `createProcessor(...)` now improves
or matches compatible behavior for the measured safe cases, while larger
scheduler/reference-cache wins remain explicit behind `headless-fast`.

## Deprioritized Work

These are not first-wave tasks because the expected win is lower or the risk is
higher than the options above.

- Adding `runtimeProfile` to broad core `RunGraphOptions` before the Node runner
  shape proves itself.
- Rewriting `GraphProcessor` scheduling before cached planning and CodeRunner
  wins are measured.
- Optimizing Browser/editor execution first. Editor correctness, debugger
  visibility, recordings, and UI feedback have a larger compatibility surface.
- Changing app-executor worker isolation in the same wave. The sidecar worker
  path is important, but it has different isolation guarantees and should be a
  separate project after headless Node wins are proven.
- Optimizing `runGraphInFile(...)` beyond documentation. It is a convenience API;
  production services should load once and reuse a runner.
- Defaulting loaded-reference caching or the fast scheduler for one-shot
  `createProcessor(...)` before referenced-project freshness and
  timing-sensitive output behavior are explicitly accepted.

## Public APIs And Interfaces

First public addition:

```ts
type NodeGraphRunnerOptions = {
  graph?: string;
  runtimeProfile?: "compatible" | "headless-fast";
  // plus the stable Node run options that make sense at creation time
};

type NodeGraphRunnerRunOptions = {
  inputs?: Record<string, LooseDataValue>;
  context?: Record<string, LooseDataValue>;
  abortSignal?: AbortSignal;
};

type NodeGraphRunner = {
  run(options?: NodeGraphRunnerRunOptions): Promise<Record<string, DataValue>>;
  dispose(): void;
};

type NodeCreateProcessorOptions = NodeRunGraphOptions & {
  runtimeProfile?: "compatible" | "headless-fast";
};
```

API rules:

- `runtimeProfile` is Node-only. On `createGraphRunner(...)`, omitted
  `runtimeProfile` preserves the compatible runner behavior. On
  `createProcessor(...)`, omitted `runtimeProfile` now means the default-safe
  one-shot policy.
- `runtimeProfile: "compatible"` is the explicit rollback path for
  `createProcessor(...)` and the compatible selector for `createGraphRunner(...)`.
- `runGraph(...)` remains compatible in this rollout and does not implicitly use
  the new omitted `createProcessor(...)` default.
- The runner owns stable setup. Each `run(...)` owns inputs, context, abort
  signal, and run-scoped mutable execution state.
- Fast `createProcessor(...)` is a single-run optimization profile. It must not
  require callers to reuse the same processor object to see the intended win.
- If `remoteDebugger !== undefined` in `createProcessor(...)`, Remote Debugger
  behavior takes precedence and the processor uses compatible execution even
  when `runtimeProfile: 'headless-fast'` is present.

## Implementation Phases

1. Benchmarks and guard rails.
   - Add focused benchmark scripts under the Node/core test tooling.
   - Add equivalence tests for outputs, errors, abort, control-flow exclusion,
     required inputs, branching DAGs, and Code/Expression nodes.
   - Record baseline numbers in this plan or a dedicated benchmark note.

2. Reusable Node runner with stable defaults.
   - Add the Node runner API.
   - Resolve graph selection, plugin env, process settings, providers,
     tokenizer, project-reference loader, and code runner at runner creation.
   - Convert loose inputs/context per run.
   - Use run-scoped processors for each run until core exposes an explicitly
     reusable immutable execution plan and run-state reset.
   - Initially delegate execution to existing `GraphProcessor.processGraph(...)`.

3. Cached headless Node CodeRunner.
   - Add a cached compiled-function path to Node execution.
   - Wire it into the runner fast profile.
   - Keep the existing uncached `NodeCodeRunner` behavior available.
   - Test permission combinations and error behavior.

4. Cached graph plan and planner maps. (Done in P3.)
   - Extract an immutable execution-plan object from preprocessing.
   - Add adjacency/missing-input maps.
   - Update `NodeExecutionPlanner` to consume maps when available.
   - Keep the existing preprocessing path for compatible execution.

5. Keep the broad fast acyclic scheduler deferred.
   - The P3 and follow-up orchestration benchmarks did not justify replacing
     the scheduler for every graph shape.
   - P5 added only a narrow ready-queue scheduler for eligible `headless-fast`
     Node runs, with strict fallback for unsupported graph features.
   - Reconsider a broader scheduler only with a benchmark or real workflow where
     the narrow fast path remains substantially slow after preprocessing and
     planning improvements.

6. Single-run fast Node `createProcessor(...)`.
   - Add a Node-only `NodeCreateProcessorOptions` type with `runtimeProfile`.
   - Add fresh-processor benchmark rows that create a new processor for each
     measured run before changing implementation.
   - Wire `runtimeProfile: 'headless-fast'` to intra-run execution improvements,
     not to repeated-processor cache reuse.
   - Preserve compatible defaults and keep `runGraph(...)` unchanged.
   - Make `remoteDebugger !== undefined` plus `headless-fast` fall back to
     compatible execution while preserving Remote Debugger attachment.
   - Prove recording/event callback parity because recorders attach after
     processor creation.

7. Default-fast compatibility characterization.
   - Add event, callback, recorder, reference-loader, CodeRunner, abort, error,
     and fallback characterization for omitted, compatible, and fast profiles.
   - Keep defaults unchanged in this phase.
   - Record which fast capabilities are safe to promote automatically.

8. Split default-safe fast policy from explicit fast mode.
   - Centralize Node `createProcessor(...)` policy selection.
   - Keep `runtimeProfile: 'compatible'` as a force-compatible escape hatch.
   - Keep `runtimeProfile: 'headless-fast'` as the aggressive explicit profile.
   - Promote only the P6-proven compatible flags into the omitted-default path.

9. Make safe fast policy the Node `createProcessor(...)` default. (DONE)
   - Change omitted `runtimeProfile` to the default-safe policy.
   - Decide explicitly whether `runGraph(...)` inherits that policy.
   - Keep Remote Debugger, trace-sensitive, editor-like, and unsupported graph
     features on compatible fallback paths.
   - Update docs and wrapper rollout guidance.

10. Later app-executor work.
   - Reassess app-executor worker startup, registry assembly, and sidecar
     upload/caching only after the headless Node path is measured.
   - Preserve worker isolation and editor observability as separate constraints.

11. Documentation.
   - Update developer docs and API docs with the new production execution path.
   - Explain when to use `runGraphInFile(...)`, `runGraph(...)`,
     `createProcessor(...)`, and `createGraphRunner(...)`.
   - Document immutable-runner invalidation rules.
   - Document compatibility boundaries and fallback behavior.

## Test Plan

Benchmark coverage:

- minimal graph
- 20-node, 100-node, and 500-node built-in chains
- 20-node Expression chain
- 20-node new Code chain
- nested subgraph, wide fan-in, and mixed subgraph fan-in graphs
- one-shot `runGraph(...)` vs reusable runner
- compatible vs `headless-fast` Node `createProcessor(...)` with a fresh
  processor created inside each measured iteration
- cached vs uncached Node CodeRunner

Equivalence coverage:

- per-run `inputs` and `context` on the same runner
- fresh `createProcessor(...).run()` on compatible and `headless-fast` profiles
- graph inputs and outputs
- branching DAGs
- wide fan-in and mixed subgraph fan-in DAGs
- async built-in nodes
- missing required inputs
- control-flow exclusion
- thrown node errors
- abort signal behavior
- Code and Expression nodes
- concurrent `runner.run(...)` calls
- event order and payload parity between omitted, compatible, and fast
  `createProcessor(...)` profiles
- `ExecutionRecorder` replay-visible parity for successful and failed runs
- custom project-reference loader call counts and failure behavior

CodeRunner coverage:

- local variables do not leak between calls
- input mutation behavior remains compatible
- `require` permission behavior remains compatible
- `process`, `fetch`, `console`, and `Rivet` permission combinations work
- syntax errors and runtime errors still reject with useful diagnostics

Fallback coverage:

- loops
- races
- split-run
- user input / wait-event
- preloaded editor run-from/run-to state
- remote debugger
- recording/event-stream consumers

Fast single-run `createProcessor(...)` coverage:

- `headless-fast` creates a fresh processor per run in benchmark and equivalence
  coverage.
- compatible `createProcessor(...)` keeps current preprocessing and scheduler
  behavior.
- fast `createProcessor(...)` still creates fresh node implementations per run
  and does not leak Global node state.
- caller-provided `codeRunner` overrides the cached runner.
- `ExecutionRecorder` sees equivalent event shapes and replay-visible outputs.
- `remoteDebugger !== undefined` plus `runtimeProfile: 'headless-fast'`
  attaches the debugger and uses compatible execution.
- `runGraph(...)` remains compatible.
- planner/preprocessor regression coverage keeps duplicate target-node outputs
  grouped correctly, invalid port connections removed from both endpoints, and
  `headless-fast` ready counts based on unique upstream nodes when one source
  connects to multiple input ports on the same target.
- default-fast promotion coverage keeps omitted `runtimeProfile` pinned to the
  selected default-safe policy, keeps explicit `'compatible'` equivalent to the
  old behavior, and keeps explicit `'headless-fast'` as the aggressive eligible
  profile.

Run:

- core tests
- node tests
- node typecheck/build
- docs typecheck/build when available
- `git diff --check`

## Reassessed Assumptions

- The primary target is headless/programmatic Node execution, not editor or
  Browser mode.
- The first fast API should be additive. Existing APIs must not become faster by
  silently losing events, traces, recordings, debugger behavior, or compatibility.
- Moving safe fast behavior into the omitted `createProcessor(...)` default was
  treated as a separate compatibility change from adding the opt-in profile. It
  stays limited to the pieces covered by event/callback/recorder/reference-loader
  characterization.
- A reusable runner must support per-run inputs/context explicitly because the
  current core helper captures them at processor creation time.
- Fast `createProcessor(...)` targets fresh processors that run once. It keeps
  the existing captured inputs/context model and must not require processor
  reuse for its primary performance win.
- Remote Debugger takes precedence over fast execution for
  `createProcessor(...)`: when `remoteDebugger !== undefined`, the processor
  must attach the debugger and use compatible execution, ignoring
  `runtimeProfile: 'headless-fast'`.
- Cross-run graph-plan caching is not the wrapper endpoint target. Any graph
  plan work for fast `createProcessor(...)` must prove value within the same
  cold `processGraph(...)` call.
- Cached JavaScript compilation is safe only if outputs and run inputs are never
  cached and function-local state stays per invocation.
- Broad scheduler work is worthwhile only if benchmarks after runner/default,
  CodeRunner, plan-cache, preprocessing, and the narrow fast-acyclic scheduler
  still show a substantial remaining scheduler overhead.
- Runtime-speed measurements must run through the benchmark script so core ESM
  output is rebuilt before the Node package imports it.
- The next speed target should come from measured endpoint-style bottlenecks
  that remain after the preprocessor cleanup; not every graph shape gets a
  `20%` additional win from `runtimeProfile` alone.
- Default-fast should be staged by capability. Prefer defaulting safe
  run-scoped planning/caching before defaulting the narrow scheduler, unless P6
  proves scheduler observability parity.
