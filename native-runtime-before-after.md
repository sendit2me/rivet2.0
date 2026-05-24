# Native Runtime Before/After Benchmark

Benchmark result for the opt-in `native-fast` runtime prototype.

## Run

- Date: 2026-05-24
- Commit: `76935631`
- Host: local Windows workstation
- Node: `v22.22.3`
- Rust: `rustc 1.95.0`, `cargo 1.95.0`
- Native worker build: `npm --prefix native-runtime run build:native`

Command shape:

```powershell
$env:RIVET_RUNTIME_BENCH_ITERATIONS = '100'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS = '10'
$env:RIVET_RUNTIME_BENCH_SAMPLES = '5'
$env:RIVET_RUNTIME_BENCH_JSON = '1'
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

Native rows also used:

```powershell
$env:RIVET_NATIVE_RUNTIME_MODULE = '<repo>\native-runtime\index.js'
$env:RIVET_NATIVE_RUNTIME_BACKEND = 'js'   # JS adapter control
$env:RIVET_NATIVE_RUNTIME_BACKEND = 'rust' # Rust worker candidate
```

The measured matrix compares:

- ordinary optimized TypeScript `createGraphRunner(...)`;
- `runtimeProfile: 'headless-fast'`;
- `runtimeProfile: 'native-fast'` through the local JS adapter;
- `runtimeProfile: 'native-fast'` through the Rust worker.

All values are mean milliseconds per run. Values in parentheses are standard
deviation across five sample means. Native speedups compare Rust worker time to
the fastest TypeScript row for the same workload.

## Results

| Workload                  | TypeScript compatible | TypeScript headless-fast | Native JS adapter | Native Rust worker | Rust vs best TypeScript |
| ------------------------- | --------------------: | -----------------------: | ----------------: | -----------------: | ----------------------: |
| Text chain 500            |         8.527 (0.627) |            6.999 (0.235) |     1.565 (0.013) |      0.875 (0.087) |            8.00x faster |
| Subgraph chain 50         |        10.889 (0.187) |            9.372 (0.504) |     0.309 (0.029) |      0.253 (0.016) |           37.04x faster |
| Wide fan-in 200           |         7.921 (1.007) |            2.768 (0.060) |     0.690 (0.017) |      0.471 (0.033) |            5.88x faster |
| Mixed subgraph fan-in     |         8.275 (0.266) |            4.454 (0.051) |     0.589 (0.008) |      0.330 (0.018) |           13.50x faster |
| Unsupported Code chain 20 |         8.156 (0.107) |            7.926 (0.058) |     8.175 (0.220) |      8.249 (0.359) |         native fallback |

## Targeted P4 Reference-Boundary Smoke

After P4 added static Referenced Graph Alias support, a small wiring benchmark
was run locally with `RIVET_RUNTIME_BENCH_FILTER='Referenced Graph Alias
repeated same-input 50'`, five measured iterations, one warmup iteration, one
sample, and `RIVET_NATIVE_RUNTIME_BACKEND=rust`. This is a quick smoke, not a
replacement for the five-sample matrix above.

| Workload                                                                           | Mean ms/run | Native backend | Native used |
| ---------------------------------------------------------------------------------- | ----------: | -------------- | ----------- |
| `runGraph Referenced Graph Alias repeated same-input 50`                           |      13.394 | TypeScript     | n/a         |
| `fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50` |      11.165 | TypeScript     | n/a         |
| `createGraphRunner native-fast Referenced Graph Alias repeated same-input 50`      |       0.266 | rust-worker    | true        |

## Full P5/P6 Follow-Up Matrix

After P4/P5/P6 cleanup, the full matrix was rerun locally on 2026-05-24 at
commit `4164dc3b` with the same host, Node `v22.22.3`, Rust `rustc 1.95.0`,
Cargo `cargo 1.95.0`, five samples, 100 measured iterations, 10 warmup
iterations, and `RIVET_NATIVE_RUNTIME_BACKEND=rust`.

Command shape:

```powershell
$env:RIVET_RUNTIME_BENCH_ITERATIONS = '100'
$env:RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS = '10'
$env:RIVET_RUNTIME_BENCH_SAMPLES = '5'
$env:RIVET_RUNTIME_BENCH_JSON = '1'
$env:RIVET_NATIVE_RUNTIME_MODULE = '<repo>\native-runtime\index.js'
$env:RIVET_NATIVE_RUNTIME_BACKEND = 'rust'
yarn workspace @valerypopoff/rivet2-node run bench:runtime-speed
```

