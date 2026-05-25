# Default Subgraph Runtime Benchmark

## Summary

This document records the closeout state for the default Subgraph runtime speed
work. The default TypeScript runtime met the current backend target on the
production-shaped local fixture, so the experimental opt-in fast/native work was
removed from the app and Node API surface.

## How To Reproduce

Run the main benchmark harness from the Node package:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='local real workflow fixture'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='10'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='3'
$env:RIVET_RUNTIME_BENCH_SAMPLES='10'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

The optional local fixture lives at `.fixtures/graph-fixture.rivet-project` and
is intentionally ignored by Git because it can contain production-shaped
payloads. It runs with no explicit inputs; the workflow owns its mocked/default
Graph Input values.

For a broader matrix, remove the filter or target Subgraph, nested Subgraph,
Call Graph, Referenced Graph Alias, Code, Expression, and cheap control rows.
The benchmark output includes raw sample timings plus mean, median, p75, p95,
min/max, standard deviation, coefficient of variation, and 95% confidence
bounds.

## Accepted Local Baseline

On the local Windows/Node 22.22.3 fixture run that closed the plan:

| Row | Mean |
| --- | ---: |
| loaded `runGraph(...)` local real workflow fixture | about 37.6 ms |
| fresh `createProcessor(...)` local real workflow fixture | about 38.5 ms |

This is considered healthy for the current backend target.

## Decision

- Keep the default runtime TypeScript-only.
- Keep omitted-profile `createProcessor(...)` on the default-safe policy:
  subprocessor execution-plan caching, graph-boundary caching, and cached
  default Node CodeRunner when no custom runner is supplied.
- Keep `runtimeProfile: 'compatible'` as the only documented rollback profile.
- Keep `createGraphRunner(...)` as the repeated-run reuse API, without an
  opt-in execution-mode selector.
- Do not ship subprocessor pooling or a separate native execution path.
- Reopen only if the local fixture or the broader matrix regresses against the
  backend latency target.
