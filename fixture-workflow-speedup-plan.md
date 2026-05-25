# Fixture Workflow Speedup Plan

Status: IMPLEMENTED DEFAULT CREATEPROCESSOR SPEEDUP

## Summary

This plan targets workflows shaped like
`.fixtures/graph-fixture.rivet-project`: large business-logic graphs with many
subgraphs, Expression nodes, Code New nodes, mocked external calls, and no
required network latency.

The previous Rivet-side CodeRunner optimization pass helped only modestly. The
optimized path is active, output stays equivalent, and the representative
fixture has roughly 42 CodeRunner calls with no managed `require(...)`. That
means CodeRunner overhead is no longer the most credible source of a large
speedup.

The next real optimization work should happen upstream in Rivet's graph runtime:

- `createProcessor(...)` setup and runtime planning;
- graph execution scheduling;
- repeated small-node orchestration;
- repeated subgraph/reference execution overhead;
- graph/subgraph boundary input/output mapping;
- safe runtime plan caching.

The first step is not to build a separate opt-in runtime mode. The first step is
to prove where runtime overhead actually sits. If the proven fix is
behavior-neutral, it should improve the default `createProcessor(...)` runtime.

## Current Evidence

The fixture is already reasonably fast on the local default runtime, but the
user still wants to know where time goes and whether a significant upstream
speedup is available.

Known local fixture benchmarks from the closed Rivet-side pass:

| Scenario | Mean | Notes |
| --- | ---: | --- |
| `runGraphInFile(...)` | 49.333 ms | Includes project file load. |
| Loaded `runGraph(...)` | 28.066 ms | Loaded project, direct graph run. |
| Fresh `createProcessor(...)` | 27.636 ms | Backend-style processor construction plus run. |
| Reused `createProcessor(...)` | 27.776 ms | Reuse did not materially help. |
| Fixture file load only | 20.034 ms | File/materialization cost is separate from run cost. |

The Rivet-side `CachedNodeCodeRunner` invocation-plan optimization improved the
fixture by roughly 2-3 percent in backend-style rows. That is directionally
positive but below the plan's significant-speedup threshold.

Upstream attribution and scheduler characterization were then added in Rivet.
The saved artifacts are:

- `packages/node/bench-results/fixture-speedup-runtime-attribution-20260525.json`
- `packages/node/bench-results/fixture-speedup-direct-scheduler-20260525.json`
- `packages/node/bench-results/fixture-speedup-createprocessor-default-fast-20260525.json`

The attribution run used 3 profiled fixture runs. It showed
`createProcessor(...)` construction was only about 1.0 ms total across all 3
runs, while the broad inclusive scheduler/node-dispatch area dominated the
diagnostic buckets. Subprocessor creation and listener wiring were visible but
small: about 3.6 ms creating subprocessors, 4.7 ms wiring subprocessor events,
and 3.0 ms wiring subprocessor lifecycle across all 3 profiled runs. These
numbers are diagnostic and inclusive where nested execution is involved; they
are not speed-claim numbers.

Direct scheduler characterization showed the fast acyclic scheduler can help
this fixture:

| Scenario | Mean | p95 | Notes |
| --- | ---: | ---: | --- |
| Direct `GraphProcessor` compatible fixture | 33.969 ms | 35.403 ms | 5 samples, 20 measured runs/sample. |
| Direct `GraphProcessor` fast-acyclic fixture | 30.118 ms | 30.625 ms | About 11.3% faster mean in this diagnostic row. |

Because the default compatibility suite stayed equivalent for the covered
eligible graphs, the fast acyclic scheduler was made the default
`createProcessor(...)` scheduler for eligible omitted-profile runs. Remote
Debugger and trace-sensitive runs stay on the compatible policy.

Fuller `createProcessor(...)` fixture benchmarking used 3 sessions, 15 samples
per session, 20 measured runs per sample, and 5 warmup runs per sample:

