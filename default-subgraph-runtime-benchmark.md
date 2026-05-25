# Default Subgraph Runtime Benchmark

## Summary

This document records the default Subgraph runtime speed work from
[`default-subgraph-runtime-speed-plan.md`](default-subgraph-runtime-speed-plan.md).
The first targeted gate stayed conservative: no one-off single/nested Subgraph
promotion shipped because those rows did not show a repeatable win.

A later P3 slice did ship a narrow default `runGraph(...)` optimization:
unobservable runs whose selected root graph repeats the same direct Subgraph
target now use the existing TypeScript `headless-fast` scheduler automatically.
Remote Debugger, trace, abortable, callback-observed, editor-cache, and
project-reference runs keep the previous default-safe or compatible paths.
`createProcessor(...)` defaults are unchanged.

## Run

- Date: 2026-05-25
- Commit measured: `c57efd3d71ce95d390b29cbf2c8cb63107186da5` plus the
  uncommitted plan, benchmark, docs, and policy-test changes listed in the raw
  artifact metadata
- OS: Windows_NT 10.0.26200 x64
- CPU: Intel(R) Core(TM) Ultra 5 245KF
- Node: v22.22.3
- Samples: 30 raw samples per row, 3 sessions, 10 samples per session
- Iterations per sample: 30 measured runs
- Warmup per sample: 5 runs

- Raw artifact:
  [`packages/node/bench-results/default-subgraph-runtime-targeted.json`](packages/node/bench-results/default-subgraph-runtime-targeted.json)

Command:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='single subgraph|nested subgraph|Referenced Graph Alias repeated|custom projectReference|runGraph text chain 20|runGraph expression chain 20|runGraph code chain 20'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='30'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='5'
$env:RIVET_RUNTIME_BENCH_SAMPLES='10'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
$env:RIVET_RUNTIME_BENCH_OUTPUT='bench-results/default-subgraph-runtime-targeted.json'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

## Targeted Matrix

| Row | Mean ms | Median ms | CV | 95% CI ms |
| --- | ---: | ---: | ---: | --- |
| runGraph text chain 20 | 0.503 | 0.455 | 0.222 | 0.463-0.543 |
| runGraph single subgraph call | 0.347 | 0.312 | 0.283 | 0.312-0.382 |
| fresh createProcessor compatible single subgraph call | 0.318 | 0.307 | 0.203 | 0.295-0.342 |
| fresh createProcessor default-safe single subgraph call | 0.403 | 0.356 | 0.272 | 0.364-0.443 |
| reuse createProcessor default-safe single subgraph call | 0.255 | 0.241 | 0.154 | 0.241-0.270 |
| runGraph nested subgraph depth 5 | 1.512 | 1.433 | 0.146 | 1.433-1.591 |
| fresh createProcessor compatible nested subgraph depth 5 | 1.442 | 1.409 | 0.077 | 1.402-1.482 |
| fresh createProcessor default-safe nested subgraph depth 5 | 1.364 | 1.300 | 0.166 | 1.283-1.445 |
| reuse createProcessor default-safe nested subgraph depth 5 | 1.359 | 1.349 | 0.122 | 1.299-1.418 |
| runGraph Referenced Graph Alias repeated same-input 50 | 10.534 | 10.421 | 0.088 | 10.204-10.864 |
| fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50 | 9.252 | 9.262 | 0.025 | 9.167-9.336 |
| createGraphRunner native-fast Referenced Graph Alias repeated same-input 50 | 9.360 | 9.250 | 0.033 | 9.249-9.470 |
| runGraph custom projectReferenceLoader referenced graph | 0.270 | 0.267 | 0.050 | 0.265-0.274 |
| fresh createProcessor default-safe custom projectReferenceLoader referenced graph | 0.260 | 0.259 | 0.083 | 0.252-0.268 |
| runGraph expression chain 20 | 2.458 | 2.442 | 0.033 | 2.429-2.487 |
| runGraph code chain 20 | 6.156 | 6.134 | 0.021 | 6.111-6.202 |

The `createGraphRunner native-fast Referenced Graph Alias...` row is a
TypeScript fallback measurement in this checkout because the native runtime
package is not declared; it is not counted as a Rust/native speed result.

## Decision

- Keep the benchmark harness and raw artifact support.
- Treat this as a targeted no-ship gate, not as evidence that default Subgraph
  execution became faster.
