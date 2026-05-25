# Fixture Workflow Speedup Plan

Status: UPDATED PLAN - ATTRIBUTION-GATED UPSTREAM RUNTIME WORK

## Summary

This plan targets workflows shaped like
`.fixtures/graph-fixture.rivet-project`: large business-logic graphs with many
subgraphs, Expression nodes, Code New nodes, mocked external calls, and no
required network latency.

The previous Rivet-side and wrapper-side CodeRunner optimization passes both
helped only modestly. The optimized paths are active, output stays equivalent,
and the representative fixture has roughly 42 CodeRunner calls with no managed
`require(...)`. That means CodeRunner overhead is no longer the most credible
source of a large speedup.

The next real optimization work should happen upstream in Rivet's graph runtime:

- `createProcessor(...)` setup and runtime planning;
- graph execution scheduling;
- repeated small-node orchestration;
- repeated subgraph/reference execution overhead;
- graph/subgraph boundary input/output mapping;
- safe runtime plan caching.

The first step is not to immediately build `runtimeProfile: "headless-fast"`.
The first step is to prove where runtime overhead actually sits. If the proven
fix is behavior-neutral, it should improve the default runtime. A
`headless-fast` profile should exist only if the faster path must skip or alter
behavior that editor, debugger, recording, replay, loop, race, or latest/debug
paths still need.

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

The wrapper developer then optimized the wrapper-owned `ManagedCodeRunner`:

- skipped runtime-library preparation for plain JS nodes;
- prepared runtime libraries lazily and at most once per request when
  `require(...)` is used;
- added a bounded successful `AsyncFunction` compile cache;
- cached managed `require` resolution by active runtime-library snapshot;
- added telemetry headers for CodeRunner calls, prepare/compile/execute time,
  and cache hits/misses;
- benchmarked through the real wrapper endpoint path.

The wrapper result was also modest. Telemetry confirmed the optimized path was
active, no runtime-library prepare happened for the fixture, cache hits happened,
and outputs stayed equivalent. The remaining runtime appears to be broader graph
execution overhead, not wrapper CodeRunner overhead.

Before implementation starts, copy the wrapper developer's exact before/after
benchmark numbers and telemetry summary into this section. The qualitative
result is enough to redirect the plan, but exact artifacts are needed before
comparing future upstream changes against wrapper endpoint performance.

## Goals

- Find the dominant upstream runtime overhead for the representative fixture.
- Improve the default Rivet runtime when the optimization is behavior-neutral.
- Preserve workflow outputs, project files, recordings, replay, debugger events,
  loops, races, project references, and public API behavior.
- Keep wrapper code responsible for endpoint IO, project/materialization caches,
  recordings, and managed runtime-library integration.
- Keep graph walking and scheduling semantics upstream in Rivet.
- Use benchmark data, not intuition, to decide whether `runtimeProfile:
  "headless-fast"` is justified.

## Non-Goals

- No wrapper-side graph execution reimplementation.
- No project YAML or schema change.
- No Rust/native runtime revival for this plan.
- No cosmetic timing-only changes.
- No default behavior regression for editor, debugger, recordings, replay,
  loops, races, abort handling, or project references.
- No `headless-fast` profile unless a measured optimization cannot safely be
  applied to the default runtime.
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
- If the best optimization must skip default-runtime behavior, design the
  smallest possible `runtimeProfile: "headless-fast"` path in P6.

## Benchmark Rules

Use both direct Rivet benchmarks and wrapper endpoint benchmarks.

