# Fixture Workflow Speedup Plan

Status: NOT STARTED

## Summary

This plan targets default TypeScript runtime speed for workflows shaped like
`.fixtures/graph-fixture.rivet-project`: large business-logic graphs with many
subgraphs, Code/Expression nodes, mocked external calls, and no required
network latency.

The goal is to make the normal runtime faster without opt-in modes, native
runtime experiments, project YAML changes, or behavior changes. The current
evidence suggests the lowest-effort speedup path is not a broad subgraph
rewrite. Subgraph timings are mostly inclusive child-graph wall time, so they
double-count the work inside nested graphs. The more actionable target is the
Code-family execution path used by Expression, Code, Code New, and JS callback
helpers.

## Goals

- Improve default `createProcessor(...).run()` and loaded `runGraph(...)`
  latency for the representative fixture.
- Keep existing runtime semantics, public APIs, project files, output shapes,
  and debugger/recording behavior unchanged.
- Prefer small, measured TypeScript-runtime optimizations over risky scheduler
  or graph-model rewrites.
- Produce honest before/after benchmark data with enough samples to distinguish
  real wins from noise.
- Keep the fixture benchmark useful for future regressions and profiling.

## Non-Goals

- No Rust/native/headless-fast runtime path.
- No opt-in performance mode.
- No graph YAML or project schema change.
- No app/editor-only shortcut that does not help backend `createProcessor(...)`
  callers.
- No manual rewrite of the user's workflow as the primary product fix.
- No cosmetic timing changes that make subgraph duration look smaller without
  reducing actual wall-clock runtime.

## Current Evidence

The local real-workflow fixture already shows healthy baseline performance:

| Scenario | Approximate Mean | Notes |
| --- | ---: | --- |
| Loaded `runGraph(...)` fixture benchmark | 37.6 ms | From the closed default subgraph speed pass. |
| Fresh default-safe `createProcessor(...)` fixture benchmark | 38.5 ms | Representative backend-style call. |
| Fresh `createProcessor(...)`, heap 512 MB | 30.7 ms | Focused local heap benchmark after loading the fixture once. |
| Docker unlimited CPU, heap 512 MB | 39.9 ms | Docker overhead plus host/container variance. |
| Docker 0.5 CPU, heap 512 MB | 97.9 ms | CPU quota dominates runtime. |
| Docker 0.25 CPU, heap 512 MB | 226.9 ms | Very low CPU causes major latency inflation. |

A diagnostic attribution run with node timings enabled showed this shape:

| Category | Count | Inclusive Duration |
| --- | ---: | ---: |
| `subGraph` | 29 | 218.5 ms |
| `expression` | 33 | 25.2 ms |
| `text` | 80 | 8.2 ms |
| `extractObjectPath` | 29 | 8.2 ms |
| `codeNew` | 9 | 7.0 ms |
| `destructure` | 32 | 6.5 ms |
| `getGlobal` | 34 | 4.8 ms |
| `graphOutput` | 95 | 4.2 ms |
| `graphInput` | 40 | 3.4 ms |

This attribution run is diagnostic, not a clean benchmark, because
`captureNodeTimings` and lifecycle callbacks perturb runtime. The important
signal is structural: subgraph time is inclusive and therefore not a clean
exclusive overhead target, while Expression/Code-family work appears often
enough to justify focused measurement.

## Working Hypothesis

The cheapest significant win, if one exists, is likely in Code-family execution:

- Expression and Code New both use `context.codeRunner.runCode(...)`.
- The default-safe Node runtime already uses a run-scoped
  `CachedNodeCodeRunner`, so repeated code strings avoid repeated compilation.
- Even on cache hits, every invocation still prepares the invocation shape,
  input argument list, context objects, permissions, and output conversion.
- Fixture workflows with many small Code/Expression nodes are sensitive to that
  per-invocation overhead.