- Keep one-off direct and nested Subgraph `runGraph(...)` calls on the
  compatible path.
- Keep one-off static Referenced Graph Alias `runGraph(...)` calls on the
  compatible path.
- Use a later P3 benchmark pass before changing repeated direct Subgraph
  `runGraph(...)` behavior; this first decision section predates that shipped
  slice.
- Do not ship subprocessor pooling or a TypeScript frame runner yet; this pass
  did not prove enough default-mode bottleneck attribution to justify either
  complexity.
- Continue with nested graph-frame work only after attribution points at a
  material repeatable cost; do not revisit P2-style pooling unless construction,
  listener wiring, or boundary map setup becomes measurable.

## Attribution Pass

This follow-up pass was added before implementing another optimization. It
measures whether the likely Subgraph costs are construction, graph-boundary
mapping, or the nested `processGraph(...)` execution boundary itself.

### Run

- Date: 2026-05-25
- Commit measured: `c57efd3d71ce95d390b29cbf2c8cb63107186da5` plus the
  uncommitted plan, benchmark, docs, and policy-test changes listed in the raw
  artifact metadata
- OS: Windows_NT 10.0.26200 x64
- CPU: Intel(R) Core(TM) Ultra 5 245KF
- Node: v22.22.3
- Samples: 30 raw samples per row, 3 sessions, 10 samples per session
- Iterations per sample: 50 measured runs
- Warmup per sample: 10 runs
- Raw artifact:
  [`packages/node/bench-results/default-subgraph-runtime-attribution.json`](packages/node/bench-results/default-subgraph-runtime-attribution.json)

Command:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='attribution|runGraph single subgraph call|fresh createProcessor compatible single subgraph call|fresh createProcessor default-safe single subgraph call|reuse createProcessor default-safe single subgraph call|runGraph nested subgraph depth 5|fresh createProcessor compatible nested subgraph depth 5|fresh createProcessor default-safe nested subgraph depth 5|reuse createProcessor default-safe nested subgraph depth 5'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='50'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='10'
$env:RIVET_RUNTIME_BENCH_SAMPLES='10'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
$env:RIVET_RUNTIME_BENCH_OUTPUT='bench-results/default-subgraph-runtime-attribution.json'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

### Key Attribution Rows

| Row | Mean ms | Median ms | CV | 95% CI ms |
| --- | ---: | ---: | ---: | --- |
| runGraph single subgraph call | 0.319 | 0.303 | 0.219 | 0.294-0.344 |
| attribution createProcessor object only single subgraph call | 0.013 | 0.012 | 0.283 | 0.012-0.014 |
| attribution construct GraphProcessor single subgraph root | 0.010 | 0.009 | 0.068 | 0.009-0.010 |
| attribution construct GraphProcessor single subgraph child | 0.011 | 0.009 | 0.833 | 0.008-0.015 |
| attribution direct GraphProcessor single subgraph root | 0.214 | 0.212 | 0.057 | 0.210-0.218 |
| attribution direct GraphProcessor single subgraph child body | 0.054 | 0.052 | 0.098 | 0.053-0.056 |
| attribution derive graph boundary equivalent single subgraph child | 0.000 | 0.000 | 0.239 | 0.000-0.000 |
| attribution cached graph boundary lookup equivalent single subgraph child | 0.000 | 0.000 | 0.321 | 0.000-0.000 |
| attribution build boundary input map equivalent single subgraph child | 0.000 | 0.000 | 0.042 | 0.000-0.000 |
| fresh createProcessor compatible single subgraph call | 0.235 | 0.227 | 0.086 | 0.227-0.242 |
| fresh createProcessor default-safe single subgraph call | 0.265 | 0.260 | 0.172 | 0.249-0.281 |
| reuse createProcessor default-safe single subgraph call | 0.217 | 0.214 | 0.079 | 0.211-0.223 |
| runGraph nested subgraph depth 5 | 1.178 | 1.170 | 0.067 | 1.150-1.206 |
| attribution construct GraphProcessor nested subgraph root | 0.010 | 0.009 | 0.494 | 0.008-0.012 |
| attribution construct GraphProcessor nested first child | 0.011 | 0.009 | 0.683 | 0.008-0.013 |
| attribution direct GraphProcessor nested subgraph root | 1.157 | 1.140 | 0.091 | 1.120-1.195 |
| attribution direct GraphProcessor nested first child | 0.929 | 0.937 | 0.061 | 0.908-0.949 |
| fresh createProcessor compatible nested subgraph depth 5 | 1.203 | 1.206 | 0.051 | 1.181-1.225 |
| fresh createProcessor default-safe nested subgraph depth 5 | 1.212 | 1.205 | 0.077 | 1.179-1.245 |
| reuse createProcessor default-safe nested subgraph depth 5 | 1.176 | 1.179 | 0.082 | 1.141-1.210 |