Primary promotion rows:

| Workload                                      |                                  TypeScript peer | Native Rust worker |     Rust vs peer | Native used |
| --------------------------------------------- | -----------------------------------------------: | -----------------: | ---------------: | ----------- |
| Text chain 500                                |     7.199 ms (`createGraphRunner headless-fast`) |           0.825 ms |     8.73x faster | true        |
| Text chain 1000                               |    10.409 ms (`createGraphRunner headless-fast`) |           1.665 ms |     6.25x faster | true        |
| Subgraph chain 50                             |     8.570 ms (`createGraphRunner headless-fast`) |           0.247 ms |    34.70x faster | true        |
| Wide fan-in 200                               |     2.152 ms (`createGraphRunner headless-fast`) |           0.459 ms |     4.69x faster | true        |
| Mixed subgraph fan-in                         |     3.555 ms (`createGraphRunner headless-fast`) |           0.327 ms |    10.87x faster | true        |
| Referenced Graph Alias repeated same-input 50 | 10.214 ms (`fresh createProcessor default-safe`) |           0.271 ms |    37.69x faster | true        |
| Coalesce fan-in                               |        0.105 ms (`createGraphRunner compatible`) |           0.032 ms |     3.28x faster | true        |
| Destructure fan-out                           |        0.121 ms (`createGraphRunner compatible`) |           0.059 ms |     2.05x faster | true        |
| Extract Object Path                           |        0.095 ms (`createGraphRunner compatible`) |           0.058 ms |     1.64x faster | true        |
| Object construction                           |        0.103 ms (`createGraphRunner compatible`) |           0.038 ms |     2.71x faster | true        |
| Unsupported Expression chain 20               |        2.477 ms (`createGraphRunner compatible`) |  2.453 ms fallback | neutral fallback | false       |
| Unsupported Code chain 20                     |        6.001 ms (`createGraphRunner compatible`) |  6.153 ms fallback |   +2.5% fallback | false       |

Supported native rows compare against the fastest TypeScript peer captured for
that workload. Unsupported Code/Expression rows compare against compatible
`createGraphRunner(...)` because native-fast deliberately falls back to the
compatible TypeScript path for unsupported JavaScript-executing nodes; the
headless-fast CodeRunner shortcut remains a separate explicit TypeScript
profile, not the fallback contract for `native-fast`.

The 1000-node cheap-chain rows were added in a same-day filtered addendum with
the same host, Node, Rust, backend, sample count, iteration count, and warmup
count. They close the original 20/100/500/1000 cheap-chain benchmark gate
without rerunning unrelated rows.

Full row coverage:

| Row                                                                                 | Mean ms | Std dev | Native backend      | Native used / fallback                     |
| ----------------------------------------------------------------------------------- | ------: | ------: | ------------------- | ------------------------------------------ |
| `runGraphInFile passthrough one-shot`                                               |   0.964 |   0.130 | TypeScript          | n/a                                        |
| `runGraphInFile subgraph project one-shot`                                          |   1.426 |   0.113 | TypeScript          | n/a                                        |
| `runGraphInFile referenced-project one-shot with projectPath`                       |   1.592 |   0.048 | TypeScript          | n/a                                        |
| `loadProjectFromString subgraph project only`                                       |   0.412 |   0.020 | TypeScript          | n/a                                        |
| `loadProjectFromFile subgraph project only`                                         |   0.621 |   0.056 | TypeScript          | n/a                                        |
| `load once + runGraph passthrough`                                                  |   0.105 |   0.016 | TypeScript          | n/a                                        |
| `reuse createProcessor passthrough`                                                 |   0.067 |   0.003 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe passthrough`                                    |   0.091 |   0.010 | TypeScript          | n/a                                        |
| `createGraphRunner passthrough`                                                     |   0.081 |   0.006 | TypeScript          | n/a                                        |
| `direct GraphProcessor text chain 20`                                               |   0.425 |   0.056 | TypeScript          | n/a                                        |
| `runGraph text chain 20`                                                            |   0.461 |   0.021 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe text chain 20`                                  |   0.481 |   0.031 | TypeScript          | n/a                                        |
| `runGraph text chain 100`                                                           |   1.979 |   0.097 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe text chain 100`                                 |   1.879 |   0.093 | TypeScript          | n/a                                        |
| `runGraph text chain 500`                                                           |   8.108 |   0.390 | TypeScript          | n/a                                        |
| `runGraph text chain 1000`                                                          |  16.747 |   0.938 | TypeScript          | n/a                                        |
| `direct GraphProcessor compatible text chain 500`                                   |   8.675 |   0.835 | TypeScript          | n/a                                        |
| `direct GraphProcessor fast-acyclic text chain 500`                                 |   6.167 |   0.373 | TypeScript          | n/a                                        |
| `createGraphRunner text chain 500`                                                  |   8.711 |   0.826 | TypeScript          | n/a                                        |
| `createGraphRunner headless-fast text chain 500`                                    |   7.199 |   0.274 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast text chain 500`                                      |   0.825 |   0.096 | rust-worker         | true                                       |
| `createGraphRunner headless-fast text chain 1000`                                   |  10.409 |   0.095 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast text chain 1000`                                     |   1.665 |   0.172 | rust-worker         | true                                       |
| `runGraph wide independent text nodes 100`                                          |   3.418 |   0.055 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe wide independent text nodes 100`                |   3.405 |   0.075 | TypeScript          | n/a                                        |
| `fresh createProcessor compatible text chain 500`                                   |   9.180 |   0.735 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe text chain 500`                                 |   9.985 |   0.294 | TypeScript          | n/a                                        |
| `fresh createProcessor headless-fast text chain 500`                                |   8.166 |   0.175 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe text chain 1000`                                |  16.295 |   0.498 | TypeScript          | n/a                                        |
| `runGraph single subgraph call`                                                     |   0.310 |   0.010 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe single subgraph call`                           |   0.312 |   0.004 | TypeScript          | n/a                                        |
| `runGraph repeated subgraph same-input 50`                                          |  11.590 |   0.303 | TypeScript          | n/a                                        |
| `runGraph repeated subgraph changing-input 50`                                      |  10.172 |   0.241 | TypeScript          | n/a                                        |
| `runGraph nested subgraph depth 5`                                                  |   1.545 |   0.031 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe nested subgraph depth 5`                        |   1.590 |   0.117 | TypeScript          | n/a                                        |
| `createGraphRunner compatible subgraph chain 50`                                    |  10.504 |   0.188 | TypeScript          | n/a                                        |
| `createGraphRunner headless-fast subgraph chain 50`                                 |   8.570 |   0.364 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast subgraph chain 50`                                   |   0.247 |   0.023 | rust-worker         | true                                       |
| `fresh createProcessor compatible repeated subgraph same-input 50`                  |  11.791 |   0.246 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe repeated subgraph same-input 50`                |  11.292 |   0.104 | TypeScript          | n/a                                        |
| `fresh createProcessor headless-fast repeated subgraph same-input 50`               |   8.841 |   0.206 | TypeScript          | n/a                                        |
| `fresh createProcessor compatible repeated subgraph changing-input 50`              |  11.797 |   0.799 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe repeated subgraph changing-input 50`            |  10.639 |   0.685 | TypeScript          | n/a                                        |
| `fresh createProcessor headless-fast repeated subgraph changing-input 50`           |   9.112 |   0.150 | TypeScript          | n/a                                        |
| `runGraph Call Graph repeated same-input 50`                                        |  15.004 |   2.122 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe Call Graph repeated same-input 50`              |  12.625 |   0.553 | TypeScript          | n/a                                        |
| `runGraph Referenced Graph Alias repeated same-input 50`                            |  11.763 |   0.391 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50`  |  10.214 |   0.343 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast Referenced Graph Alias repeated same-input 50`       |   0.271 |   0.004 | rust-worker         | true                                       |
| `runGraph custom projectReferenceLoader referenced graph`                           |   0.293 |   0.022 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe custom projectReferenceLoader referenced graph` |   0.297 |   0.006 | TypeScript          | n/a                                        |
| `createGraphRunner compatible wide fan-in 200`                                      |   6.182 |   0.244 | TypeScript          | n/a                                        |
| `direct GraphProcessor compatible wide fan-in 200`                                  |   6.063 |   0.162 | TypeScript          | n/a                                        |
| `direct GraphProcessor fast-acyclic wide fan-in 200`                                |   2.815 |   0.103 | TypeScript          | n/a                                        |
| `createGraphRunner headless-fast wide fan-in 200`                                   |   2.152 |   0.049 | TypeScript          | n/a                                        |
| `createGraphRunner compatible coalesce fan-in`                                      |   0.105 |   0.007 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast coalesce fan-in`                                     |   0.032 |   0.001 | rust-worker         | true                                       |
| `createGraphRunner compatible destructure fan-out`                                  |   0.121 |   0.007 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast destructure fan-out`                                 |   0.059 |   0.004 | rust-worker         | true                                       |
| `createGraphRunner compatible extract object path`                                  |   0.095 |   0.006 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast extract object path`                                 |   0.058 |   0.009 | rust-worker         | true                                       |
| `createGraphRunner compatible object construction`                                  |   0.103 |   0.006 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast object construction`                                 |   0.038 |   0.002 | rust-worker         | true                                       |
| `createGraphRunner native-fast wide fan-in 200`                                     |   0.459 |   0.022 | rust-worker         | true                                       |
| `createGraphRunner compatible mixed subgraph fan-in`                                |   6.483 |   0.133 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast mixed subgraph fan-in`                               |   0.327 |   0.015 | rust-worker         | true                                       |
| `createGraphRunner headless-fast mixed subgraph fan-in`                             |   3.555 |   0.060 | TypeScript          | n/a                                        |
| `runGraph expression chain 20`                                                      |   2.571 |   0.097 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe expression chain 20`                            |   2.664 |   0.091 | TypeScript          | n/a                                        |
| `createGraphRunner compatible expression chain 20`                                  |   2.477 |   0.047 | TypeScript          | n/a                                        |
| `createGraphRunner headless-fast expression chain 20`                               |   2.296 |   0.049 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast unsupported expression chain 20`                     |   2.453 |   0.054 | TypeScript fallback | `unsupported-node:expression:expression-0` |
| `runGraph code chain 20`                                                            |   6.128 |   0.055 | TypeScript          | n/a                                        |
| `fresh createProcessor default-safe code chain 20`                                  |   6.161 |   0.040 | TypeScript          | n/a                                        |
| `createGraphRunner compatible code chain 20`                                        |   6.001 |   0.049 | TypeScript          | n/a                                        |
| `createGraphRunner headless-fast code chain 20`                                     |   5.851 |   0.015 | TypeScript          | n/a                                        |
| `createGraphRunner native-fast unsupported code chain 20`                           |   6.153 |   0.162 | TypeScript fallback | `unsupported-node:codeNew:code-0`          |
| `lazy preprocess/dependency text chain 500`                                         |   0.735 |   0.058 | TypeScript          | n/a                                        |
| `NodeCodeRunner compile/run one snippet`                                            |   0.001 |   0.000 | TypeScript          | n/a                                        |
| `CachedNodeCodeRunner run cached snippet`                                           |   0.001 |   0.000 | TypeScript          | n/a                                        |

