# Default Subgraph Runtime Speed Plan

## Status

Closed. The default TypeScript runtime is the supported path, and the
experimental opt-in fast/native work has been retired from the app and Node API
surface.

## Goal

Make Subgraph-heavy workflows faster in the default headless runtime, with no
developer opt-in, no project YAML changes, and no separate native dependency.
The first-class targets are omitted-profile `createProcessor(...).run()` and
`runGraph(...)`.

Remote Debugger and `includeTrace` runs stay on the fully compatible path unless
their behavior is separately characterized.

## Decisions

- Keep the default runtime TypeScript-owned.
- Keep omitted-profile `createProcessor(...)` on the default-safe policy:
  compatible scheduling, run-scoped subprocessor execution-plan caching,
  graph-boundary caching, and cached default Node CodeRunner when no custom
  runner is supplied.
- Keep `runtimeProfile: 'compatible'` as the only documented rollback profile.
- Keep `runGraph(...)` ignoring untyped runtime-profile values.
- Do not ship subprocessor pooling. Attribution showed processor construction
  and boundary-map work are too small to justify the extra state-management
  complexity.
- Do not add a separate native execution path. The production-shaped fixture
  already runs within the accepted backend target on the default TypeScript
  runtime.

## Benchmark Gate

Every future default speed change must start with a benchmark matrix that:

- records commit SHA, date, machine, OS, CPU, Node version, package manager
  version, warmup count, measured iterations, samples, sessions, command line,
  and dirty working-tree status;
- stores raw benchmark samples, not only summaries;
- reports median, mean, standard deviation, coefficient of variation, min,
  max, p75, p95, and a confidence interval for each row;
- separates warmup from measurement;
- separates one-shot cold behavior from same-process repeated behavior;
- includes cheap non-Subgraph control rows;
- includes Subgraph, nested Subgraph, repeated Subgraph, Call Graph, Referenced
  Graph Alias, Code, Expression, and project-reference rows;
- includes the local `.fixtures/graph-fixture.rivet-project` row when that
  ignored fixture is available;
- avoids claiming a speedup when confidence intervals overlap materially or
  variation is too high.

Use [`packages/node/bench/runtimeSpeed.bench.ts`](packages/node/bench/runtimeSpeed.bench.ts)
through `yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed`.

## Final Evidence

The production-shaped local fixture at `.fixtures/graph-fixture.rivet-project`
runs the main graph with no explicit inputs because the graph owns its mocked
defaults. The latest accepted local baseline measured:

| Row | Mean |
| --- | ---: |
| loaded `runGraph(...)` local real workflow fixture | about 37.6 ms |
| fresh `createProcessor(...)` local real workflow fixture | about 38.5 ms |

That is healthy for the current backend target, so no further default
`createProcessor(...)` behavior change is planned from this evidence.

## Future Work

Reopen this plan only if the backend latency target tightens or the benchmark
fixture regresses. A reopened change must begin with the benchmark gate above,
then prove a real default-runtime bottleneck before adding code. Favor small
TypeScript hot-path reductions over new execution modes.
