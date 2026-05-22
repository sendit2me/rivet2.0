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

| Benchmark               | API      | Baseline ms | Candidate ms | Delta ms | Delta % | Verdict |
| ----------------------- | -------- | ----------: | -----------: | -------: | ------: | ------- |
| runGraph text chain 100 | runGraph |        0.00 |         0.00 |     0.00 |    0.0% | neutral |
```

## Benchmark Results - P0 Baseline

Baseline runtime commit: `e70f6e5d3d84db4519d4a31037ee66d82d028a10`

Candidate: P0 benchmark/equivalence guard expansion only; no runtime optimization changes.

Environment:

- Date: 2026-05-22
- OS: Windows
- CPU identifier: `Intel64 Family 6 Model 198 Stepping 2, GenuineIntel`
- Node: `v22.22.3`
- Yarn: `4.6.0`
- Samples: `5`
- Iterations: `100`
- Warmup iterations: `10`
- Packages already built: no; the benchmark command rebuilt `@valerypopoff/rivet2-core` ESM before measuring.

| Benchmark                                                                         | API                                 | Baseline mean ms | Min mean ms | Max mean ms | Std dev ms |
| --------------------------------------------------------------------------------- | ----------------------------------- | ---------------: | ----------: | ----------: | ---------: |
| runGraphInFile passthrough one-shot                                               | runGraphInFile                      |            0.990 |       0.885 |       1.140 |      0.086 |
| runGraphInFile subgraph project one-shot                                          | runGraphInFile                      |            1.514 |       1.414 |       1.676 |      0.092 |
| runGraphInFile referenced-project one-shot with projectPath                       | runGraphInFile                      |            2.037 |       1.912 |       2.215 |      0.113 |
| load once + runGraph passthrough                                                  | runGraph                            |            0.095 |       0.085 |       0.111 |      0.012 |
| reuse createProcessor passthrough                                                 | createProcessor reuse               |            0.072 |       0.066 |       0.075 |      0.003 |
| fresh createProcessor default-safe passthrough                                    | fresh createProcessor               |            0.090 |       0.080 |       0.099 |      0.007 |
| createGraphRunner passthrough                                                     | createGraphRunner                   |            0.075 |       0.072 |       0.080 |      0.002 |
| direct GraphProcessor text chain 20                                               | direct GraphProcessor               |            0.428 |       0.373 |       0.516 |      0.053 |
| runGraph text chain 20                                                            | runGraph                            |            0.435 |       0.378 |       0.536 |      0.056 |
| fresh createProcessor default-safe text chain 20                                  | fresh createProcessor               |            0.428 |       0.390 |       0.448 |      0.020 |
| runGraph text chain 100                                                           | runGraph                            |            1.712 |       1.648 |       1.788 |      0.047 |
| fresh createProcessor default-safe text chain 100                                 | fresh createProcessor               |            1.797 |       1.729 |       1.893 |      0.059 |
| runGraph text chain 500                                                           | runGraph                            |            8.214 |       8.051 |       8.380 |      0.130 |
| createGraphRunner text chain 500                                                  | createGraphRunner                   |            8.324 |       8.164 |       8.572 |      0.141 |
| createGraphRunner headless-fast text chain 500                                    | createGraphRunner headless-fast     |            5.767 |       5.578 |       6.062 |      0.160 |
| runGraph wide independent text nodes 100                                          | runGraph                            |            2.791 |       2.741 |       2.858 |      0.040 |
| fresh createProcessor default-safe wide independent text nodes 100                | fresh createProcessor               |            2.722 |       2.677 |       2.809 |      0.048 |
| fresh createProcessor compatible text chain 500                                   | fresh createProcessor compatible    |            8.301 |       8.252 |       8.376 |      0.047 |
| fresh createProcessor default-safe text chain 500                                 | fresh createProcessor               |            8.345 |       8.239 |       8.498 |      0.097 |
| fresh createProcessor headless-fast text chain 500                                | fresh createProcessor headless-fast |            6.930 |       6.818 |       7.132 |      0.108 |
| runGraph single subgraph call                                                     | runGraph                            |            0.253 |       0.243 |       0.272 |      0.011 |
| fresh createProcessor default-safe single subgraph call                           | fresh createProcessor               |            0.269 |       0.251 |       0.294 |      0.014 |
| runGraph repeated subgraph same-input 50                                          | runGraph                            |           10.781 |      10.524 |      10.964 |      0.143 |
| runGraph repeated subgraph changing-input 50                                      | runGraph                            |            9.072 |       8.913 |       9.284 |      0.137 |
| runGraph nested subgraph depth 5                                                  | runGraph                            |            1.411 |       1.326 |       1.452 |      0.045 |
| fresh createProcessor default-safe nested subgraph depth 5                        | fresh createProcessor               |            1.437 |       1.325 |       1.567 |      0.078 |
| createGraphRunner compatible subgraph chain 50                                    | createGraphRunner compatible        |            9.140 |       8.978 |       9.312 |      0.143 |
| createGraphRunner headless-fast subgraph chain 50                                 | createGraphRunner headless-fast     |            7.915 |       7.801 |       8.270 |      0.178 |
| fresh createProcessor compatible repeated subgraph same-input 50                  | fresh createProcessor compatible    |           10.704 |      10.431 |      10.960 |      0.174 |
| fresh createProcessor default-safe repeated subgraph same-input 50                | fresh createProcessor               |           11.004 |      10.623 |      11.263 |      0.273 |
| fresh createProcessor headless-fast repeated subgraph same-input 50               | fresh createProcessor headless-fast |            9.134 |       8.814 |       9.470 |      0.222 |
| fresh createProcessor compatible repeated subgraph changing-input 50              | fresh createProcessor compatible    |            9.682 |       9.414 |      10.006 |      0.192 |
| fresh createProcessor default-safe repeated subgraph changing-input 50            | fresh createProcessor               |            9.440 |       9.152 |      10.153 |      0.388 |
| fresh createProcessor headless-fast repeated subgraph changing-input 50           | fresh createProcessor headless-fast |            9.144 |       8.500 |      10.412 |      0.686 |
| runGraph Call Graph repeated same-input 50                                        | runGraph                            |           14.085 |      13.134 |      15.797 |      0.999 |
| fresh createProcessor default-safe Call Graph repeated same-input 50              | fresh createProcessor               |           13.107 |      12.226 |      13.664 |      0.520 |
| runGraph Referenced Graph Alias repeated same-input 50                            | runGraph                            |           11.913 |      11.353 |      12.689 |      0.543 |
| fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50  | fresh createProcessor               |           13.891 |      13.348 |      14.536 |      0.455 |
| runGraph custom projectReferenceLoader referenced graph                           | runGraph                            |            0.437 |       0.422 |       0.449 |      0.010 |
| fresh createProcessor default-safe custom projectReferenceLoader referenced graph | fresh createProcessor               |            0.412 |       0.405 |       0.423 |      0.006 |
| createGraphRunner compatible wide fan-in 200                                      | createGraphRunner compatible        |            8.479 |       8.273 |       8.772 |      0.177 |
| createGraphRunner headless-fast wide fan-in 200                                   | createGraphRunner headless-fast     |            2.685 |       2.477 |       2.924 |      0.151 |
| createGraphRunner compatible mixed subgraph fan-in                                | createGraphRunner compatible        |            7.832 |       7.436 |       8.607 |      0.434 |
| createGraphRunner headless-fast mixed subgraph fan-in                             | createGraphRunner headless-fast     |            3.971 |       3.781 |       4.446 |      0.243 |
| runGraph expression chain 20                                                      | runGraph                            |            2.642 |       2.549 |       2.746 |      0.067 |
| fresh createProcessor default-safe expression chain 20                            | fresh createProcessor               |            2.712 |       2.626 |       2.770 |      0.054 |
| createGraphRunner compatible expression chain 20                                  | createGraphRunner compatible        |            2.568 |       2.518 |       2.610 |      0.030 |
| createGraphRunner headless-fast expression chain 20                               | createGraphRunner headless-fast     |            2.382 |       2.366 |       2.415 |      0.017 |
| runGraph code chain 20                                                            | runGraph                            |            6.352 |       6.293 |       6.416 |      0.045 |
| fresh createProcessor default-safe code chain 20                                  | fresh createProcessor               |            6.318 |       6.254 |       6.366 |      0.041 |
| createGraphRunner compatible code chain 20                                        | createGraphRunner compatible        |            6.186 |       6.136 |       6.275 |      0.049 |
| createGraphRunner headless-fast code chain 20                                     | createGraphRunner headless-fast     |            6.078 |       5.877 |       6.326 |      0.165 |
| lazy preprocess/dependency text chain 500                                         | planning helper                     |            1.012 |       0.954 |       1.107 |      0.052 |
| NodeCodeRunner compile/run one snippet                                            | CodeRunner                          |            0.001 |       0.001 |       0.001 |      0.000 |
| CachedNodeCodeRunner run cached snippet                                           | CachedCodeRunner                    |            0.001 |       0.001 |       0.001 |      0.000 |

Baseline group summary:

- Runtime execution: the cheapest loaded-project one-shot is `load once + runGraph passthrough` at `0.095ms`; the slowest one-shot runtime group is graph dispatch, led by `runGraph Call Graph repeated same-input 50` at `14.085ms` and `fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50` at `13.891ms`.
- Code execution: `runGraph expression chain 20` is `2.642ms`; `runGraph code chain 20` is `6.352ms`; the CodeRunner micro-benchmarks are effectively below useful millisecond precision at `0.001ms`.
- Graph runner reuse: `createGraphRunner passthrough` is `0.075ms`; reused headless-fast planning is already visibly faster in graph-runner scenarios such as text chain 500 (`5.767ms` versus compatible `8.324ms`), wide fan-in 200 (`2.685ms` versus compatible `8.479ms`), and mixed subgraph fan-in (`3.971ms` versus compatible `7.832ms`).
- Secondary project loading: `runGraphInFile passthrough one-shot` is `0.990ms`, the subgraph file case is `1.514ms`, and the referenced-project file case is `2.037ms`.

The referenced-project `runGraphInFile(...)` benchmark explicitly passes `projectPath` so the default Node project-reference loader can resolve the fixture's relative `hintPaths`.

## Benchmark Results - P1 Candidate

Baseline runtime commit: `e70f6e5d3d84db4519d4a31037ee66d82d028a10`

Candidate: working tree after P1. The first blanket `runGraph(...)` default-safe attempt was rejected because it made tiny passthrough/file-loading cases slower by more than the performance rules allow. The final candidate uses default-safe policy only for graph shapes that can benefit and leaves simple graphs and unrelated one-off Subgraph targets on the compatible path.

Environment:

- Date: 2026-05-22
- OS: Windows
- CPU identifier: `Intel64 Family 6 Model 198 Stepping 2, GenuineIntel`
- Node: `v22.22.3`
- Yarn: `4.6.0`
- Samples: `5`
- Iterations: `100`
- Warmup iterations: `10`
- Packages already built: no; the benchmark command rebuilt `@valerypopoff/rivet2-core` ESM before measuring.

| Benchmark                                                                        | API             | Baseline ms |  P1 ms | Delta ms | Delta % | Verdict           |
| -------------------------------------------------------------------------------- | --------------- | ----------: | -----: | -------: | ------: | ----------------- |
| load once + runGraph passthrough                                                 | runGraph        |       0.095 |  0.090 |   -0.005 |   -5.3% | pass              |
| runGraph text chain 20                                                           | runGraph        |       0.435 |  0.420 |   -0.015 |   -3.4% | pass              |
| runGraph text chain 100                                                          | runGraph        |       1.712 |  1.715 |    0.003 |    0.2% | neutral           |
| runGraph text chain 500                                                          | runGraph        |       8.214 |  8.007 |   -0.207 |   -2.5% | pass              |
| runGraph wide independent text nodes 100                                         | runGraph        |       2.791 |  2.662 |   -0.129 |   -4.6% | pass              |
| runGraph single subgraph call                                                    | runGraph        |       0.253 |  0.257 |    0.004 |    1.6% | neutral           |
| runGraph repeated subgraph same-input 50                                         | runGraph        |      10.781 | 10.461 |   -0.320 |   -3.0% | pass              |
| runGraph repeated subgraph changing-input 50                                     | runGraph        |       9.072 |  8.727 |   -0.345 |   -3.8% | pass              |
| runGraph nested subgraph depth 5                                                 | runGraph        |       1.411 |  1.329 |   -0.082 |   -5.8% | pass              |
| runGraph Call Graph repeated same-input 50                                       | runGraph        |      14.085 | 13.376 |   -0.709 |   -5.0% | pass              |
| runGraph Referenced Graph Alias repeated same-input 50                           | runGraph        |      11.913 | 11.089 |   -0.824 |   -6.9% | pass              |
| runGraph custom projectReferenceLoader referenced graph                          | runGraph        |       0.437 |  0.342 |   -0.095 |  -21.7% | pass              |
| runGraph expression chain 20                                                     | runGraph        |       2.642 |  2.653 |    0.011 |    0.4% | neutral           |
| runGraph code chain 20                                                           | runGraph        |       6.352 |  6.501 |    0.149 |    2.3% | neutral           |
| runGraphInFile passthrough one-shot                                              | runGraphInFile  |       0.990 |  1.078 |    0.088 |    8.9% | secondary caution |
| runGraphInFile subgraph project one-shot                                         | runGraphInFile  |       1.514 |  1.559 |    0.045 |    3.0% | secondary neutral |
| runGraphInFile referenced-project one-shot with projectPath                      | runGraphInFile  |       2.037 |  2.215 |    0.178 |    8.7% | secondary caution |
| fresh createProcessor default-safe repeated subgraph same-input 50               | createProcessor |      11.004 | 10.508 |   -0.496 |   -4.5% | pass              |
| fresh createProcessor default-safe repeated subgraph changing-input 50           | createProcessor |       9.440 |  8.660 |   -0.780 |   -8.3% | pass              |
| fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50 | createProcessor |      13.891 | 11.326 |   -2.565 |  -18.5% | pass              |

P1 conclusion:

- Loaded-project `runGraph(...)` got faster or stayed neutral across the primary runtime shapes.
- The selective policy avoided the blanket default-safe tiny-graph regression while still improving repeated Subgraph target, dynamic `Call Graph`, and repeated referenced-alias target scenarios.
- Single-root-subgraph shapes stay compatible in P1; nested subgraph benchmarks are still tracked, but deeper subgraph-boundary optimization belongs to P2.
- `runGraphInFile(...)` remains a secondary caution because file-loading one-shot rows were slower in this run, but the runtime plan explicitly does not optimize project loading in P1 and does not let file-loading noise override loaded-project runtime wins.
- Fresh `createProcessor(...)` was not changed by P1; its rows were rerun as comparison guards and mostly stayed neutral or improved, with noisy variance in some long-chain rows.

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
- `runGraph(...)` now uses the same omitted-profile default-safe policy as `createProcessor(...).run()` for graph shapes that can benefit, while simple graphs, unrelated one-off Subgraph targets, Remote Debugger runs, and trace-sensitive calls stay on the compatible policy. It still does not expose `runtimeProfile`; untyped `runtimeProfile` properties are ignored.

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
- `runGraphInFile referenced-project one-shot with projectPath`

If a phase targets a missing scenario, add the benchmark first. In particular, add or keep coverage for:

- repeated direct `Subgraph` calls with same inputs
- repeated direct `Subgraph` calls with changing inputs
- nested `Subgraph` calls
- parallel Subgraph fan-out/fan-in, covered by the repeated same-input fan-in fixture unless a phase needs a distinct shape
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

### P0: Refresh Baselines And Equivalence Guards (DONE)

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

### P1: Let `runGraph(...)` Use Default-Safe Optimizations (DONE)

Purpose:

Make common programmatic one-shot `runGraph(...)` calls faster without requiring users to change API usage.

Current state:

`runGraph(...)` used to call `createProcessor(project, { ...options, runtimeProfile: 'compatible' })`, which bypassed default-safe optimizations. Default-safe `createProcessor(...)` already keeps the compatible scheduler, falls back for Remote Debugger and trace-sensitive paths, uses cached default CodeRunner only when no custom runner is supplied, and caches only structural subprocessor data.

Files:

- [`packages/node/src/api.ts`](packages/node/src/api.ts)
- [`packages/node/test/api.test.ts`](packages/node/test/api.test.ts)
- [`packages/node/test/runtimeSpeedEquivalence.test.ts`](packages/node/test/runtimeSpeedEquivalence.test.ts)
- [`packages/node/test/defaultFastCompatibility.test.ts`](packages/node/test/defaultFastCompatibility.test.ts)
- [`developer-docs/PACKAGES.md`](developer-docs/PACKAGES.md)

Steps:

1. Change `runGraph(...)` to stop forcing every call through `runtimeProfile: 'compatible'`.
2. Benchmark before and after this policy change before adding any extra API surface.
3. Keep simple graph shapes and unrelated one-off Subgraph targets on the compatible path if the benchmark or cache-key model shows default-safe setup overhead without plan reuse.
4. Preserve an explicit compatibility escape hatch only if tests or wrapper feedback prove one is needed. Avoid adding `runtimeProfile` to `runGraph(...)` unless there is a real compatibility reason.
5. Confirm Remote Debugger runs still fall back to compatible behavior through runtime policy.
6. Confirm custom `codeRunner`, custom providers, project reference loaders, and runtime callbacks still run.
7. Update docs to explain that eligible `runGraph(...)` calls use default-safe structural optimizations, not `headless-fast`.

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

### P2: Add Runtime Graph Boundary Caches For Subgraph And Reference Nodes (DONE)

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
- [`packages/core/src/model/nodes/LoopUntilNode.ts`](packages/core/src/model/nodes/LoopUntilNode.ts)
- [`packages/core/src/model/nodes/CallGraphNode.ts`](packages/core/src/model/nodes/CallGraphNode.ts)
- [`packages/core/src/model/GraphBoundaryCache.ts`](packages/core/src/model/GraphBoundaryCache.ts)
- [`packages/core/test/model/GraphBoundaryCache.test.ts`](packages/core/test/model/GraphBoundaryCache.test.ts)
- [`packages/core/test/model/GraphProcessor.characterization.test.ts`](packages/core/test/model/GraphProcessor.characterization.test.ts)
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

P2 conclusion:

- Added [`GraphBoundaryCache.ts`](packages/core/src/model/GraphBoundaryCache.ts) as the single helper for graph boundary input/output derivation, node input/output definitions, subgraph input-data construction, and excluded-output maps.
- Threaded an internal `NodeDefinitionContext` through `preprocessGraphState(...)` so Subgraph, Referenced Graph Alias, and Loop Until definition lookups can use the same processor/runner boundary resolver as runtime `process(...)`.
- Kept the default preprocessor path inline when no boundary definition context is present. The first implementation passed an extra optional argument too broadly and benchmarked poorly on unrelated simple graphs; the final shape only activates the boundary context for boundary-driven node types.
- Added a run-start boundary-cache reset when project references are used without loaded-project caching, keeping dynamically reloaded referenced-project boundaries from leaking across repeated raw core processor runs.
- Refactored Subgraph and Referenced Graph Alias runtime paths away from repeated `reduce(...spread)` input/output map construction. `Call Graph` was left unchanged because it receives a dynamic input object and does not scan graph boundary ports directly.
- Kept editor `getEditors(...)` uncached so settings panels still reflect in-place graph input/output edits.
- Added focused tests for duplicate boundary ids, sorted port order, explicit `null` / `undefined` `any` values, excluded-output construction, cache scoping, and preprocessor use of the runtime boundary cache.
- Full benchmark passes after the change showed broad machine/runtime drift across unrelated rows, so the absolute P2 full-matrix numbers should not be compared directly to the P1 table. A same-checkout targeted guard still showed the default-safe path ahead of compatible for the intended rows: repeated same-input Subgraph `12.780ms` vs `13.225ms`, repeated changing-input Subgraph `11.275ms` vs `11.921ms`, and repeated Referenced Graph Alias `12.960ms` vs `14.076ms`.

### P3: Reduce Fresh Subprocessor Construction Cost (DONE)

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

P3 conclusion:

- Added a lightweight fresh-subprocessor startup path in [`GraphProcessor.ts`](packages/core/src/model/GraphProcessor.ts): when a child graph already has a runtime-cached immutable execution plan, `#createSubProcessor(...)` seeds the fresh child processor with that plan and the cached node-id list before its first run. The child still creates fresh `NodeImpl` instances and fresh mutable run state.
- Added `nodeIds` to reusable graph execution plans so cached-plan runs can initialize per-run remaining-node state without remapping graph nodes.
- Replaced `Object.fromEntries(nodes.map(...))` node-instance construction with a direct loop, avoiding temporary arrays on every fresh processor/subprocessor.
- Reassessment cleanup: preprocessed graph state now replaces the processor's
  node-instance, node-id, and connection maps instead of merging into previous
  maps. This closes a stale-map edge case for reused processors after in-place
  graph edits and keeps cached-plan application easier to reason about.
