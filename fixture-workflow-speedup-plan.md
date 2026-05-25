# Fixture Workflow Speedup Plan

Status: RIVET-SIDE CLOSED - MODEST LOW-RISK OPTIMIZATION KEPT, WRAPPER FOLLOW-UP REQUIRED

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

After the wrapper launch path was clarified, the important production caveat is
that the user's backend does not use Rivet's default cached CodeRunner. It calls
`createProcessor(...)`, but always passes the wrapper-owned
`ManagedCodeRunner`. That means the small Rivet-side
`CachedNodeCodeRunner` improvement in this plan is useful for default Rivet
callers, but it cannot materially speed wrapper endpoint runs that replace the
default CodeRunner.

The active next step is therefore the wrapper-side handoff plan:
`wrapper-managed-code-runner-speed-plan.md`.

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
- No further Rivet-side CodeRunner complexity unless a benchmark proves the
  default Rivet runtime, not the wrapper `ManagedCodeRunner`, is the bottleneck.

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

The original cheapest-significant-win hypothesis was Code-family execution:

- Expression and Code New both use `context.codeRunner.runCode(...)`.
- The default-safe Node runtime already uses a run-scoped
  `CachedNodeCodeRunner`, so repeated code strings avoid repeated compilation.
- Even on cache hits, every invocation still prepares the invocation shape,
  input argument list, context objects, permissions, and output conversion.
- Fixture workflows with many small Code/Expression nodes are sensitive to that
  per-invocation overhead.

This was tested for the default Rivet runtime. It produced only a small
2-3 percent fixture improvement, below the plan's 10 percent significant-speedup
threshold.

For the user's production backend path, the hypothesis changes: Code-family
overhead is still the right area to inspect, but the implementation point is
the wrapper `ManagedCodeRunner`, not Rivet's default `CachedNodeCodeRunner`.
The wrapper runner currently owns runtime-library preparation, `AsyncFunction`
compilation, require injection, and request context injection for endpoint runs.
That is where the next measured optimization should happen.

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
- For wrapper production claims, do not use `yarn bench:runtime-speed` as the
  acceptance benchmark. Use the wrapper endpoint benchmark protocol described
  in `wrapper-managed-code-runner-speed-plan.md`, because that path exercises
  `ManagedCodeRunner`.

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

### P0: Refresh Fixture Baseline Matrix (DONE)

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

Result:

- Baseline artifact:
  `packages/node/bench-results/fixture-speedup-baseline2-f7d72213-20260525-182552.json`.
- The first baseline run had high variance, so the matrix was rerun as required.
- The stable baseline used 3 sessions, 15 samples per session, 20 measured runs
  per sample, and 5 warmup runs per sample.
- Stable baseline means:
  - `runGraphInFile(...)`: 49.333 ms;
  - loaded `runGraph(...)`: 28.066 ms;
  - fresh `createProcessor(...)`: 27.636 ms;
  - reused `createProcessor(...)`: 27.776 ms;
  - fixture load only: 20.034 ms.

### P1: Add Runtime Attribution Harness (DONE)

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

Result:

- Added `packages/node/bench/runtimeAttribution.bench.ts`.
- Added `bench:runtime-attribution` scripts at the root and Node package level.
- Attribution artifact:
  `packages/node/bench-results/fixture-speedup-attribution-f7d72213-20260525.json`.
- The harness reports fixture phase timings, node type totals, graph summaries,
  top nodes, and CodeRunner profile buckets.

### P2: Characterize Code-Family Runtime Cost (DONE)

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

Result:

- Fixture attribution showed 42 CodeRunner calls in the representative run:
  32 cache misses, 10 cache hits, about 2.8 ms compile time, 4.4 ms invocation
  build time, 7.1 ms execution time, and 15.1 ms total diagnostic CodeRunner
  time.
- Synthetic CodeRunner scenarios showed repeated cached snippets are already
  tiny; distinct snippets pay compile cost.
- The data justified only a small, low-risk invocation-shape optimization. It
  did not justify a larger Code-family rewrite.

### P3: Optimize CodeRunner Invocation Preparation (DONE)

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

Result:

- `CachedNodeCodeRunner` now caches immutable invocation plans by permission
  shape plus graph-input/context presence.
- Runtime argument values are still rebuilt fresh per invocation.
- Focused cache tests prove graph input and context values do not leak across
  cache hits.
- After artifact:
  `packages/node/bench-results/fixture-speedup-after-invocation-plan-f7d72213-20260525-183526.json`.

| Fixture row | Baseline mean | After mean | Mean delta | Baseline p95 | After p95 | P95 delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| loadProjectFromFile | 20.034 ms | 19.686 ms | -1.74% | 20.619 ms | 20.287 ms | -1.61% |
| runGraphInFile | 49.333 ms | 49.015 ms | -0.64% | 52.186 ms | 53.051 ms | +1.66% |
| loaded runGraph | 28.066 ms | 27.468 ms | -2.13% | 29.334 ms | 28.392 ms | -3.21% |
| fresh createProcessor | 27.636 ms | 26.921 ms | -2.59% | 29.365 ms | 28.451 ms | -3.11% |
| reused createProcessor | 27.776 ms | 26.971 ms | -2.90% | 29.397 ms | 27.884 ms | -5.15% |

