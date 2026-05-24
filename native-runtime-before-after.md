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

| Workload | TypeScript compatible | TypeScript headless-fast | Native JS adapter | Native Rust worker | Rust vs best TypeScript |
| --- | ---: | ---: | ---: | ---: | ---: |
| Text chain 500 | 8.527 (0.627) | 6.999 (0.235) | 1.565 (0.013) | 0.875 (0.087) | 8.00x faster |
| Subgraph chain 50 | 10.889 (0.187) | 9.372 (0.504) | 0.309 (0.029) | 0.253 (0.016) | 37.04x faster |
| Wide fan-in 200 | 7.921 (1.007) | 2.768 (0.060) | 0.690 (0.017) | 0.471 (0.033) | 5.88x faster |
| Mixed subgraph fan-in | 8.275 (0.266) | 4.454 (0.051) | 0.589 (0.008) | 0.330 (0.018) | 13.50x faster |
| Unsupported Code chain 20 | 8.156 (0.107) | 7.926 (0.058) | 8.175 (0.220) | 8.249 (0.359) | native fallback |

## Targeted P4 Reference-Boundary Smoke

After P4 added static Referenced Graph Alias support, a small wiring benchmark
was run locally with `RIVET_RUNTIME_BENCH_FILTER='Referenced Graph Alias
repeated same-input 50'`, five measured iterations, one warmup iteration, one
sample, and `RIVET_NATIVE_RUNTIME_BACKEND=rust`. This is a quick smoke, not a
replacement for the five-sample matrix above.

| Workload | Mean ms/run | Native backend | Native used |
| --- | ---: | --- | --- |
| `runGraph Referenced Graph Alias repeated same-input 50` | 13.394 | TypeScript | n/a |
| `fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50` | 11.165 | TypeScript | n/a |
| `createGraphRunner native-fast Referenced Graph Alias repeated same-input 50` | 0.266 | rust-worker | true |

The unsupported Code row reported `nativeEligible=false`, `nativeUsed=false`,
and `nativeFallbackReason=unsupported-node:codeNew:code-0` for both native
backends. That row is a fallback safety check, not a native speed result. The
Rust fallback was 1.1% slower than the compatible TypeScript row, which is
inside the measured sample spread and does not indicate a meaningful regression.

## Interpretation

The opt-in Rust worker clears the 30% feasibility gate for the intended target
shapes. The wins are large for cheap-node chains, wide fan-in, direct subgraphs,
and mixed subgraph fan-in, and the JS adapter control shows that the native IR
shape itself is also much cheaper than the general TypeScript processor path.

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
prototype. The next useful work is not another scheduler rewrite; it is
production hardening around native packaging, CI coverage, platform artifacts,
and expanded equivalence tests before any public or default runtime behavior is
changed.