| Scenario | Mean | Median | p95 | Notes |
| --- | ---: | ---: | ---: | --- |
| Fresh `createProcessor` compatible rollback fixture | 33.728 ms | 33.817 ms | 35.962 ms | Explicit `runtimeProfile: "compatible"`. |
| Fresh default `createProcessor` fixture | 29.543 ms | 29.671 ms | 32.403 ms | Omitted profile; about 12.4% faster mean than compatible rollback. |
| Reused default `createProcessor` fixture | 29.321 ms | 29.383 ms | 32.433 ms | Useful diagnostic row; fresh one-shot callers usually construct per request. |

The actual local fixture outputs matched between explicit compatible rollback
and the default omitted-profile path.

## Goals

- Find the dominant upstream runtime overhead for the representative fixture.
- Improve the default Rivet runtime when the optimization is behavior-neutral.
- Preserve workflow outputs, project files, recordings, replay, debugger events,
  loops, races, project references, and public API behavior.
- Keep graph walking and scheduling semantics upstream in Rivet.
- Use benchmark data, not intuition, to decide whether a default runtime change
  is justified.

## Non-Goals

- No project YAML or schema change.
- No Rust/native runtime revival for this plan.
- No cosmetic timing-only changes.
- No default behavior regression for editor, debugger, recordings, replay,
  loops, races, abort handling, or project references.
- No opt-in speed profile for this plan; the target is the default
  `createProcessor(...)` path.
- No further CodeRunner-only optimization unless attribution shows CodeRunner is
  again a dominant bucket.

## Working Hypothesis

The next significant speedup, if one exists, is likely in graph runtime
orchestration rather than user-code execution:

- processor construction may repeat graph/runtime planning work per request;
- graph execution may rebuild readiness, dependency, and port maps repeatedly;
- subgraph execution may repeat graph lookup, input mapping, output mapping, and
  callback/listener wiring for each boundary;
- repeated references/subgraphs may not reuse safe immutable runtime plans;
- many tiny nodes can make scheduling and bookkeeping dominate useful work.

This hypothesis must be proven with attribution before implementation.

## Decision Gates

Do not implement runtime optimizations until P1 produces an attribution report.

Use these gates:

- If `createProcessor(...)` setup is the dominant bucket, continue to P2/P3.
- If scheduler/bookkeeping is the dominant bucket, continue to P4.
- If subgraph boundary exclusive overhead is the dominant bucket, continue to
  P5.
- If listener/callback work is dominant even with no Remote Debugger, optimize
  listener dispatch only after proving recordings/debugger lifecycle order stays
  unchanged.
- If no single bucket is material, stop and document that the fixture is already
  too small or too distributed for a low-risk engine win.
- If the best optimization is behavior-neutral, put it in the default runtime.
- If the best optimization must skip default-runtime behavior, do not ship it
  for this plan.

## Benchmark Rules