### Attribution Decision

- Child `GraphProcessor` construction is not the main bottleneck in these
  fixtures. It is roughly 0.01 ms per construction, far below the 0.2 ms single
  Subgraph run and the 1.1 ms nested depth-5 run.
- Node `createProcessor(...)` object construction is also too small to explain
  Subgraph runtime cost by itself.
- Graph-boundary derivation, cache lookup, and boundary input-map construction
  are effectively noise in the current small-boundary fixtures. More boundary
  caching is not the next likely default-runtime win.
- The measurable gap is the nested graph execution boundary: the single
  Subgraph root direct processor run is about 0.214 ms while the child body is
  about 0.054 ms. The remaining cost is in entering, running, and finalizing a
  nested `processGraph(...)` frame, including scheduler/finalization/lifecycle
  mechanics around the child graph.
- P2-style subprocessor pooling remains unjustified by this data. The only
  plausible route to a material default Subgraph win is a narrowly eligible
  TypeScript subgraph frame runner or a broader `processGraph(...)` hot-path
  reduction that avoids much of the nested graph frame overhead while preserving
  default event semantics.

## P3 Repeated `runGraph(...)` Slice

The first P3 implementation did not add a new frame runner. It used the
existing TypeScript `headless-fast` scheduler for a narrow default case:
unobservable `runGraph(...)` calls where the selected root graph repeats the
same direct Subgraph target. This targets repeated Subgraph fan-in without
touching `createProcessor(...)`, Remote Debugger, trace, abortable runs,
callbacks, editor execution cache, or project-reference runs.

### Before/After Run

- Date: 2026-05-25
- Before artifact:
  [`packages/node/bench-results/default-subgraph-runtime-repeated-headless-attribution.json`](packages/node/bench-results/default-subgraph-runtime-repeated-headless-attribution.json)
- After artifact:
  [`packages/node/bench-results/default-subgraph-runtime-repeated-headless-after.json`](packages/node/bench-results/default-subgraph-runtime-repeated-headless-after.json)
- Cheap-control rerun artifact:
  [`packages/node/bench-results/default-subgraph-runtime-text-control-after.json`](packages/node/bench-results/default-subgraph-runtime-text-control-after.json)
- OS: Windows_NT 10.0.26200 x64
- CPU: Intel(R) Core(TM) Ultra 5 245KF
- Node: v22.22.3
- Repeated-Subgraph samples: 30 raw samples per row, 3 sessions, 10 samples per
  session, 30 measured runs per sample, 5 warmups
- Cheap-control rerun: 30 raw samples, 100 measured runs per sample, 20 warmups

Command:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='repeated subgraph same-input 50|repeated subgraph changing-input 50|headless-fast repeated subgraph|compatible repeated subgraph|default-safe repeated subgraph|runGraph text chain 20|runGraph expression chain 20|runGraph code chain 20'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='30'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='5'
$env:RIVET_RUNTIME_BENCH_SAMPLES='10'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
$env:RIVET_RUNTIME_BENCH_OUTPUT='bench-results/default-subgraph-runtime-repeated-headless-after.json'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

Cheap-control rerun:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='runGraph text chain 20'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='100'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='20'
$env:RIVET_RUNTIME_BENCH_SAMPLES='10'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
$env:RIVET_RUNTIME_BENCH_OUTPUT='bench-results/default-subgraph-runtime-text-control-after.json'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

### Result Matrix