- Kept project-reference loading behavior unchanged after reassessment. A broader same-run reference-map inheritance idea reduced duplicate loader calls, but it also changed explicit compatible loader-call behavior, so it was rejected for this phase.
- Added preprocessor coverage for cached plan `nodeIds` and a reused-processor
  regression for stale connection-map state after graph edits.
- Verification passed for focused core preprocessor/GraphProcessor characterization tests, Node runtime-speed/API/default-fast/runner/equivalence tests, and core/node lint.
- Benchmark pass (`RIVET_RUNTIME_BENCH_SAMPLES=3`, `RIVET_RUNTIME_BENCH_ITERATIONS=50`, `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=5`) kept simple single-subgraph and passthrough rows neutral at sub-millisecond scale and improved the P2 target guard rows: repeated Subgraph same-input `10.389ms` versus the P2 guard `12.780ms`, repeated Subgraph changing-input `8.610ms` versus `11.275ms`, and repeated Referenced Graph Alias `10.611ms` versus `12.960ms`. Full-matrix absolute values still drift between passes, so the target-row comparison is the meaningful signal.

### P4: Reduce Per-Node Context And Abort Overhead (DONE)

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

P4 conclusion:

- Removed the processor-level abort listener that was previously attached for every node execution. Active node abort controllers are now kept in a run-scoped map keyed by exact `NodeId`; the common case stores one controller directly and only promotes to a `Set` for overlapping executions of the same node, such as split-run/parallel cases.
- Tightened race cleanup while doing that: race winners now abort only exact nodes in the race branch instead of scanning string keys by prefix. Added characterization coverage proving an active non-race node with a shared id prefix is not aborted.
- Reassessment cleanup paired node abort-controller registration and unregistering across pre-process exits too, so aborting while a node is waiting for pause/resume no longer leaves stale active-controller state until the next run reset.
- Moved stable `InternalProcessContext` fields into a per-run base in [`ProcessContextBuilder.ts`](packages/core/src/model/ProcessContextBuilder.ts), while keeping mutable/per-node fields rebuilt per execution: node, attached data, signal, process id, execution metadata, partial outputs, subprocessor creation, plugin config, user input, wait-event, and global setters.
- Reused one stateless default `IsomorphicCodeRunner` instance when callers do not supply a custom Code runner. Custom runners are still passed through unchanged.
- Rejected the tempting external-function shortcut for now. `externalFunctions` is still copied into each node context because that preserves the old isolation contract for custom nodes/plugins.
- Direct A/B benchmark against clean `HEAD` in a temporary worktree (`RIVET_RUNTIME_BENCH_SAMPLES=3`, `RIVET_RUNTIME_BENCH_ITERATIONS=30`, `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=5`) showed modest cheap-chain wins, not a major architectural jump: `runGraph text chain 100` improved `2.370ms -> 2.234ms`, `runGraph text chain 500` improved `11.040ms -> 10.584ms`, `fresh createProcessor default-safe text chain 500` improved `11.264ms -> 10.517ms`, and `createGraphRunner text chain 500` improved `11.175ms -> 10.711ms`. Wide independent node rows were neutral-to-slightly-worse in this noisy local pass, so the phase stops at low-risk allocation cleanup rather than adding capability flags.
- Verification passed for focused GraphProcessor tests, runtime-speed/default-fast/API/graph-runner Node tests, and the full runtime benchmark matrix.

