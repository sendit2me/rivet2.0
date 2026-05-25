# Default Subgraph Runtime Speed Plan

## Summary

Make Subgraph-heavy workflows faster in the default headless runtime, with no
developer opt-in, no project YAML changes, and no Rust/native requirement. The
first-class targets are omitted-profile `createProcessor(...).run()` and
`runGraph(...)`.

Remote Debugger and `includeTrace` runs stay on the fully compatible path for
this phase. The goal is real runtime speed, not debugger-only duration changes.

## Reassessment Decisions

- Do not make `native-fast` default. The Rust worker proved a large speed
  ceiling for narrow eligible workloads, but it still excludes Code,
  Expression, callbacks, debugger, trace, many node types, and most checked-in
  real workflows.
- Use native work as evidence and structure only: benchmark matrix discipline,
  graph-closure classification, fallback reporting, and isolation guards.
- Do not pool subprocessors for the current plan. Reusing `GraphProcessor`
  objects touches parent/executor metadata, abort/pause wiring, passive event
  forwarding, globals, and private per-run state, and the attribution pass did
  not show processor construction/listener setup as a material cost.
- Do not broadly promote `fast-acyclic`, loaded project-reference caching, or
  native execution into default mode. `fast-acyclic` can alter event ordering
  assumptions, loaded-reference caching changes loader call counts, and native
  execution has a narrower compatibility contract. Use `fast-acyclic` by
  default only for a benchmark-proven, silent `runGraph(...)` slice with hard
  fallback guards.
- Keep default optimizations TypeScript-owned. APIs that expose
  `runtimeProfile` remain reversible with the compatible runtime profile;
  `runGraph(...)` intentionally ignores untyped runtime profile overrides, so
  callers that need an explicit rollback path should use `createProcessor(...)`.

## Current Implementation Result

- P0 is complete for the first targeted no-ship gate: the runtime-speed
  benchmark now records metadata, raw samples, median, p75, p95, min/max,
  coefficient of variation, and 95% confidence bounds, and can write a
  machine-readable artifact. A full before/after matrix is still required
  before any future default speedup is shipped or claimed.
- P1 is complete with the benchmark gate applied. The attempted broadening for
  one-off static Subgraph shapes was rejected because the targeted matrix did
  not show a clear repeatable win. Repeated Referenced Graph Alias, repeated
  Call Graph, and default Code-family `runGraph(...)` promotions remain on the
  existing default-safe path.
- P2 is intentionally rejected for now. The current benchmark work did not
  prove a construction/listener bottleneck large enough to justify pooling
  subprocessors. The follow-up attribution pass shows the remaining measurable
  single-Subgraph gap is inside the nested `processGraph(...)` execution
  boundary, not processor construction or boundary-map setup.
- P3 is partially complete for a small default slice. Silent `runGraph(...)`
  calls whose root graph repeats the same direct Subgraph target now use the
  existing TypeScript `headless-fast` scheduler automatically. Observable,
  abortable, Remote Debugger, trace, editor-cache, and project-reference runs
  stay on the previous paths. `createProcessor(...)` defaults are unchanged.
- P3 is not complete for one-off single/nested Subgraph calls. The remaining
  candidate must still target nested graph-frame overhead directly, either by a
  narrow TypeScript subgraph frame runner or by a smaller `processGraph(...)`
  hot-path reduction. It should not revisit subprocessor pooling unless new
  data contradicts the attribution result.
- P4/P5 are complete for the shipped repeated-Subgraph `runGraph(...)` slice:
  policy guards were added, targeted benchmark artifacts were refreshed, and the
  result is documented in
  [`default-subgraph-runtime-benchmark.md`](default-subgraph-runtime-benchmark.md).

## Implementation Plan

### P0: Baseline And Attribution [DONE - TARGETED NO-SHIP GATE]

- Run a no-debugger default benchmark matrix before implementation, with
  multiple samples and exact command/env recorded.
- Benchmark the current mainline/default state before every implementation
  tranche. Do not reuse an older baseline unless the exact commit, OS, Node
  version, CPU mode, and benchmark harness are unchanged.
- Store raw benchmark samples, not only summaries, in a machine-readable file
  alongside the generated report. Include commit SHA, date, machine, OS, Node
  version, package manager version, warmup count, measured iteration count, and
  command line.