| Row | Before mean ms | After mean ms | Mean delta | Before median ms | After median ms | Median delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| runGraph repeated subgraph same-input 50 | 9.139 | 7.646 | -16.3% | 9.046 | 7.323 | -19.0% |
| runGraph repeated subgraph changing-input 50 | 7.649 | 7.026 | -8.1% | 7.614 | 6.926 | -9.0% |
| runGraph expression chain 20 | 2.426 | 2.478 | +2.1% | 2.392 | 2.457 | +2.7% |
| runGraph code chain 20 | 6.094 | 6.258 | +2.7% | 6.061 | 6.188 | +2.1% |
| runGraph text chain 20, rerun control | 0.475 | 0.476 | +0.2% | 0.427 | 0.449 | +5.2% |

The first post-change text-chain measurement was noisy (`CV=0.347`) and looked
like a large regression even though the new policy does not apply to that graph.
The longer control rerun returned to the previous mean and kept the median move
near the noise boundary for a sub-millisecond row.

### P3 Slice Decision

- Ship the narrow `runGraph(...)` repeated direct Subgraph promotion.
- Keep `createProcessor(...)` defaults unchanged.
- Keep one-off single/nested Subgraph calls compatible; this slice does not
  solve their nested graph-frame overhead.
- Keep observable/debugger/trace/abort/project-reference paths on the previous
  behavior.
- Treat the repeated changing-input row as a useful but smaller win. It missed
  the 10% median target by a small amount, while the same-input row cleared the
  gate strongly. Further default work should still require another benchmark
  gate before broadening eligibility.

## P6 Nested Graph-Frame Attribution

P6 added measured-duration attribution rows around graph-frame lifecycle
segments. These rows use processor lifecycle events to estimate where one-off
and nested Subgraph time is spent without adding product runtime
instrumentation.

### Run

- Date: 2026-05-25
- Attribution artifact:
  [`packages/node/bench-results/default-subgraph-runtime-frame-attribution.json`](packages/node/bench-results/default-subgraph-runtime-frame-attribution.json)
- Explicit `headless-fast` check artifact:
  [`packages/node/bench-results/default-subgraph-runtime-frame-headless-check.json`](packages/node/bench-results/default-subgraph-runtime-frame-headless-check.json)
- OS: Windows_NT 10.0.26200 x64
- CPU: Intel(R) Core(TM) Ultra 5 245KF
- Node: v22.22.3
- Samples: 30 raw samples per row, 3 sessions, 10 samples per session
- Iterations per sample: 30 measured runs
- Warmup per sample: 5 runs

The P6 artifacts show `gitDirty: true` because the benchmark-only attribution
rows were added before running the matrix. Product runtime files were not
changed for this pass.

Command:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='runGraph single subgraph call|runGraph nested subgraph depth 5|fresh createProcessor default-safe single subgraph call|fresh createProcessor default-safe nested subgraph depth 5|reuse createProcessor default-safe single subgraph call|reuse createProcessor default-safe nested subgraph depth 5|runGraph text chain 20|runGraph expression chain 20|runGraph code chain 20|attribution'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='30'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='5'
$env:RIVET_RUNTIME_BENCH_SAMPLES='10'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
$env:RIVET_RUNTIME_BENCH_OUTPUT='bench-results/default-subgraph-runtime-frame-attribution.json'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

Explicit `headless-fast` check:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='fresh createProcessor headless-fast single subgraph call|fresh createProcessor headless-fast nested subgraph depth 5|runGraph single subgraph call|runGraph nested subgraph depth 5|fresh createProcessor default-safe single subgraph call|fresh createProcessor default-safe nested subgraph depth 5'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='30'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='5'
$env:RIVET_RUNTIME_BENCH_SAMPLES='10'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
$env:RIVET_RUNTIME_BENCH_OUTPUT='bench-results/default-subgraph-runtime-frame-headless-check.json'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

### Public API Rows

| Row | Mean ms | Median ms | CV | 95% CI ms |
| --- | ---: | ---: | ---: | --- |
| runGraph text chain 20 | 0.502 | 0.447 | 0.229 | 0.461-0.543 |
| runGraph single subgraph call | 0.300 | 0.292 | 0.102 | 0.289-0.311 |
| fresh createProcessor default-safe single subgraph call | 0.260 | 0.263 | 0.142 | 0.247-0.274 |
| reuse createProcessor default-safe single subgraph call | 0.254 | 0.238 | 0.346 | 0.223-0.285 |
| runGraph nested subgraph depth 5 | 1.145 | 1.155 | 0.065 | 1.118-1.172 |
| fresh createProcessor default-safe nested subgraph depth 5 | 1.220 | 1.189 | 0.099 | 1.177-1.263 |
| reuse createProcessor default-safe nested subgraph depth 5 | 1.177 | 1.174 | 0.098 | 1.136-1.219 |
| runGraph expression chain 20 | 2.494 | 2.471 | 0.051 | 2.448-2.539 |
| runGraph code chain 20 | 6.169 | 6.111 | 0.023 | 6.117-6.221 |