### P5: Cache Or Precompute Dynamic Port Definitions Safely (DONE)

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

P5 conclusion:

- Reassessed the live preprocessor and found that `preprocessGraphState(...)` already asks each node for input/output definitions only once per preprocess call. A per-call `NodeImpl` definition cache would not hit in normal graphs and would add policy/key overhead to the hot path.
- Kept plugin and connection-sensitive node definitions uncached. Nodes such as Array, Coalesce, Join, Passthrough, Race Inputs, Loop Controller, Delay, Subgraph, Referenced Graph Alias, and Loop Until can depend on current connections or graph boundaries, so P5 does not memoize their full port-definition arrays.
- Added a bounded pure cache to [`interpolation.ts`](packages/core/src/utils/interpolation.ts) for `extractInterpolationVariables(...)`, the shared parser used by Text, Prompt, Object, Code, Expression, JS Filter, JS Map, Extract Object Path, Tool schema interpolation, and Thread Message input discovery. The cache stores only exact-template variable-name arrays; callers still receive fresh arrays, and no graph/project/runtime values are cached.
- Tightened the cache after reassessment: a small 512-entry cache could churn on many distinct short templates, an evict-on-every-new-template policy regressed a 10,000-template stress case, and a permanently full no-eviction cache could block later hot templates. The final cache uses entry and text budgets, skips per-miss eviction when full, and adapts only when the same uncached template repeats immediately. Oversized one-off sets fall back to normal parsing instead of thrashing.
- Added parser coverage proving cached extraction keeps the previous mutable-return behavior: mutating one returned array does not corrupt later calls.
- Focused parser microbenchmark on this checkout showed repeated extraction speedups for both short and medium templates: same short template `192.01ms -> 12.89ms`, a 1000-template short cycle `188.88ms -> 15.90ms`, and same medium template `2988.99ms -> 13.12ms` over 500,000 extraction calls. The 10,000-template stress case stayed neutral-to-slightly-faster (`190.14ms -> 179.73ms`) instead of thrashing.
- Runtime benchmark pass (`RIVET_RUNTIME_BENCH_SAMPLES=3`, `RIVET_RUNTIME_BENCH_ITERATIONS=30`, `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=5`) remained noisy at full-matrix scale. The most direct preprocessing row improved from the pre-P5 baseline `1.186ms` to `0.693ms` for `lazy preprocess/dependency text chain 500`. Public run rows were mixed within local variance: text-chain and subgraph rows did not show a clean broad win, so this phase deliberately stops at the pure parser cache instead of adding riskier node-definition memoization.