- Use a harness that reports median, mean, standard deviation, coefficient of
  variation, min, max, p75, p95, and a confidence interval or bootstrap interval
  for each row. The report must show the raw before/after delta and percent
  delta for median and mean.
- Run enough iterations to reduce noise:
  - at least 30 measured samples per row for cheap in-process fixtures;
  - at least 10 measured samples per row for slower workflow fixtures;
  - at least 3 independent benchmark sessions when a claimed win is under 20%.
- Separate warmup from measurement. Warm up each fixture before collecting
  samples, then discard warmup timings.
- Separate one-shot cold behavior from same-process repeated behavior:
  - fresh process / fresh `createProcessor(...)`;
  - same process / repeated `createProcessor(...).run()`;
  - `runGraph(...)` one-shot;
  - `runGraph(...)` repeated in the same process.
- Alternate or randomize row order within benchmark sessions so thermal drift,
  JIT warmup, and background OS noise do not consistently favor the before or
  after run.
- Include default target rows:
  - `runGraph single subgraph call`
  - `runGraph nested subgraph depth 5`
  - `runGraph repeated subgraph same-input 50`
  - `runGraph repeated subgraph changing-input 50`
  - `fresh createProcessor default-safe single subgraph call`
  - `fresh createProcessor default-safe nested subgraph depth 5`
  - `fresh createProcessor default-safe repeated subgraph same-input 50`
  - `fresh createProcessor default-safe repeated subgraph changing-input 50`
  - Call Graph and Referenced Graph Alias repeated rows
  - cheap/simple non-Subgraph control rows
- Include at least one real checked-in workflow fixture, if a safe fixture is
  available, in addition to synthetic microbenchmarks. Synthetic wins are not
  enough by themselves.
- Include negative/control rows that should not benefit:
  - a cheap graph with no Subgraph nodes;
  - a Code or Expression graph that is ineligible for the proposed change;
  - a project-reference loader fixture that confirms loader calls are not hidden
    by a new cache.
- Record matching `compatible`, `headless-fast`, and documented `native-fast`
  peer rows where available. Treat native rows as ceilings, not default-mode
  success claims.
- Add temporary or benchmark-only attribution if needed to separate:
  - child `GraphProcessor` construction;
  - child preprocessing and execution-plan reuse;
  - event forwarding and lifecycle listener wiring;
  - graph-boundary input/output map construction;
  - nested `processGraph(...)` initialization, scheduling, finalization, and
    output collection;
  - cached default CodeRunner effects.
- Do not keep any new default optimization enabled unless the attribution points
  to a real default-runtime bottleneck.
- Do not claim a speedup if the before/after confidence intervals overlap
  materially, the coefficient of variation is too high to trust the row, or the
  result appears only in a single benchmark session.

### P1: Promote Only Existing Safe TypeScript Pieces [DONE - GATED]

- Keep omitted-profile `createProcessor(...)` on the existing default-safe
  policy: compatible scheduling, run-scoped subprocessor execution-plan caching,
  graph-boundary caching, and cached default Node CodeRunner when no custom
  runner is supplied.
- For omitted-profile `runGraph(...)`, broaden default-safe eligibility only for
  static nested-graph shapes that P0 shows are neutral or faster. Start with
  direct `subGraph` and static `referencedGraphAlias` closures; do not blanket
  promote all single `callGraph` roots.
- Preserve current compatibility blockers:
  - Remote Debugger;
  - `includeTrace`;
  - explicit or unknown `runtimeProfile`;
  - project-reference loading that would change loader call counts;
  - any path whose benchmark shows a repeatable control-row regression.
- Add policy tests proving ordinary default paths still do not load native code.

### P2: Candidate Subprocessor Construction Reduction [SKIPPED - ATTRIBUTION REJECTED]

- Implement this phase only if future evidence contradicts the current
  attribution result. The 2026-05-25 attribution pass measured child
  `GraphProcessor` construction around 0.01 ms, which is far too small to be
  the main default Subgraph bottleneck.
- Prefer the smallest internal change that reduces that cost:
  - a private run-scoped subprocessor acquire/release helper;
  - keyed by project object, graph id, registry, scheduler, timing flag, and
    runtime-cache identity;
  - reused only when the child processor is idle;
  - reset before and after the parent `processGraph(...)` run;
  - never reused across backend requests.
- Every acquired child processor must get fresh per-call state:
  - executor node id, parent graph id, split index, and process id;
  - root/parent graph run metadata;
  - abort signal and parent abort wiring;
  - pause/resume lifecycle wiring;
  - globals, execution cache, context values, and graph inputs.