Direct Rivet benchmarks answer whether upstream runtime changed:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER = 'local real workflow fixture'
$env:RIVET_RUNTIME_BENCH_ITERATIONS = '20'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS = '5'
$env:RIVET_RUNTIME_BENCH_SAMPLES = '15'
$env:RIVET_RUNTIME_BENCH_SESSIONS = '3'
$env:RIVET_RUNTIME_BENCH_OUTPUT = 'packages/node/bench-results/fixture-speedup-<baseline-or-after>-<sha>.json'
yarn bench:runtime-speed
```

Wrapper endpoint benchmarks answer whether the user's production launch path
improved:

```bash
npm --prefix wrapper/api run workflow-execution:measure -- --base-url http://localhost:8080 --endpoint graph-fixture-speed --kind published --runs 50 --warmups 10 --body '{}'
```

Run the wrapper API with:

```text
RIVET_WORKFLOW_EXECUTION_DEBUG_HEADERS=true
RIVET_CODE_RUNNER_TELEMETRY=true
```

The fixture requires no request inputs. Publish it under a stable endpoint name
such as `graph-fixture-speed`.

For any performance claim:

- run the same fixture, same Node version, same machine/container, same heap,
  same CPU limits, same storage mode, and same endpoint route before and after;
- capture at least two independent baselines before changing runtime code if
  the first baseline is noisy;
- use at least 3 independent sessions;
- keep raw JSON benchmark artifacts;
- record mean, median, p95, standard deviation, coefficient of variation, and
  confidence intervals;
- rerun noisy rows with coefficient of variation above 8 percent;
- compare direct Rivet numbers and wrapper endpoint `x-workflow-execute-ms`;
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
- Wrapper-side `ManagedCodeRunner` optimization was implemented by the wrapper
  developer and helped only modestly.
- Both passes make a large CodeRunner-only win unlikely for this fixture.

### P1: Add Upstream Runtime Attribution (TODO)

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
- `runNode` wrapper overhead before/after actual node implementation;
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

### P2: Characterize `createProcessor(...)` Setup Cost (TODO)

Measure whether fresh endpoint runs pay repeated setup costs that can be safely
planned once.

Inspect:

- processor construction;
- graph map construction;
- node lookup map construction;
- project reference loader interaction;
- dataset provider setup;
- graph validation or normalization repeated at runtime;
- default CodeRunner and runtime context construction;
- recorder/debugger/listener wiring when disabled or absent.
- wrapper endpoint timing split, if available:
  - project resolve/materialize;
  - project reference loader construction;
  - `createProcessor(...)`;
  - recorder construction/attachment;
  - `processor.run()`;
  - response shaping.

Decision gate:

- If setup is small, do not optimize it.
- If setup is material and immutable for a loaded project, introduce safe
  runtime planning or memoization.
- If planning depends on mutable run inputs, split immutable project planning
  from per-run input binding.

### P3: Build Safe Runtime Plan Caching For Default Runtime (TODO)

Only if P1/P2 prove repeated immutable planning is material, add a default-safe
runtime plan cache.

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

### P4: Reassess Graph Scheduling And Small-Node Overhead (TODO)

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
separate profile unless default semantics require expensive behavior that
headless endpoint runs can safely skip.

### P5: Reassess Subgraph Boundary Overhead (TODO)

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

### P6: Decide Default Optimization Versus `runtimeProfile: "headless-fast"` (TODO)

After P1-P5, decide where the optimization belongs.

Use default runtime if:

- behavior is identical;
- editor/debugger/recording/replay semantics stay intact;
- tests can cover the invariants;
- benchmark results are stable.

Introduce `runtimeProfile: "headless-fast"` only if the faster path must skip or
change behavior that the default runtime still needs.

If a profile is needed, it must be explicit and narrow:

```ts
createProcessor(project, {
  runtimeProfile: 'headless-fast',
  ...
});
```

Initial eligibility:

- published endpoint execution;
- no Remote Debugger;
- no active editor execution cache dependency;
- no behavior change to outputs or errors;
- recordings either remain equivalent or the profile is disabled when recording
  is enabled until proven safe.
- no workflow execution features that the profile explicitly does not support.

The wrapper may enable the profile for published endpoint runs after upstream
tests and benchmarks prove it. Latest/live/debugger paths should stay on the
default profile until separately validated.

If a profile is introduced, add an explicit fallback path. A workflow that is not
eligible for `headless-fast` must run on the default runtime automatically rather
than failing or silently changing behavior.

### P7: Wrapper Integration If A Profile Exists (TODO)

If upstream exposes `runtimeProfile: "headless-fast"`, the wrapper should only
opt in where safe.

Wrapper responsibilities:

- keep owning endpoint IO, auth, materialization caches, recordings, and managed
  runtime-library integration;
- pass `runtimeProfile: "headless-fast"` for eligible published endpoint runs;
- avoid the profile for latest/debugger runs at first;
- expose debug headers showing the selected runtime profile;
- keep before/after endpoint benchmark artifacts;
- keep a temporary env flag to disable the profile quickly in production.
- keep wrapper `ManagedCodeRunner` telemetry available during the rollout so
  upstream and wrapper overhead can still be separated.

The wrapper should not reimplement graph execution.

### P8: Benchmark Closeout And Docs (TODO)

For any upstream runtime change:

- run direct fixture benchmarks before and after;
- run wrapper endpoint fixture benchmarks before and after;
- run synthetic controls for many small nodes, many subgraphs, Code-heavy
  graphs, and no-Code graphs;
- run focused tests for recordings, replay, debugger lifecycle ordering, loops,
  races, abort behavior, project references, and concurrent runs;
- update developer docs with:
  - what changed;
  - which runtime paths are affected;
  - whether the change is default or profile-gated;
  - benchmark commands and artifacts;
  - before/after results;
  - remaining known overhead.

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
- wrapper endpoint benchmark before/after when testing production impact;
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
- Do not add a profile without a documented reason why default runtime cannot
  safely take the optimization.
- Keep rollback simple for any profile-gated change.
- Keep all caches bounded or tied to project/revision lifetimes.
- Do not allow a profiling flag to become part of normal production hot paths.

## Success Criteria

This plan succeeds if one of these outcomes happens:

- a measured default-runtime fixture improvement of at least 10 percent in mean
  or p95 without correctness regressions;
- a measured wrapper endpoint fixture improvement of at least 10 percent after a
  safe upstream default optimization or safe `headless-fast` profile;
- a clear attribution report proves that remaining runtime is dominated by user
  workflow logic or unavoidable small-node orchestration, and further speed work
  is not worth the complexity.

If attribution does not reveal a dominant upstream overhead bucket, stop. The
next move should be workflow-level simplification advice, not another speculative
runtime rewrite.