The unsupported Code and Expression rows reported `nativeEligible=false`,
`nativeUsed=false`, and explicit `nativeFallbackReason` values. Those rows are
fallback safety checks, not native speed results. In the full follow-up matrix,
Expression fallback was effectively neutral versus compatible TypeScript, and
Code fallback was 2.5% slower than compatible TypeScript, inside the noisy
unsupported-row spread and below the plan's repeatable-regression threshold.

## Interpretation

The opt-in Rust worker clears the 30% feasibility gate for the intended target
shapes. The wins are large for cheap-node chains, wide fan-in, direct subgraphs,
referenced graph aliases, and mixed subgraph fan-in. The JS adapter control from
the first run showed that the native IR shape itself is also much cheaper than
the general TypeScript processor path; the follow-up run confirms the Rust
worker still clears the target gates after the referenced-boundary and
Code/Expression fallback work.

These are per-run improvements for a reused `createGraphRunner(...)`, not
memoized output wins. The compared TypeScript and native rows all reuse a
created runner across benchmark iterations; each iteration still performs a new
graph run with fresh run state. Native subgraph outputs are not cached by input
value.

This does not mean normal Rivet workflows are faster by default. `runGraph(...)`,
one-shot `createProcessor(...)`, the editor, debugger, Code, Expression, dynamic
Call Graph, Graph Reference, callback-sensitive, and plugin paths still use the
TypeScript engine unless a caller explicitly opts into `native-fast` and the
graph passes the narrow eligibility check. Static Referenced Graph Alias paths
can now enter native-fast only after the Node runner resolves the referenced
project snapshot and every reached graph passes the native subset.

## Outcome

The native-runtime plan's feasibility benchmark is satisfied for the current
prototype. The implementation is now complete for the plan's internal
native-fast gate: the worker-process Rust boundary is cross-platform CI-covered,
normal TypeScript paths remain default, and Code/Expression stay on whole-run
TypeScript fallback. The next useful work is not another scheduler rewrite; it
would be a separate release-packaging/product decision before any public or
default runtime behavior is changed.