- Passive child event forwarding may be wired once per pooled processor, but
  per-call abort/pause/resume listeners must be cleaned up after the child graph
  terminal event.
- If this cannot be done with tight internal APIs and clear cleanup, do not ship
  pooling; move to P3 instead.

### P3: Reduce Nested Graph-Frame Overhead [PARTIAL - REPEATED RUNGRAPH SLICE DONE]

- First shipped slice: silent `runGraph(...)` calls whose selected root graph
  repeats the same direct Subgraph target are automatically run with
  `runtimeProfile: 'headless-fast'`. This reuses the existing TypeScript
  scheduler and run-scoped caches; it does not load native code and does not
  change `createProcessor(...)` defaults.
- The shipped slice is blocked by Remote Debugger, `includeTrace`, abort
  signals, event callbacks/listeners supplied through `runGraph(...)`, user
  event callbacks, editor execution cache, and project references. Those runs
  keep the previous default-safe or compatible paths.
- The shipped slice improved the repeated Subgraph benchmark rows, but it does
  not solve one-off single/nested Subgraph frame overhead. If we continue
  pursuing default Subgraph speed after this slice, the remaining plausible
  target is the nested graph execution boundary itself.
- Use the remaining P3 work only if we continue after the current shipped slice.
  P1 did not produce a one-off Subgraph win, and P2 was rejected by attribution.
- Start with more attribution before implementation if needed. The next probe
  should break the nested `processGraph(...)` boundary into:
  - graph-run initialization and metadata setup;
  - process-context base preparation;
  - dependency planning or preprocessing;
  - scheduler loop overhead;
  - graph-output collection and finalization;
  - lifecycle/event emission overhead in silent headless runs.
- Choose the smaller of two implementation routes after that probe:
  - optimize the existing `processGraph(...)` hot path if one specific step is
    clearly responsible;
  - add a narrow TypeScript subgraph frame runner only if the cost is spread
    across full nested graph-frame setup and teardown.
- Keep the first shipped path default but conditional, not opt-in. It may run
  automatically only for ordinary headless default runs where the compatibility
  contract is already proven. If the run is observable in ways the fast path
  cannot reproduce exactly, fall back to ordinary `GraphProcessor`.
- Reuse the native graph-closure idea, but keep execution TypeScript-owned and
  do not load native/Rust code.
- Start with a narrow eligible closure for any frame runner:
  `graphInput`, `text`, `join`, `object`, `coalesce`, `destructure`,
  `extractObjectPath`, `graphOutput`, direct `subGraph`, and static
  Referenced Graph Alias.
- The first frame-runner slice should be even narrower if that helps safety:
  direct Subgraph chains with one input, one output, and cheap deterministic
  built-in nodes are enough to prove or reject the approach.
- Eligibility must be graph-closure based. If any reached graph contains an
  unsupported node or unsupported dynamic behavior, the whole run must stay on
  the existing processor path before execution starts.
- Preserve event semantics. Either emit lifecycle events that match the
  compatible path, including node start/finish/exclusion, timings when enabled,
  graph start/finish, output maps, and parent/child graph-run metadata, or
  disable the fast path for observable runs.
- Treat these as hard fallback blockers for the first shipped slice:
  Remote Debugger, `includeTrace`, execution recording, callbacks/listeners
  that observe processor events, user input, pause/resume, wait events, split
  run, race, loop, dynamic graph calls, custom registries with non-built-in
  nodes, Code, Expression, and uncertain project-reference loader behavior.
- Preserve abort behavior. If the narrow frame runner cannot observe abort
  signals at the same boundaries as `GraphProcessor`, fall back until parity is
  proven by tests.
- Do not cache final Subgraph outputs. This phase is about reducing per-run
  frame overhead, not memoizing runtime values across calls.
- Add benchmark rows before and after the implementation:
  - direct Subgraph frame runner eligible single call;
  - nested Subgraph depth 5 eligible chain;
  - repeated Subgraph same-input 50 eligible fan-in;
  - repeated Subgraph changing-input 50 eligible chain;
  - mixed Subgraph fan-in with a wider child graph;
  - no-Subgraph cheap controls;
  - Code/Expression ineligible controls;
  - observable/debugger/trace fallback controls.
- Ship only if at least two Subgraph-heavy rows clear the P5 acceptance gate
  and all fallback/control rows stay neutral.