The plan should prove or disprove this before changing runtime code. If user
code itself dominates, engine optimization will not buy much and workflow-level
consolidation becomes the honest recommendation.

## Benchmark Rules

- Always benchmark the current branch against a pre-change baseline commit.
- Use the same Node version, same fixture file, same machine/container
  configuration, and same heap/CPU limits for before and after.
- Use a clean benchmark profile for the real fixture:
  - at least 3 independent sessions;
  - at least 15 samples per session;
  - at least 20 measured runs per sample;
  - at least 5 warmup runs per sample.
- That means each fixture row must be based on at least 900 measured workflow
  executions before a result is trusted.
- If coefficient of variation is above 8 percent for a row, rerun that row or
  increase sessions before treating the result as a decision input.
- Keep raw samples as JSON artifacts so future checks can inspect outliers and
  compare confidence intervals.
- Separate clean runtime benchmarks from diagnostic timing/profiling runs.
- Treat any improvement smaller than normal variance as noise. A change counts
  as a real fixture win only when:
  - mean or p95 improves by at least 10 percent;
  - the direction is consistent across independent sessions;
  - the before/after 95 percent confidence ranges do not mostly overlap, or the
    improvement is larger than 2x the pooled coefficient of variation.
- Compare at least these rows:
  - loaded-project `runGraph(...)` on the fixture;
  - fresh `createProcessor(...)` on the fixture;
  - reused `createProcessor(...)` on the fixture;
  - `runGraphInFile(...)` on the fixture;
  - project file load only for the fixture;
  - synthetic many-Expression graph;
  - synthetic many-Code New graph;
  - synthetic many-small-subgraph graph;
  - cheap no-Code control graph.
- Record environment details:
  - OS, Node version, package manager command, CPU model if easy;
  - heap limit;
  - Docker CPU quota if used;
  - commit SHA for before and after.
- Use the existing benchmark harness wherever possible:
  - `RIVET_RUNTIME_BENCH_FILTER='local real workflow fixture'`;
  - `RIVET_RUNTIME_BENCH_ITERATIONS=20`;
  - `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=5`;
  - `RIVET_RUNTIME_BENCH_SAMPLES=15`;
  - `RIVET_RUNTIME_BENCH_SESSIONS=3`;
  - `RIVET_RUNTIME_BENCH_OUTPUT=packages/node/bench-results/<name>.json`;
  - `yarn bench:runtime-speed`.
- Preserve at least one baseline JSON and one final JSON in
  `packages/node/bench-results/`, then summarize the comparison in developer
  docs. Do not rely on console-only numbers.

### Required Fixture Before/After Protocol