This is a small measured improvement, not a significant fixture speedup by the
plan's 10 percent threshold.

### P4: Optimize Code-Family Output Normalization (SKIPPED)

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

Result:

- Skipped because P2 did not identify output normalization as a material
  bottleneck. The object-returning synthetic CodeRunner scenario was already
  tiny, and changing output normalization would add risk around DataValue
  semantics for no proven fixture gain.

### P5: Reassess Subgraph Exclusive Overhead (SKIPPED)

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

Result:

- Skipped for this implementation pass. Subgraph timings in the fixture remain
  mostly inclusive child-graph time, and the measured CodeRunner optimization
  did not expose a new exclusive subgraph-boundary bottleneck that would justify
  another runtime change.

### P6: Add Workflow-Level Diagnostic Advice (OPTIONAL, SKIPPED)

If engine-level wins are small, add a diagnostic report that identifies likely
manual simplification opportunities in fixture-shaped workflows:

- repeated tiny Expression nodes;
- chains of Text/Object/Expression nodes that could be merged;
- subgraphs whose boundary overhead is large relative to their leaf work;
- high-count graph input/output pass-through patterns.

This should be a developer diagnostic only. It must not alter runtime behavior
or require project changes.

Result:

- Skipped because no engine-level change produced a significant fixture win.
  The attribution harness itself now supplies the diagnostic information needed
  to identify repeated tiny Expression/Code/subgraph patterns in future passes.

### P7: Benchmark Closeout And Documentation (DONE)

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

Result:

- Final fixture result is a 2-3 percent mean improvement for loaded
  `runGraph(...)`, fresh `createProcessor(...)`, and reused
  `createProcessor(...)`, below the plan's significant-speedup threshold.
- The implemented CodeRunner invocation-plan cache is kept because it is small,
  covered, and directionally improves the backend-style fixture rows.
- Further significant speedup is unlikely to come from another small CodeRunner
  preparation tweak; it would need a higher-cost strategy such as cross-run or
  per-node compiled-code reuse with strong invalidation/state-isolation rules,
  or workflow-level consolidation of tiny helper nodes.
- Follow-up discovery: the user's backend passes a custom wrapper
  `ManagedCodeRunner`, so further production endpoint speed work must be tested
  in the wrapper endpoint path. See `wrapper-managed-code-runner-speed-plan.md`.

### P8: Wrapper Handoff (DONE)

The default Rivet runtime plan is no longer the active implementation path for
the user's backend performance issue.

Result:

- Created `wrapper-managed-code-runner-speed-plan.md` as the handoff document
  for the wrapper developer.
- The handoff explains why the previous Rivet-side CodeRunner optimization did
  not materially affect wrapper endpoint runs.
- The handoff keeps `createProcessor(...)` as the correct API because the
  wrapper needs `processor.processor` before `run()` for `ExecutionRecorder`.
- The handoff targets `ManagedCodeRunner` instead:
  - skip runtime-library preparation when `includeRequire=false`;
  - prepare runtime libraries lazily once per request when `includeRequire=true`;
  - add bounded compiled-function caching with fresh request values;
  - add request-scoped CodeRunner telemetry;
  - benchmark through the wrapper endpoint using
    `.fixtures/graph-fixture.rivet-project`.
- The fixture should still be used as the representative workflow, but the
  source of truth for wrapper speed is `x-workflow-execute-ms` from the wrapper
  API measurement script, not direct Rivet package benchmarks.

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

For wrapper follow-up validation, use the wrapper plan's endpoint benchmark:

```bash
npm --prefix wrapper/api run workflow-execution:measure -- --base-url http://localhost:8080 --endpoint graph-fixture-speed --kind published --runs 50 --warmups 10 --body '{}'
```

Run the wrapper API with:

```text
RIVET_WORKFLOW_EXECUTION_DEBUG_HEADERS=true
RIVET_CODE_RUNNER_TELEMETRY=true
```

The fixture requires no request inputs. Publish it under a stable endpoint name
such as `graph-fixture-speed` before running this command.

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

This Rivet-side plan succeeds if it produces one of these outcomes:

- A measured default-runtime improvement of at least 10 percent in fixture
  `createProcessor(...).run()` mean or p95 without correctness regressions.
- A larger targeted improvement in synthetic Code/Expression-heavy graphs with
  no measurable fixture regression.
- A clear, documented conclusion that the remaining fixture runtime is already
  dominated by user workflow logic or host CPU limits, not easy engine overhead.
- A clear, documented conclusion that the bottleneck for the user's production
  backend path sits outside the default Rivet runtime because the wrapper
  replaces the default CodeRunner.

If the best measured improvement is below benchmark variance, the correct
outcome is to stop and document that further speed work needs a different,
higher-cost strategy.

Current outcome: this Rivet-side plan is closed. It produced a small,
low-risk default-runtime improvement, but not a significant fixture speedup.
The production endpoint optimization now belongs to the wrapper
`ManagedCodeRunner` follow-up plan.
