# Runtime Speed Full Matrix Before/After

Benchmark command for each current run: `RIVET_RUNTIME_BENCH_SAMPLES=10`, `RIVET_RUNTIME_BENCH_ITERATIONS=30`, `RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS=10`, `RIVET_RUNTIME_BENCH_JSON=1`, `node_modules\.bin\tsx.cmd packages\node\bench\runtimeSpeed.bench.ts`.

- Baseline runtime: `e70f6e5d3d84db4519d4a31037ee66d82d028a10` with the current benchmark harness overlaid for an apples-to-apples row set.
- Current runtime: this change set after the P8-P12 recovery work.
- Runs averaged: two full current matrix runs. Current side rows include 20 samples and 600 measured iterations per benchmark row.
- Verdicts use a 0.05ms absolute noise gate: percentage changes below that absolute delta are neutral.
- Rows compared: 61. Big wins (<= -10%): 33; additional wins (-10% to -3%): 11; neutral: 16; slower (>= 3%): 1; regressions (>= 10%): 0.

| Benchmark | Before ms | After ms | Delta ms | Delta % | Verdict | Before run spread ms | After run spread ms |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| runGraphInFile passthrough one-shot | 0.980 | 0.769 | -0.211 | -21.5% | big win | 0.021 | 0.087 |
| runGraphInFile subgraph project one-shot | 1.528 | 1.218 | -0.310 | -20.3% | big win | 0.010 | 0.232 |
| runGraphInFile referenced-project one-shot with projectPath | 2.212 | 1.530 | -0.682 | -30.8% | big win | 0.197 | 0.161 |
| loadProjectFromString subgraph project only | 0.781 | 0.400 | -0.381 | -48.7% | big win | 0.020 | 0.065 |
| loadProjectFromFile subgraph project only | 0.965 | 0.595 | -0.370 | -38.3% | big win | 0.047 | 0.054 |
| load once + runGraph passthrough | 0.093 | 0.096 | 0.003 | 3.2% | neutral | 0.002 | 0.012 |
| reuse createProcessor passthrough | 0.070 | 0.072 | 0.002 | 2.9% | neutral | 0.004 | 0.004 |
| fresh createProcessor default-safe passthrough | 0.101 | 0.093 | -0.008 | -7.9% | neutral | 0.004 | 0.002 |
| createGraphRunner passthrough | 0.091 | 0.073 | -0.018 | -19.8% | neutral | 0.011 | 0.000 |
| direct GraphProcessor text chain 20 | 0.424 | 0.391 | -0.033 | -7.8% | neutral | 0.018 | 0.006 |
| runGraph text chain 20 | 0.435 | 0.455 | 0.020 | 4.5% | neutral | 0.022 | 0.063 |
| fresh createProcessor default-safe text chain 20 | 0.421 | 0.437 | 0.016 | 3.8% | neutral | 0.031 | 0.086 |
| runGraph text chain 100 | 1.713 | 1.753 | 0.040 | 2.3% | neutral | 0.018 | 0.370 |
| fresh createProcessor default-safe text chain 100 | 1.730 | 1.807 | 0.077 | 4.5% | slower | 0.059 | 0.421 |
| runGraph text chain 500 | 8.078 | 8.042 | -0.036 | -0.4% | neutral | 0.149 | 1.286 |
| direct GraphProcessor compatible text chain 500 | 7.737 | 7.759 | 0.022 | 0.3% | neutral | 0.135 | 1.678 |
| direct GraphProcessor fast-acyclic text chain 500 | 6.059 | 5.620 | -0.439 | -7.2% | win | 0.009 | 1.092 |
| createGraphRunner text chain 500 | 8.131 | 7.710 | -0.421 | -5.2% | win | 0.212 | 1.821 |
| createGraphRunner headless-fast text chain 500 | 5.546 | 5.171 | -0.375 | -6.8% | win | 0.086 | 1.349 |
| runGraph wide independent text nodes 100 | 2.693 | 2.542 | -0.151 | -5.6% | win | 0.093 | 0.164 |
| fresh createProcessor default-safe wide independent text nodes 100 | 2.703 | 2.547 | -0.156 | -5.8% | win | 0.130 | 0.168 |
| fresh createProcessor compatible text chain 500 | 8.809 | 7.280 | -1.529 | -17.4% | big win | 0.107 | 0.993 |
| fresh createProcessor default-safe text chain 500 | 8.691 | 7.544 | -1.147 | -13.2% | big win | 0.093 | 1.587 |
| fresh createProcessor headless-fast text chain 500 | 7.696 | 6.131 | -1.564 | -20.3% | big win | 0.005 | 0.645 |
| runGraph single subgraph call | 0.262 | 0.250 | -0.012 | -4.6% | neutral | 0.038 | 0.010 |
| fresh createProcessor default-safe single subgraph call | 0.278 | 0.277 | -0.001 | -0.2% | neutral | 0.011 | 0.027 |
| runGraph repeated subgraph same-input 50 | 11.404 | 10.657 | -0.747 | -6.6% | win | 2.202 | 0.698 |
| runGraph repeated subgraph changing-input 50 | 10.455 | 8.527 | -1.928 | -18.4% | big win | 3.269 | 0.265 |
| runGraph nested subgraph depth 5 | 1.583 | 1.381 | -0.202 | -12.8% | big win | 0.529 | 0.007 |
| fresh createProcessor default-safe nested subgraph depth 5 | 1.528 | 1.322 | -0.206 | -13.5% | big win | 0.396 | 0.060 |
| createGraphRunner compatible subgraph chain 50 | 10.241 | 8.886 | -1.355 | -13.2% | big win | 2.891 | 0.174 |
| createGraphRunner headless-fast subgraph chain 50 | 8.910 | 7.972 | -0.938 | -10.5% | big win | 2.636 | 0.793 |
| fresh createProcessor compatible repeated subgraph same-input 50 | 12.384 | 11.598 | -0.787 | -6.4% | win | 3.852 | 1.895 |
| fresh createProcessor default-safe repeated subgraph same-input 50 | 11.832 | 10.950 | -0.883 | -7.5% | win | 3.661 | 0.157 |
| fresh createProcessor headless-fast repeated subgraph same-input 50 | 9.012 | 8.101 | -0.911 | -10.1% | big win | 2.085 | 0.165 |
| fresh createProcessor compatible repeated subgraph changing-input 50 | 10.178 | 9.069 | -1.110 | -10.9% | big win | 2.808 | 0.765 |
| fresh createProcessor default-safe repeated subgraph changing-input 50 | 9.878 | 8.852 | -1.026 | -10.4% | big win | 2.854 | 1.073 |
| fresh createProcessor headless-fast repeated subgraph changing-input 50 | 9.030 | 8.499 | -0.531 | -5.9% | win | 2.618 | 0.204 |
| runGraph Call Graph repeated same-input 50 | 14.617 | 12.932 | -1.685 | -11.5% | big win | 3.662 | 0.880 |
| fresh createProcessor default-safe Call Graph repeated same-input 50 | 13.906 | 12.637 | -1.269 | -9.1% | win | 3.477 | 0.770 |
| runGraph Referenced Graph Alias repeated same-input 50 | 12.640 | 10.662 | -1.978 | -15.6% | big win | 3.543 | 0.002 |
| fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50 | 11.960 | 10.439 | -1.521 | -12.7% | big win | 3.222 | 0.304 |
| runGraph custom projectReferenceLoader referenced graph | 0.349 | 0.316 | -0.033 | -9.6% | neutral | 0.107 | 0.023 |
| fresh createProcessor default-safe custom projectReferenceLoader referenced graph | 0.362 | 0.333 | -0.029 | -8.0% | neutral | 0.142 | 0.034 |
| createGraphRunner compatible wide fan-in 200 | 7.090 | 6.288 | -0.801 | -11.3% | big win | 2.028 | 0.907 |
| direct GraphProcessor compatible wide fan-in 200 | 7.372 | 6.156 | -1.216 | -16.5% | big win | 1.290 | 0.340 |
| direct GraphProcessor fast-acyclic wide fan-in 200 | 3.712 | 2.809 | -0.903 | -24.3% | big win | 0.194 | 0.068 |
| createGraphRunner headless-fast wide fan-in 200 | 2.530 | 1.982 | -0.548 | -21.7% | big win | 0.567 | 0.060 |
| createGraphRunner compatible mixed subgraph fan-in | 7.826 | 7.075 | -0.751 | -9.6% | win | 1.929 | 0.045 |
| createGraphRunner headless-fast mixed subgraph fan-in | 4.093 | 3.518 | -0.575 | -14.0% | big win | 0.907 | 0.042 |
| runGraph expression chain 20 | 2.873 | 1.619 | -1.254 | -43.6% | big win | 0.629 | 0.299 |
| fresh createProcessor default-safe expression chain 20 | 2.820 | 1.492 | -1.327 | -47.1% | big win | 0.585 | 0.327 |
| createGraphRunner compatible expression chain 20 | 2.808 | 1.497 | -1.311 | -46.7% | big win | 0.608 | 0.376 |
| createGraphRunner headless-fast expression chain 20 | 2.506 | 1.401 | -1.105 | -44.1% | big win | 0.365 | 0.497 |
| runGraph code chain 20 | 6.891 | 1.588 | -5.303 | -77.0% | big win | 1.628 | 0.388 |
| fresh createProcessor default-safe code chain 20 | 7.036 | 1.546 | -5.489 | -78.0% | big win | 1.830 | 0.327 |
| createGraphRunner compatible code chain 20 | 7.006 | 1.479 | -5.527 | -78.9% | big win | 1.903 | 0.353 |
| createGraphRunner headless-fast code chain 20 | 6.740 | 1.260 | -5.481 | -81.3% | big win | 1.691 | 0.291 |
| lazy preprocess/dependency text chain 500 | 1.392 | 0.816 | -0.576 | -41.4% | big win | 0.152 | 0.214 |
| NodeCodeRunner compile/run one snippet | 0.001 | 0.002 | 0.001 | 50.0% | neutral | 0.000 | 0.001 |
| CachedNodeCodeRunner run cached snippet | 0.001 | 0.001 | 0.000 | 0.0% | neutral | 0.000 | 0.000 |