### Frame Attribution Rows

These rows are observer-instrumented estimates. They are useful for rejecting
large missing hot spots, but they should not be treated as exact internal
subsystem timers because the lifecycle listeners themselves add a tiny amount of
work to the measured run.

| Row | Mean ms | Median ms | CV | 95% CI ms |
| --- | ---: | ---: | ---: | --- |
| attribution direct GraphProcessor single subgraph root | 0.227 | 0.226 | 0.117 | 0.217-0.236 |
| attribution direct GraphProcessor single subgraph child body | 0.057 | 0.052 | 0.156 | 0.054-0.061 |
| attribution measured single root process start to graphStart | 0.035 | 0.026 | 0.805 | 0.025-0.045 |
| attribution measured single root graphStart to first nodeStart | 0.012 | 0.010 | 0.536 | 0.009-0.014 |
| attribution measured single root last node terminal to graphFinish | 0.003 | 0.003 | 0.152 | 0.003-0.003 |
| attribution measured single root graphFinish to process resolve | 0.004 | 0.003 | 0.899 | 0.002-0.005 |
| attribution measured single child graphStart to first nodeStart | 0.012 | 0.012 | 0.267 | 0.011-0.014 |
| attribution measured single child last node terminal to graphFinish | 0.018 | 0.018 | 0.031 | 0.018-0.019 |
| attribution measured single child graphStart to graphFinish | 0.095 | 0.092 | 0.211 | 0.088-0.102 |
| attribution measured single root subgraph nodeStart to nodeFinish | 0.197 | 0.181 | 0.392 | 0.170-0.225 |
| attribution direct GraphProcessor nested subgraph root | 1.158 | 1.137 | 0.118 | 1.109-1.207 |
| attribution direct GraphProcessor nested first child | 0.929 | 0.911 | 0.136 | 0.884-0.974 |
| attribution measured nested root process start to graphStart | 0.031 | 0.030 | 0.154 | 0.029-0.033 |
| attribution measured nested root graphStart to first nodeStart | 0.011 | 0.011 | 0.114 | 0.011-0.012 |
| attribution measured nested root last node terminal to graphFinish | 0.004 | 0.003 | 0.553 | 0.003-0.005 |
| attribution measured nested first child graphStart to first nodeStart | 0.014 | 0.012 | 0.780 | 0.010-0.018 |
| attribution measured nested first child last node terminal to graphFinish | 0.019 | 0.019 | 0.054 | 0.018-0.019 |
| attribution measured nested first child graphStart to graphFinish | 1.007 | 1.001 | 0.065 | 0.983-1.030 |
| attribution measured nested root subgraph nodeStart to nodeFinish | 1.167 | 1.134 | 0.118 | 1.118-1.216 |

### Explicit `headless-fast` Check

| Row | Mean ms | Median ms | CV | 95% CI ms |
| --- | ---: | ---: | ---: | --- |
| fresh createProcessor default-safe single subgraph call | 0.306 | 0.303 | 0.123 | 0.293-0.320 |
| fresh createProcessor headless-fast single subgraph call | 0.256 | 0.258 | 0.107 | 0.246-0.266 |
| fresh createProcessor default-safe nested subgraph depth 5 | 1.266 | 1.251 | 0.101 | 1.220-1.311 |
| fresh createProcessor headless-fast nested subgraph depth 5 | 1.193 | 1.187 | 0.101 | 1.150-1.236 |

### P6 Decision

- P6 does not justify a new default runtime change.
- The tiny rows are still tiny: processor construction, graph-boundary work,
  root graph setup, graph-start-to-first-node, graph-finalization, and
  graph-finish-to-resolve are not large enough to be useful P7 targets in these
  fixtures.
- The single Subgraph child frame took about 0.095 ms from graphStart to
  graphFinish, while the direct child body took about 0.057 ms. The remaining
  opportunity is measured in a few hundredths of a millisecond for the one-off
  synthetic fixture.