### P6: Optimize One-Shot Project File Loading (DONE)

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

P6 conclusion:

- Implemented an internal `serializationInput.ts` preparation path in core
  serialization that performs version detection and, for versioned v2-v4
  YAML/JSON envelopes, forwards the already parsed envelope into the selected
  deserializer. This removes the previous parse-for-detection plus
  parse-for-deserialization duplication on one-shot file/string loading paths.
- Kept legacy v1 fallback string-based. JSON/YAML without a supported v2-v4
  envelope still flows into the old v1 deserializers as text, so malformed or
  legacy inputs do not accidentally become accepted through a broader object
  path.
- Updated v2, v3, and v4 deserializers to accept either raw serialized text or a
  prepared parsed envelope. Direct raw-text calls remain compatible.
- Added serialization coverage for the prepared-input behavior, including the
  important guard that YAML without a supported version still falls back as the
  original string.
- Added isolated benchmark rows for `loadProjectFromString(...)` and
  `loadProjectFromFile(...)` so future work can distinguish parse/load cost from
  graph execution cost.
- Local benchmark comparison with
  `RIVET_RUNTIME_BENCH_SAMPLES=3`,
  `RIVET_RUNTIME_BENCH_ITERATIONS=30`, and
  `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=5` showed the intended one-shot wins:
  `runGraphInFile passthrough one-shot` `1.312ms -> 0.989ms` (about 25%
  faster), `runGraphInFile subgraph project one-shot` `1.719ms -> 1.365ms`
  (about 21% faster), and `runGraphInFile referenced-project one-shot with
  projectPath` `2.609ms -> 1.905ms` (about 27% faster). The newly isolated
  loading rows measured `0.467ms` for `loadProjectFromString subgraph project
  only` and `0.688ms` for `loadProjectFromFile subgraph project only` in the
  same final pass.
