import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProcessor,
  createGraphRunner,
  loadProjectFromFile,
  runGraph,
  runGraphInFile,
  type DataValue,
} from '../src/index.js';
import { NodeCodeRunner } from '../src/native/NodeCodeRunner.js';
import {
  createRuntimeSpeedProcessContext,
  createRuntimeSpeedProcessor,
  makeCodeChainProject,
  makeExpressionChainProject,
  makeTextChainProject,
  type RuntimeSpeedProjectFixture,
} from '../test/runtimeSpeedFixtures.js';

type BenchmarkResult = {
  iterations: number;
  maxMeanMs: string;
  meanMs: string;
  minMeanMs: string;
  name: string;
  samples: number;
  stdDevMs: string;
  totalMs: string;
};

const benchDir = dirname(fileURLToPath(import.meta.url));
const nodePackageDir = join(benchDir, '..');
const testGraphsPath = join(nodePackageDir, 'test', 'test-graphs.rivet-project');
const iterations = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_ITERATIONS', 50);
const warmupIterations = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS', 5);
const samples = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_SAMPLES', 1);

async function main() {
  const passthroughProject = await loadProjectFromFile(testGraphsPath);
  const cheap20 = makeTextChainProject(20);
  const cheap100 = makeTextChainProject(100);
  const cheap500 = makeTextChainProject(500);
  const expression20 = makeExpressionChainProject(20);
  const code20 = makeCodeChainProject(20);
  const codeRunner = new NodeCodeRunner();
  const results: BenchmarkResult[] = [];

  results.push(
    await benchmark('runGraphInFile passthrough one-shot', () =>
      runGraphInFile(testGraphsPath, {
        graph: 'Passthrough',
        inputs: { input: 'bench' },
      }),
    ),
  );

  results.push(
    await benchmark('load once + runGraph passthrough', () =>
      runGraph(passthroughProject, {
        graph: 'Passthrough',
        inputs: { input: 'bench' },
      }),
    ),
  );

  {
    const processor = createProcessor(passthroughProject, {
      graph: 'Passthrough',
      inputs: { input: 'bench' },
    });
    results.push(await benchmark('reuse createProcessor passthrough', () => processor.run()));
  }

  {
    const runner = createGraphRunner(passthroughProject, {
      graph: 'Passthrough',
    });
    results.push(
      await benchmark('createGraphRunner passthrough', () => runner.run({ inputs: { input: 'bench' } })),
    );
  }

  {
    const processor = createRuntimeSpeedProcessor(cheap20.project, cheap20.graphId);
    const context = createRuntimeSpeedProcessContext();
    const inputs = { input: { type: 'string', value: 'bench' } satisfies DataValue };
    results.push(await benchmark('direct GraphProcessor text chain 20', () => processor.processGraph(context, inputs)));
  }

  results.push(
    await benchmark('runGraph text chain 20', () =>
      runGraph(cheap20.project, { graph: cheap20.graphId, inputs: { input: 'bench' } }),
    ),
  );
  results.push(
    await benchmark('runGraph text chain 100', () =>
      runGraph(cheap100.project, { graph: cheap100.graphId, inputs: { input: 'bench' } }),
    ),
  );
  results.push(
    await benchmark('runGraph text chain 500', () =>
      runGraph(cheap500.project, { graph: cheap500.graphId, inputs: { input: 'bench' } }),
    ),
  );
  {
    const runner = createGraphRunner(cheap500.project, {
      graph: cheap500.graphId,
    });
    results.push(
      await benchmark('createGraphRunner text chain 500', () => runner.run({ inputs: { input: 'bench' } })),
    );
  }
  results.push(
    await benchmark('runGraph expression chain 20', () =>
      runGraph(expression20.project, { graph: expression20.graphId, inputs: { input: 0 } }),
    ),
  );
  results.push(
    await benchmark('runGraph code chain 20', () =>
      runGraph(code20.project, { graph: code20.graphId, inputs: { input: 0 } }),
    ),
  );
  results.push(
    await benchmark('lazy preprocess/dependency text chain 500', () => benchmarkLazyPreprocessDependency(cheap500)),
  );
  results.push(await benchmark('NodeCodeRunner compile/run one snippet', () => benchmarkCodeRunner(codeRunner)));

  console.table(results);
}

async function benchmark(name: string, run: () => Promise<unknown> | unknown): Promise<BenchmarkResult> {
  const sampleMeanMs: number[] = [];
  let measuredTotalMs = 0;

  for (let sample = 0; sample < samples; sample++) {
    for (let i = 0; i < warmupIterations; i++) {
      await run();
    }

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await run();
    }

    const totalMs = performance.now() - start;
    measuredTotalMs += totalMs;
    sampleMeanMs.push(totalMs / iterations);
  }

  const meanMs = average(sampleMeanMs);

  return {
    iterations,
    maxMeanMs: Math.max(...sampleMeanMs).toFixed(3),
    meanMs: meanMs.toFixed(3),
    minMeanMs: Math.min(...sampleMeanMs).toFixed(3),
    name,
    samples,
    stdDevMs: standardDeviation(sampleMeanMs, meanMs).toFixed(3),
    totalMs: measuredTotalMs.toFixed(3),
  };
}

async function benchmarkCodeRunner(runner: NodeCodeRunner): Promise<Record<string, DataValue | undefined>> {
  return runner.runCode(
    "return { output: { type: 'any', value: inputs.input.value + 1 } };",
    {
      input: { type: 'number', value: 1 },
    },
    {
      includeConsole: false,
      includeFetch: false,
      includeProcess: false,
      includeRequire: false,
      includeRivet: false,
    },
  );
}

function benchmarkLazyPreprocessDependency(fixture: RuntimeSpeedProjectFixture): unknown {
  if (!fixture.terminalNodeId) {
    throw new Error('Runtime speed fixture must provide a terminal node id for dependency benchmarking.');
  }

  const processor = createRuntimeSpeedProcessor(fixture.project, fixture.graphId);
  return processor.getDependencyNodesDeep(fixture.terminalNodeId);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean = average(values)): number {
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

await main();