- The nested depth-5 rows mostly reflect recursive child graph execution. The
  first child graphStart-to-graphFinish row was about 1.007 ms, close to the
  direct first-child processor row at about 0.929 ms.
- The explicit `headless-fast` check showed an isolated fresh single-Subgraph
  win, but the nested win was about 5% and does not clear the default-mode gate.
  It is also not safe to make omitted `createProcessor(...)` silently assume no
  event observation, because callers receive the processor and can observe it
  before `run()`.
- P7 and P8 are paused. A TypeScript frame runner remains a theoretical route,
  but the measured synthetic opportunity is too small to justify duplicating
  graph-frame semantics, lifecycle metadata, abort behavior, and fallback
  eligibility now.

## Local Real Workflow Fixture Baseline

The runtime-speed benchmark can also pick up a local, ignored
`.fixtures/graph-fixture.rivet-project` file. This fixture is intentionally not
checked in because it can contain production-shaped payload data. When present,
the benchmark runs the fixture's `metadata.mainGraphId` with no explicit inputs,
so Graph Input default-value mocks inside the project are part of the measured
workflow.

### Run

- Date: 2026-05-25
- Artifact:
  [`packages/node/bench-results/default-subgraph-runtime-real-fixture.json`](packages/node/bench-results/default-subgraph-runtime-real-fixture.json)
- Fixture path: `.fixtures/graph-fixture.rivet-project` (local, ignored)
- Graph: `Main Graph` (`29f17ff8-3aa4-4294-8a92-13116d5a8a9b`)
- Inputs: none
- OS: Windows_NT 10.0.26200 x64
- CPU: Intel(R) Core(TM) Ultra 5 245KF
- Node: v22.22.3
- Samples: 24 raw samples per row, 3 sessions, 8 samples per session
- Iterations per sample: 10 measured runs
- Warmup per sample: 3 runs

Command:

```powershell
$env:RIVET_RUNTIME_BENCH_FILTER='local real workflow fixture'
$env:RIVET_RUNTIME_BENCH_ITERATIONS='10'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS='3'
$env:RIVET_RUNTIME_BENCH_SAMPLES='8'
$env:RIVET_RUNTIME_BENCH_SESSIONS='3'
$env:RIVET_RUNTIME_BENCH_OUTPUT='bench-results/default-subgraph-runtime-real-fixture.json'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

### Results

| Row | Mean ms | Median ms | CV | 95% CI ms |
| --- | ---: | ---: | ---: | --- |
| loadProjectFromFile local real workflow fixture only | 35.710 | 35.617 | 0.031 | 35.269-36.150 |
| runGraphInFile local real workflow fixture no inputs | 76.919 | 76.089 | 0.039 | 75.710-78.127 |
| runGraph local real workflow fixture no inputs | 37.645 | 37.284 | 0.031 | 37.181-38.110 |
| fresh createProcessor default-safe local real workflow fixture no inputs | 38.472 | 37.723 | 0.085 | 37.166-39.777 |
| fresh createProcessor headless-fast local real workflow fixture no inputs | 27.915 | 27.779 | 0.023 | 27.662-28.169 |
| reuse createProcessor default-safe local real workflow fixture no inputs | 32.507 | 31.246 | 0.159 | 30.441-34.574 |

### Interpretation

- The fixture is now a better default Subgraph-speed signal than the tiny
  synthetic one-off/nested rows.
- `runGraphInFile(...)` is dominated by one-shot project loading plus execution:
  loading alone measured about 35.7 ms, while loaded `runGraph(...)` measured
  about 37.6 ms.
- The loaded default rows are stable enough to use as a regression baseline.
- The backend-style fresh default-safe `createProcessor(...)` row measured about
  38.5 ms mean, which is accepted as healthy for the current backend target.
- Explicit `headless-fast` on fresh `createProcessor(...)` is still meaningfully
  faster on this fixture: about 27.9 ms mean versus about 38.5 ms default-safe
  mean. Treat that as a diagnostic ceiling, not as an active requirement to
  change default behavior.
- Do not broaden omitted/default `createProcessor(...)` behavior solely to
  chase this gap. Keep the fixture rows as regression checks and reopen the
  policy investigation only if the backend latency target tightens or a future
  benchmark shows a regression.