The representative fixture comparison is mandatory for any runtime optimization
claim. Use this profile for both baseline and after runs:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER = 'local real workflow fixture'
$env:RIVET_RUNTIME_BENCH_ITERATIONS = '20'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS = '5'
$env:RIVET_RUNTIME_BENCH_SAMPLES = '15'
$env:RIVET_RUNTIME_BENCH_SESSIONS = '3'
$env:RIVET_RUNTIME_BENCH_OUTPUT = 'packages/node/bench-results/fixture-speedup-<baseline-or-after>-<sha>.json'
yarn bench:runtime-speed
```

Run it at least twice for the baseline if the first baseline has high variance.
After each runtime-code optimization, run it again before moving to the next
optimization phase. A result is not accepted from a single quick local run.

For controls, run either the full benchmark matrix or a focused synthetic matrix
covering Expression, Code New, subgraph-heavy, and cheap no-Code graphs. These
control rows can use fewer runs during exploration, but the real fixture rows
above are the source of truth for whether this project became faster.

## Implementation Phases

### P0: Refresh Fixture Baseline Matrix (NOT DONE)

Before changing runtime code, capture a clean, repeatable baseline:

- Use the exact `.fixtures/graph-fixture.rivet-project` file that represents
  the user's real workflow shape.
- Run the local real-workflow fixture rows with the benchmark profile from
  `Benchmark Rules`.
- Run the same baseline command twice from a clean working tree if the first
  run has high variance.
- Store the baseline JSON with a name that includes the commit SHA and date.
- Record the exact command, Node version, heap limit, CPU/container settings,
  and dirty/clean status.
- Add a short baseline summary to the plan before implementing P2 or later.

Deliverable: a trustworthy before matrix for `runGraphInFile(...)`,
`runGraph(...)`, fresh `createProcessor(...)`, reused `createProcessor(...)`,
and fixture load time.

### P1: Add Runtime Attribution Harness (NOT DONE)

Create a diagnostic harness that can attribute fixture runtime without changing
production execution:

- Load `.fixtures/graph-fixture.rivet-project` when present.
- Run the fixture's `metadata.mainGraphId` with no explicit inputs.
- Capture high-level phases:
  - project file load;
  - `createProcessor(...)` construction;
  - run wall-clock duration;
  - output map construction.
- Capture timing summaries when `captureNodeTimings` is enabled:
  - by node type;
  - by graph;
  - top nodes;
  - subgraph inclusive tree;
  - leaf-only totals that exclude nested subgraph double-counting where
    possible.
- Output both readable tables and JSON artifacts.
- Clearly label attribution output as diagnostic because lifecycle timing adds
  overhead.
- Keep this harness separate from the clean benchmark rows used for before/after
  speed claims.

Deliverable: a repeatable command that answers "what took time in this fixture?"
without requiring ad hoc scripts.

### P2: Characterize Code-Family Runtime Cost (NOT DONE)

Before optimizing, split Code-family cost into measurable buckets:

- Count `CachedNodeCodeRunner` cache hits and misses.
- Measure or sample these internal stages:
  - invocation shape preparation;
  - compiled function lookup;
  - first-time compilation;
  - argument object assembly;
  - actual user-code execution;
  - result normalization into `DataValue` outputs.
- Cover Expression, Code New, legacy Code, and JS list callback helpers.
- Include synthetic microbenchmarks for:
  - many repeated identical expressions;
  - many distinct expressions;
  - many Code New nodes returning objects;
  - Code New nodes using `require`;
  - async code paths.

Decision gate:

- If cache misses dominate, improve compile-key reuse or compilation caching.
- If invocation prep dominates, optimize argument-shape preparation.
- If user code dominates, stop engine work and document workflow-level options.
- If result normalization dominates, inspect output conversion separately.

### P3: Optimize CodeRunner Invocation Preparation (NOT DONE)

If P2 shows invocation prep is material, reduce repeated allocation and repeated
shape work in the default `CachedNodeCodeRunner` path:

- Cache stable invocation metadata derived from code/options/argument shape.
- Reuse compiled argument-name arrays where safe.
- Avoid rebuilding permission/library scaffolding on every cache hit when the
  effective permissions and require configuration are unchanged.
- Keep per-run values fresh:
  - `inputs`;
  - `context`;
  - `graphInputs`;
  - `contextValues`;
  - `node`;
  - `processId`;
  - dynamic require/runtime library state.
- Preserve custom `codeRunner` behavior exactly.
- Preserve compatible-profile behavior that intentionally uses the uncached
  runner.

Tests must prove that cached metadata cannot leak values across runs, nodes,
graphs, processors, or permission configurations.

After this phase, rerun the full fixture benchmark matrix with the same command
used in P0 and compare against the baseline before continuing.

### P4: Optimize Code-Family Output Normalization (NOT DONE)

If P2 shows result conversion is material, make output normalization cheaper
without changing returned values:

- Check repeated object wrapping and type inference in Expression/Code New
  outputs.
- Avoid unnecessary deep cloning in runtime paths that already own the output.
- Preserve the existing plain-object normalization fix for Expression/Code
  returned objects.
- Preserve explicit `undefined`, `control-flow-excluded`, arrays, dates, errors,
  and plugin/custom outputs.
- Add fixtures for objects returned directly from Expression/Code New to main
  graph outputs.

This phase should be skipped if P2 shows output normalization is not a meaningful
part of fixture runtime.

After this phase, rerun the full fixture benchmark matrix with the same command
used in P0 and compare against the baseline before continuing.

### P5: Reassess Subgraph Exclusive Overhead (NOT DONE)

Only after Code-family costs are understood, measure true subgraph boundary
overhead:

- Separate subgraph inclusive time from exclusive boundary cost.
- Count subprocessor construction, graph lookup, graph input map construction,
  output aliasing, and callback dispatch.
- Compare nested and repeated subgraph patterns from the fixture.
- Reuse existing graph boundary caches where possible.
- Avoid subprocessor pooling unless benchmarks prove construction remains a
  dominant cost after previous phases.

Decision gate:

- If exclusive subgraph overhead is small, leave subgraph machinery alone.
- If graph boundary map construction dominates, optimize that specific map path.
- If subprocessor construction dominates, consider a narrowly-scoped reuse path
  with strict state-isolation tests.

After any subgraph-boundary runtime change, rerun the full fixture benchmark
matrix with the same command used in P0 and compare against the baseline before
continuing.

### P6: Add Workflow-Level Diagnostic Advice (OPTIONAL, NOT DONE)

If engine-level wins are small, add a diagnostic report that identifies likely
manual simplification opportunities in fixture-shaped workflows:

- repeated tiny Expression nodes;
- chains of Text/Object/Expression nodes that could be merged;
- subgraphs whose boundary overhead is large relative to their leaf work;
- high-count graph input/output pass-through patterns.

This should be a developer diagnostic only. It must not alter runtime behavior
or require project changes.

### P7: Benchmark Closeout And Documentation (NOT DONE)

For every implemented optimization:

- Run the full fixture benchmark matrix before and after with the benchmark
  profile from `Benchmark Rules`.
- Run focused Code-family synthetic benchmarks.
- Run cheap-control benchmarks to catch regressions.
- Document:
  - benchmark command;
  - environment;
  - before/after SHAs;
  - sessions, samples, iterations, and warmups;
  - total measured workflow executions per row;
  - mean/median/p95/stddev/coefficient of variation/confidence bounds;
  - percentage change;
  - whether variance required a rerun;
  - whether the change is a real win, neutral, or regression.
- Update developer docs with the final results and any new runtime invariants.
- Keep benchmark claims honest if the result is "no meaningful improvement."

## Test Plan

Run focused correctness checks after each runtime change:

- `yarn workspace @valerypopoff/rivet2-node test`
- runtime speed equivalence tests;
- CodeRunner unit tests covering cache hits, cache misses, permissions,
  `require`, async code, errors, and object outputs;
- focused fixture benchmark command;
- `git diff --check`.

When app-facing behavior might be touched, also run the relevant app executor or
typecheck/lint command.

## Risk Controls

- Do not change public `DataValue` schema or graph output shape.
- Do not cache mutable runtime values.
- Do not share CodeRunner invocation state across processors unless all mutable
  inputs are proven isolated.
- Do not weaken code permission checks.
- Do not change custom `codeRunner` ownership or hosted runtime seams.
- Do not change Remote Debugger lifecycle ordering.
- Do not treat diagnostic timing totals as exact wall-clock attribution.

## Success Criteria

This plan succeeds if it produces one of these outcomes:

- A measured default-runtime improvement of at least 10 percent in fixture
  `createProcessor(...).run()` mean or p95 without correctness regressions.
- A larger targeted improvement in synthetic Code/Expression-heavy graphs with
  no measurable fixture regression.
- A clear, documented conclusion that the remaining fixture runtime is already
  dominated by user workflow logic or host CPU limits, not easy engine overhead.

If the best measured improvement is below benchmark variance, the correct
outcome is to stop and document that further speed work needs a different,
higher-cost strategy.