- Already-loaded execution rows remained in the normal local variance band,
  which matches the scope of this phase: P6 improves project file/string loading
  and should not alter loaded workflow execution semantics.

### P7: Reassess `fast-acyclic` Expansion Last (DONE)

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

P7 conclusion:

- Reassessed the fast scheduler after P1-P6 and did not broaden eligibility.
  The current `fast-acyclic` path already covers eligible acyclic headless
  graphs, including eligible Subgraph/Referenced Graph Alias callers,
  Code/Expression nodes, and partial-output callbacks, through the shared
  `GraphProcessor` processing path.
- Added scheduler-only benchmark rows so future comparisons can separate the
  scheduler win from graph-runner cache, project-reference cache, and CodeRunner
  effects. With
  `RIVET_RUNTIME_BENCH_SAMPLES=3`,
  `RIVET_RUNTIME_BENCH_ITERATIONS=30`, and
  `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=5`, direct scheduler-only rows measured
  `direct GraphProcessor compatible text chain 500` `10.270ms` versus
  `direct GraphProcessor fast-acyclic text chain 500` `7.835ms` (about 24%
  faster), and `direct GraphProcessor compatible wide fan-in 200` `7.997ms`
  versus `direct GraphProcessor fast-acyclic wide fan-in 200` `3.685ms` (about
  54% faster).
