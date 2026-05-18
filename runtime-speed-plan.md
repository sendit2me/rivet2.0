# Rivet Runtime Speed Plan

## Summary

Optimize headless/programmatic Node execution first. The target use case is a
backend or API server that loads a Rivet project and runs the same graph many
times.

The current repo code points to three high-value areas before any scheduler
rewrite:

1. Reuse stable Node runtime setup across repeated runs.
2. Cache Code/Expression compilation in the Node runtime.
3. Cache immutable graph planning and adjacency data for repeated headless runs.

Default Rivet behavior must remain compatible for the editor, Browser mode,
Remote Debugger, recording, wrappers, app-executor, and existing
`runGraph(...)` / `runGraphInFile(...)` callers. The first public fast path
should be additive and Node-only: `createGraphRunner(...)` in
`@valerypopoff/rivet2-node`.

## Current Code Findings

These findings were checked against the current source before revising this
plan.

- [`packages/node/src/api.ts`](packages/node/src/api.ts) creates the Node wrapper
  around core. `runGraphInFile(...)` still reads and deserializes the project on
  every call, and `runGraph(...)` still creates a processor per call.
- `Node createProcessor(...).run()` constructs default runtime dependencies on
  each run when callers do not provide them: `NodeNativeApi`, `NodeMCPProvider`,
  fallback tokenizer, `NodeCodeRunner`, `NodeProjectReferenceLoader`, and
  resolved process settings.
- [`packages/core/src/api/createProcessor.ts`](packages/core/src/api/createProcessor.ts)
  converts `inputs` and `context` when the processor is created, not when
  `run()` is called. A reusable runner that accepts per-run inputs cannot just
  wrap the existing `coreCreateProcessor(...).run()` method.
- [`GraphProcessor.processGraph(...)`](packages/core/src/model/GraphProcessor.ts)
  preprocesses the graph every run, loads project references every run, creates
  run state every run, and uses the existing evented `PQueue` scheduler.
- [`GraphPreprocessor`](packages/core/src/model/GraphPreprocessor.ts) creates
  node instances, validates connections, computes dynamic port definitions, and
  computes SCC/cycle data. Port definitions can depend on connections, project,
  registry, and loaded project references, so caching must be tied to an
  immutable project/registry/reference snapshot.
- [`NodeExecutionPlanner`](packages/core/src/model/NodeExecutionPlanner.ts)
  repeatedly scans connection and definition arrays during scheduling. Cached
  adjacency maps are a lower-risk first step than replacing the scheduler.
- [`NodeCodeRunner`](packages/node/src/native/NodeCodeRunner.ts) creates a new
  `AsyncFunction` for every Code/Expression execution. This is a focused and
  substantial hot path for Code/Expression-heavy headless workflows.

## Priority Order

### P0: Benchmarks And Equivalence Guards

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
  `runGraph(...)` and `createProcessor(...).run()`.
- Added the repeatable benchmark command
  `yarn bench:runtime-speed`, backed by
  [`packages/node/bench/runtimeSpeed.bench.ts`](packages/node/bench/runtimeSpeed.bench.ts).
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

### P1: Reusable Headless Node Runner

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

### P1: Cached Headless Node CodeRunner

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

Expose it through `createGraphRunner(..., { runtimeProfile: "headless-fast" })`
or as an explicit advanced `codeRunner` option. Do not apply this to the
app-executor worker isolation path in the first pass.

Expected payoff:

- Substantial win for Code/Expression-heavy headless workflows.
- Localized implementation and test surface compared with a scheduler rewrite.

### P2: Cached Immutable Graph Plan And Adjacency Maps

Add a reusable graph execution plan for immutable headless runner snapshots.

The plan should contain:

- node instances
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
- Do not share mutable connection arrays that `GraphPreprocessor` might modify
  during validation.
- Keep compatible execution as the fallback for editor workflows and dynamic
  project-reference scenarios.

Expected payoff:

- Stronger win for many cheap nodes where preprocessing and planner scans are a
  visible part of total runtime.
- Lower risk than replacing the scheduler outright.

### P3: Strict Fast Acyclic Scheduler

Only pursue a new scheduler after P1/P2 benchmarks show it is still necessary.

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

Expected payoff:

- Potentially large for big cheap-node DAGs.
- High effort and higher semantic risk, so it is not a first implementation
  target.

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

## Public APIs And Interfaces

First public addition:

```ts
type GraphRunnerOptions = {
  graph?: string;
  runtimeProfile?: "compatible" | "headless-fast";
  // plus the stable Node run options that make sense at creation time
};

type GraphRunnerRunOptions = {
  inputs?: Record<string, LooseDataValue>;
  context?: Record<string, LooseDataValue>;
  abortSignal?: AbortSignal;
};

type GraphRunner = {
  run(options?: GraphRunnerRunOptions): Promise<Record<string, DataValue>>;
  dispose?(): Promise<void> | void;
};
```

API rules:

- `runtimeProfile` starts on the Node runner API only.
- Existing one-shot APIs keep today's behavior and defaults.
- The runner owns stable setup. Each `run(...)` owns inputs, context, abort
  signal, and run-scoped mutable execution state.
- If a caller needs full debugger/recording/event-stream behavior, they should
  keep using the compatible processor APIs until explicitly supported.

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
   - Use run-scoped processors for overlapping runs.
   - Initially delegate execution to existing `GraphProcessor.processGraph(...)`.

3. Cached headless Node CodeRunner.
   - Add a cached compiled-function path to Node execution.
   - Wire it into the runner fast profile.
   - Keep the existing uncached `NodeCodeRunner` behavior available.
   - Test permission combinations and error behavior.

4. Cached graph plan and planner maps.
   - Extract an immutable execution-plan object from preprocessing.
   - Add adjacency/missing-input maps.
   - Update `NodeExecutionPlanner` to consume maps when available.
   - Keep the existing preprocessing path for compatible execution.

5. Decide whether a fast acyclic scheduler is still worth it.
   - Re-run benchmarks after phases 2-4.
   - Implement only if the measured remaining overhead is still substantial.
   - Keep the eligibility gate strict and fallback automatic.

6. Later app-executor work.
   - Reassess app-executor worker startup, registry assembly, and sidecar
     upload/caching only after the headless Node path is measured.
   - Preserve worker isolation and editor observability as separate constraints.

7. Documentation.
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
- subgraph/project-reference graph if representative
- one-shot `runGraph(...)` vs reusable runner
- cached vs uncached Node CodeRunner

Equivalence coverage:

- per-run `inputs` and `context` on the same runner
- graph inputs and outputs
- branching DAGs
- async built-in nodes
- missing required inputs
- control-flow exclusion
- thrown node errors
- abort signal behavior
- Code and Expression nodes
- concurrent `runner.run(...)` calls

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
- A reusable runner must support per-run inputs/context explicitly because the
  current core helper captures them at processor creation time.
- Graph-plan caching is safe only for immutable project/registry/reference
  snapshots. Dynamic editor graphs and changing project references need the
  compatible path or a new runner.
- Cached JavaScript compilation is safe only if outputs and run inputs are never
  cached and function-local state stays per invocation.
- Fast scheduler work is worthwhile only if benchmarks after runner/default,
  CodeRunner, and plan-cache improvements still show a substantial remaining
  scheduler overhead.
- First meaningful success target remains at least `20%` faster for repeated
  headless runs, with larger expected wins for Code/Expression-heavy workflows.