### P4: Equivalence And Safety Tests [DONE FOR REPEATED RUNGRAPH SLICE - EXTEND BEFORE NEXT SLICE]

- Core characterization tests:
  - sequential repeated Subgraph calls;
  - parallel and split-run Subgraph calls;
  - nested Subgraph chains preserving `rootRunId`, `graphRunId`,
    `parentGraphRunId`, executor node id, split index, and process id;
  - abort and successful abort behavior;
  - user events and user input propagation;
  - globals and wait-for-global behavior;
  - partial outputs and node timings;
  - Referenced Graph Alias and Call Graph equivalence.
- Node API policy tests:
  - omitted `createProcessor(...)` uses only default-safe TypeScript pieces;
  - omitted `runGraph(...)` broadens only for approved nested-graph shapes;
  - simple non-nested `runGraph(...)` remains compatible;
  - Remote Debugger, `includeTrace`, explicit `compatible`, and unknown profiles
    stay compatible;
  - default `runGraph(...)` and `createProcessor(...)` do not load native code.
- Reuse existing `defaultFastCompatibility` and `nativeRuntimeEquivalence`
  fixture patterns, but require stricter event parity for default mode than
  native-fast requires.
- Before any P3 fast path ships, add frame-runner-specific tests for:
  - eligible direct and nested Subgraph output parity;
  - fallback before execution for unsupported nodes and observable runs;
  - lifecycle event parity when the fast path claims to support observable runs;
  - abort parity at graph and child-node boundaries;
  - no native-module loading and no project mutation;
  - no final-output memoization across repeated or changing inputs.

### P5: Benchmark Gate And Documentation [DONE FOR REPEATED RUNGRAPH SLICE - RERUN BEFORE NEXT SLICE]

- Rerun the same no-debugger default benchmark matrix from P0.
- Run the before/after comparison on the same machine, using the same benchmark
  harness and the same fixture inputs. If possible, benchmark the previous
  baseline commit and the optimized commit in the same session to reduce
  machine-day noise.
- Keep the raw sample artifacts for both before and after. The documentation
  must link or name the artifact paths and include the summarized matrix.
- Acceptance gate:
  - `createProcessor(...)` Subgraph-heavy rows improve materially, targeting at
    least 10% median improvement on at least two rows, with matching mean
    improvement and no confidence-interval overlap that would make the result
    ambiguous;
  - `runGraph(...)` Subgraph-heavy rows improve or stay statistically flat;
  - cheap/simple non-Subgraph controls do not regress by more than 5% median or
    mean, and any small movement must be inside measured noise;
  - unsupported Code/Expression controls stay neutral;
  - at least one claimed win reproduces across three independent benchmark
    sessions when the improvement is below 20%;
  - benchmark results are documented honestly, including neutral rows,
    regressions, variance, and any rows rejected as too noisy.
- If the gate fails, disable the attempted default optimization, document the
  result, and continue only with the next gated phase.
- Update `developer-docs/PACKAGES.md` after implementation to describe the
  shipped default behavior, the rollback path, and the before/after matrix.

## Verification Commands

- `yarn workspace @valerypopoff/rivet2-core test`
- `yarn workspace @valerypopoff/rivet2-node test`
- focused runtime/default-fast compatibility tests
- no-debugger runtime benchmark matrix with raw samples, warmups, variance, and
  before/after confidence reporting
- `git diff --check`

## Assumptions And Non-Goals

- Default-mode targets are omitted-profile `createProcessor(...).run()` and
  `runGraph(...)`.
- Default event compatibility matters more than maximum possible speed.
- Speedups must come from reducing nested graph-frame overhead, not from
  caching final Subgraph results. The current attribution rejects
  construction-only and graph-boundary-only work as likely wins for the small
  default fixtures.
- `runtimeProfile: 'compatible'` remains the rollback path on APIs that expose
  runtime profiles. `runGraph(...)` still ignores untyped `runtimeProfile`
  properties, so its explicit rollback path is using `createProcessor(...)`
  with `runtimeProfile: 'compatible'`.
- `headless-fast` and `native-fast` remain opt-in proving grounds.
- Remote Debugger and `includeTrace` are fallback blockers for the first P3
  implementation slice unless lifecycle parity is explicitly implemented and
  tested.
- Native-fast benchmark wins are evidence about the ceiling and target shape,
  not permission to route default execution through Rust/native code.