- The remaining expansion candidates are split-run, loop, race, user-input, and
  wait-event behavior. Those are high-blast-radius because they can change
  observable event order, abort timing, pause/resume behavior, and stateful
  branch cleanup. No benchmark in this phase proved that opening those paths is
  worth that risk.
- Kept `runGraph(...)`, omitted-profile `createProcessor(...)`, Remote Debugger,
  trace-sensitive runs, editor run-from, and recording-sensitive default paths on
  compatible scheduling. Explicit `runtimeProfile: 'headless-fast'` remains the
  opt-in surface for eligible fast scheduling.
- Future scheduler expansion should be a dedicated phase per unsupported node
  class, with golden event/recording/abort characterization first and benchmark
  proof that the specific class has a substantial win.

## Implemented Order

1. P0: Refreshed baselines and equivalence guards.
2. P1: Moved eligible `runGraph(...)` calls from forced compatible mode to default-safe mode.
3. P2: Added runtime graph boundary caches for Subgraph / Referenced Graph.
4. P3: Reduced fresh subprocessor construction cost.
5. P4: Reduced per-node context and abort overhead.
6. P5: Cached safe dynamic port definitions where measured definition cost justified it.
7. P6: Optimized one-shot project file loading as a secondary path.
8. P7: Reassessed broader `fast-acyclic` scheduler eligibility and kept it narrow.

This order prioritized substantial wins with lower behavioral risk before touching the hottest and most delicate `GraphProcessor` internals.

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