Use direct Rivet benchmarks to verify whether upstream runtime changed:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER = 'local real workflow fixture'
$env:RIVET_RUNTIME_BENCH_ITERATIONS = '20'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS = '5'
$env:RIVET_RUNTIME_BENCH_SAMPLES = '15'
$env:RIVET_RUNTIME_BENCH_SESSIONS = '3'
$env:RIVET_RUNTIME_BENCH_OUTPUT = 'packages/node/bench-results/fixture-speedup-<baseline-or-after>-<sha>.json'
yarn bench:runtime-speed
```

For any performance claim:

- run the same fixture, same Node version, same machine/container, same heap,
  same CPU limits, and same benchmark filter before and after;
- capture at least two independent baselines before changing runtime code if
  the first baseline is noisy;
- use at least 3 independent sessions;
- keep raw JSON benchmark artifacts;
- record mean, median, p95, standard deviation, coefficient of variation, and
  confidence intervals;
- rerun noisy rows with coefficient of variation above 8 percent;
- compare direct Rivet compatible rollback and default `createProcessor(...)`
  numbers;
- verify output equivalence, ignoring timing fields such as `durationMs` and
  any intentionally variable cost/timing metadata;
- treat improvements below normal variance as noise.

A change counts as significant only if:

- fixture mean or p95 improves by at least 10 percent, or a narrower synthetic
  graph class improves substantially with no fixture regression;
- the direction is consistent across sessions;
- no cheap no-Code control graph regresses meaningfully;
- correctness tests stay green.

## Implementation Phases

### P0: Close CodeRunner-Only Work (DONE)

Result:

- Rivet-side `CachedNodeCodeRunner` invocation-plan caching was implemented and
  kept because it is small, tested, and directionally positive.
- Direct fixture improvement was about 2-3 percent, below the significant
  threshold.
- The pass makes a large CodeRunner-only win unlikely for this fixture.

### P1: Add Upstream Runtime Attribution (DONE)

Add or extend an upstream attribution harness that measures runtime overhead
without depending only on per-node `durationMs`.

Capture these buckets:

- project file load and parse;
- `createProcessor(...)` construction;
- graph lookup and root graph resolution;
- runtime plan construction;
- graph input preparation;
- node dependency/readiness planning;
- scheduler loop time;
- node execution dispatch overhead;
- runtime dispatch overhead before/after actual node implementation;
- subgraph boundary setup;
- subgraph input map construction;
- subgraph output aliasing and propagation;
- graph output collection;
- lifecycle callback/listener overhead with no Remote Debugger;
- output normalization and final output map construction.

The harness should report:

- total run wall-clock time;
- inclusive node durations;
- exclusive runtime overhead when measurable;
- per-node-type counts;
- per-graph and per-subgraph boundary counts;
- top repeated graph/subgraph boundaries;
- attribution confidence or caveats where timing instrumentation perturbs the
  run.

Do not use this diagnostic harness alone for speed claims. Use it to choose the
next optimization.

Implementation constraints:

- Attribution must be off by default.
- Prefer a single runtime profiling option or env flag; do not emit attribution
  work in normal runs.
- Keep attribution spans coarse enough to be trustworthy. Avoid per-port or
  per-edge timing unless a coarser bucket points there first.
- Include instrumentation overhead caveats in every attribution artifact.
- Store attribution artifacts under `packages/node/bench-results/` with commit
  SHA, date, fixture name, Node version, and profiling mode.

Exit criteria:

- A saved attribution artifact identifies the top runtime buckets.
- The artifact includes enough context to choose P2, P4, P5, or stop.
- No optimization phase starts until this artifact exists.

Result:

- Added an off-by-default `GraphProcessor` runtime profiler.
- Extended `packages/node/bench/runtimeAttribution.bench.ts` to record coarse
  runtime phase buckets and `createProcessor(...)` construction time.
- Saved the attribution artifact listed above.
- The result directed the plan away from `createProcessor(...)` setup work and
  toward scheduler characterization.

### P2: Characterize `createProcessor(...)` Setup Cost (DONE)

Measure whether fresh one-shot `createProcessor(...)` runs pay repeated setup
costs that can be safely planned once.

Inspect:

- processor construction;
- graph map construction;
- node lookup map construction;
- project reference loader interaction;
- dataset provider setup;
- graph validation or normalization repeated at runtime;
- default CodeRunner and runtime context construction;
- recorder/debugger/listener wiring when disabled or absent.

Decision gate:

- If setup is small, do not optimize it.
- If setup is material and immutable for a loaded project, introduce safe
  runtime planning or memoization.
- If planning depends on mutable run inputs, split immutable project planning
  from per-run input binding.

Result:

- `createProcessor(...)` construction measured small for this fixture, so no
  new setup cache was added.
- Default omitted-profile execution-plan caching now covers the root graph and
  subprocessors, using a run-scoped runtime cache that is cleared around each
  `run()`.

### P3: Build Safe Runtime Plan Caching For Default Runtime (DONE)

P1/P2 showed repeated immutable planning inside fresh one-shot processors was
material enough to cache run-scoped plans by default, so the implementation adds
default runtime plan caching without any opt-in profile.

Safe cache inputs may include:

- project object identity or stable project revision hash;
- graph id;
- static node ids and node types;
- static port definitions;
- static graph references;
- static edge/dependency topology.
- runtime option flags that affect graph execution semantics;
- registry or node-implementation version when custom registries can alter node
  behavior;
- project reference identity or revision when referenced graph plans are cached.

Never cache:

- runtime `DataValue` instances;
- user inputs;
- context;
- graph inputs;
- node outputs;
- process ids;
- lifecycle/debugger listeners;
- recorder state;
- run cancellation or abort state.
- dataset provider instances;
- project reference loader mutable state;
- custom `codeRunner` instances;
- external function implementations or mutable external-function state.

Tests must prove no value leaks across runs, processors, subgraphs, project
references, or concurrent executions.

Cache invalidation must be explicit:

- project mutation or new project revision invalidates affected plans;
- graph topology changes invalidate affected graph plans;
- registry/node implementation changes invalidate plans that depend on them;
- referenced project changes invalidate parent plans that embed reference
  topology;
- test helpers must be able to clear all runtime-plan caches.

Result:

- No cross-request cache was added because P2 did not justify one.
- The default omitted-profile path uses `executionPlanCacheMode: "all"` with a
  run-scoped runtime cache.

### P4: Reassess Graph Scheduling And Small-Node Overhead (DONE)

If scheduler/bookkeeping dominates, optimize specific hot paths.

Inspect:

- ready-node queue construction and mutation;
- dependency resolution;
- excluded/control-flow propagation;
- repeated edge scans;
- repeated port lookups;
- repeated object/key allocations;
- `Map`/`Set` churn in hot loops;
- callback dispatch when no listeners are installed;
- async boundaries that can be avoided without changing behavior.
- ordering guarantees for starts, finishes, errors, exclusions, and successful
  abort terminal events.

Prefer local algorithmic improvements in the default runtime. Do not introduce a
separate speed profile in this plan.

Result:

- Added direct fixture benchmark rows for compatible versus fast acyclic
  scheduler.
- The fast scheduler improved the direct fixture row by about 11.3% mean after
  adding compatible reachability guards for stale target-port connections.
- The fast scheduler now uses an iterative reverse-reachable walk so very deep
  eligible graphs do not depend on JavaScript recursion depth.
- The default compatibility suite stayed equivalent for the covered eligible
  graphs, including callbacks and recorder events, so the faster scheduler was
  promoted to the default omitted-profile `createProcessor(...)` path.

### P5: Reassess Subgraph Boundary Overhead (DONE)

Measure true exclusive subgraph overhead, not inclusive child graph wall time.

Inspect:

- subprocessor creation;
- child graph lookup;
- child graph input construction;
- repeated project reference resolution;
- mapping child graph outputs back to the subgraph node;
- subgraph duration calculation;
- listener/callback propagation through nested processors;
- concurrent repeated subgraphs and reference graphs.

Possible optimizations:

- cache immutable child graph plans;
- precompute static input/output mapping shapes;
- avoid repeated graph lookup work;
- fast-path listener dispatch when no listeners are registered;
- reduce allocations in boundary input/output maps.

Do not pool mutable subprocessors unless attribution proves construction is a
dominant cost and tests can guarantee state isolation.

Special cases to include in tests:

- nested subgraphs;
- repeated subgraph calls to the same child graph;
- project reference subgraphs;
- graph output nodes with renamed outputs;
- excluded upstream inputs;
- abort graph behavior;
- race/loop nodes when present in the test suite.

Result:

- Attribution did not identify subgraph construction, subprocessor listener
  wiring, or graph-boundary lookup as the dominant exclusive overhead.
- Existing graph-boundary caching remains in place.
- No subprocessor pooling or boundary behavior change was added.

### P6: Make The Behavior-Neutral Optimization The Default (DONE)

After P1-P5, decide where the optimization belongs.

Use default runtime if:

- behavior is identical;
- editor/debugger/recording/replay semantics stay intact;
- tests can cover the invariants;
- benchmark results are stable.

Keep an explicit rollback path for hosts that need the older fully compatible
scheduler:

```ts
createProcessor(project, {
  runtimeProfile: 'compatible',
  ...
});
```

Remote Debugger and trace-sensitive runs should continue to force compatible
policy until separately benchmarked and characterized.

Result:

- Made omitted-profile `@valerypopoff/rivet2-node` `createProcessor(...)` use
  run-scoped root/subprocessor execution-plan caching and the fast acyclic
  scheduler for eligible graphs by default.
- Remote Debugger and trace-sensitive runs still force compatible policy.
- Unknown profile strings still resolve to compatible policy.
- Synthetic output-equivalence tests and the actual local fixture output check
  passed.
- `runtimeProfile: "compatible"` remains the explicit rollback path.

### P7: Benchmark Closeout And Docs (DONE)

For any upstream runtime change:

- run direct fixture benchmarks before and after;
- run synthetic controls for many small nodes, many subgraphs, Code-heavy
  graphs, and no-Code graphs;
- run focused tests for recordings, replay, debugger lifecycle ordering, loops,
  races, abort behavior, project references, and concurrent runs;
- update developer docs with:
  - what changed;
  - which runtime paths are affected;
  - whether the change is default or behind compatible rollback;
  - benchmark commands and artifacts;
  - before/after results;
  - remaining known overhead.

Result:

- Updated developer docs for the runtime profiler and default
  `createProcessor(...)` speedup.
- Added benchmark rows/artifacts for attribution, direct scheduler comparison,
  and `createProcessor(...)` compatible rollback versus the faster default.
- Full `@valerypopoff/rivet2-node` tests passed.
- The plan is complete based on direct Rivet fixture benchmarks.

## Required Tests

At minimum:

- `yarn workspace @valerypopoff/rivet2-node test`;
- focused typecheck/lint command for packages touched by runtime changes;
- focused runtime attribution tests, if the attribution helpers have tests;
- processor/runtime-plan cache tests, if cache is added;
- subgraph/reference graph tests, if boundary caching is added;
- recording/replay tests;
- Remote Debugger lifecycle tests if listener/callback paths change;
- app executor/session transport tests if runtime events change;
- concurrency tests when caches or runtime plans are shared across runs;
- output equivalence check for `.fixtures/graph-fixture.rivet-project`;
- fixture benchmark before/after;
- `git diff --check`.

## Risk Controls

- Keep default behavior unchanged unless the optimization is proven
  behavior-neutral.
- Prefer default-runtime improvements over profiles whenever behavior is
  identical.
- Do not cache mutable runtime values.
- Do not share processor/subprocessor state across concurrent runs.
- Do not reorder lifecycle events.
- Do not skip recording or debugger hooks in the default path.
- Do not make subgraph duration cosmetic; optimize real wall-clock work only.
- Do not add an opt-in speed profile for this plan; use explicit compatible
  rollback if the default needs to be disabled.
- Keep all caches bounded or tied to project/revision lifetimes.
- Do not allow a profiling flag to become part of normal production hot paths.

## Success Criteria

This plan succeeds if one of these outcomes happens:

- a measured default-runtime fixture improvement with non-overlapping benchmark
  confidence intervals and no correctness regressions;
- a clear attribution report proves that remaining runtime is dominated by user
  workflow logic or unavoidable small-node orchestration, and further speed work
  is not worth the complexity.

If attribution does not reveal a dominant upstream overhead bucket, stop. The
next move should be workflow-level simplification advice, not another speculative
runtime rewrite.
