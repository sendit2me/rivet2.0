import { performance } from 'node:perf_hooks';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProcessor,
  createGraphRunner,
  loadProjectFromFile,
  loadProjectFromString,
  runGraph,
  runGraphInFile,
  serializeProject,
  type DataValue,
  type GraphProcessorScheduler,
  type NodeCreateProcessorOptions,
  type NodeGraphRunnerOptions,
  type NodeGraphRunnerRunOptions,
  type Project,
} from '../src/index.js';
import { CachedNodeCodeRunner } from '../src/native/CachedNodeCodeRunner.js';
import { NodeCodeRunner } from '../src/native/NodeCodeRunner.js';
import {
  createRuntimeSpeedProcessContext,
  createRuntimeSpeedProcessor,
  makeCodeChainProject,
  makeCallGraphFanInProject,
  makeCoalesceFanInProject,
  makeDestructureFanOutProject,
  makeExtractObjectPathProject,
  makeExpressionChainProject,
  makeMixedSubgraphFanInProject,
  makeNestedSubgraphProject,
  makeObjectConstructionProject,
  makeReferencedGraphAliasFanInProject,
  makeRepeatedSubgraphFanInProject,
  makeSubgraphChainProject,
  makeTextChainProject,
  makeWideTextFanInProject,
  type RuntimeSpeedProjectFixture,
} from '../test/runtimeSpeedFixtures.js';

type BenchmarkResult = {
  nativeBackend?: string;
  nativeEligible?: boolean;
  nativeFallbackReason?: string;
  nativeUsed?: boolean;
  iterations: number;
  maxMeanMs: string;
  meanMs: string;
  minMeanMs: string;
  name: string;
  samples: number;
  stdDevMs: string;
  totalMs: string;
};

type BenchmarkProjectFiles = {
  cleanup: () => Promise<void>;
  referencedProjectPath: string;
  subgraphProjectPath: string;
};

const benchDir = dirname(fileURLToPath(import.meta.url));
const nodePackageDir = join(benchDir, '..');
const testGraphsPath = join(nodePackageDir, 'test', 'test-graphs.rivet-project');
const iterations = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_ITERATIONS', 50);
const warmupIterations = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS', 5);
const samples = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_SAMPLES', 1);
const benchmarkFilter = readBenchmarkFilter();

async function main() {
  const passthroughProject = await loadProjectFromFile(testGraphsPath);
  const cheap20 = makeTextChainProject(20);
  const cheap100 = makeTextChainProject(100);
  const cheap500 = makeTextChainProject(500);
  const cheap1000 = makeTextChainProject(1000);
  const expression20 = makeExpressionChainProject(20);
  const code20 = makeCodeChainProject(20);
  const singleSubgraph = makeSubgraphChainProject(1);
  const serializedSingleSubgraphProject = String(serializeProject(singleSubgraph.project));
  const subgraph50 = makeSubgraphChainProject(50);
  const nestedSubgraph5 = makeNestedSubgraphProject(5);
  const repeatedSubgraph50 = makeRepeatedSubgraphFanInProject(50);
  const wideFanIn100 = makeWideTextFanInProject(100);
  const wideFanIn200 = makeWideTextFanInProject(200);
  const coalesceFanIn = makeCoalesceFanInProject();
  const destructureFanOut = makeDestructureFanOutProject();
  const extractObjectPath = makeExtractObjectPathProject();
  const objectConstruction = makeObjectConstructionProject();
  const mixedSubgraphFanIn = makeMixedSubgraphFanInProject(8, 20);
  const callGraph50 = makeCallGraphFanInProject(50);
  const referencedGraph1 = makeReferencedGraphAliasFanInProject(1);
  const referencedGraph50 = makeReferencedGraphAliasFanInProject(50);
  const benchmarkProjectFiles = await createBenchmarkProjectFiles(singleSubgraph.project, referencedGraph1);
  const codeRunner = new NodeCodeRunner();
  const cachedCodeRunner = new CachedNodeCodeRunner();
  const results: BenchmarkResult[] = [];

  try {
    results.push(
      await benchmark('runGraphInFile passthrough one-shot', () =>
        runGraphInFile(testGraphsPath, {
          graph: 'Passthrough',
          inputs: { input: 'bench' },
        }),
      ),
    );

    results.push(
      await benchmark('runGraphInFile subgraph project one-shot', () =>
        runGraphInFile(benchmarkProjectFiles.subgraphProjectPath, {
          graph: singleSubgraph.graphId,
          inputs: { input: 'bench' },
        }),
      ),
    );

    results.push(
      await benchmark('runGraphInFile referenced-project one-shot with projectPath', () =>
        runGraphInFile(benchmarkProjectFiles.referencedProjectPath, {
          graph: referencedGraph1.graphId,
          inputs: { input: 'bench' },
          projectPath: benchmarkProjectFiles.referencedProjectPath,
        }),
      ),
    );

    results.push(
      await benchmark('loadProjectFromString subgraph project only', () =>
        loadProjectFromString(serializedSingleSubgraphProject),
      ),
    );

    results.push(
      await benchmark('loadProjectFromFile subgraph project only', () =>
        loadProjectFromFile(benchmarkProjectFiles.subgraphProjectPath),
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

    results.push(
      await benchmarkCreateProcessor('fresh createProcessor default-safe passthrough', passthroughProject, {
        graph: 'Passthrough',
        inputs: { input: 'bench' },
      }),
    );

    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner passthrough',
        passthroughProject,
        { graph: 'Passthrough' },
        { inputs: { input: 'bench' } },
      ),
    );

    {
      const processor = createRuntimeSpeedProcessor(cheap20.project, cheap20.graphId);
      const context = createRuntimeSpeedProcessContext();
      const inputs = { input: { type: 'string', value: 'bench' } satisfies DataValue };
      results.push(
        await benchmark('direct GraphProcessor text chain 20', () => processor.processGraph(context, inputs)),
      );
    }

    results.push(
      await benchmark('runGraph text chain 20', () =>
        runGraph(cheap20.project, { graph: cheap20.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor default-safe text chain 20', cheap20.project, {
        graph: cheap20.graphId,
        inputs: { input: 'bench' },
      }),
    );
    results.push(
      await benchmark('runGraph text chain 100', () =>
        runGraph(cheap100.project, { graph: cheap100.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor default-safe text chain 100', cheap100.project, {
        graph: cheap100.graphId,
        inputs: { input: 'bench' },
      }),
    );
    results.push(
      await benchmark('runGraph text chain 500', () =>
        runGraph(cheap500.project, { graph: cheap500.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmark('runGraph text chain 1000', () =>
        runGraph(cheap1000.project, { graph: cheap1000.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmarkDirectProcessor('direct GraphProcessor compatible text chain 500', cheap500, 'compatible'),
    );
    results.push(
      await benchmarkDirectProcessor('direct GraphProcessor fast-acyclic text chain 500', cheap500, 'fast-acyclic'),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner text chain 500',
        cheap500.project,
        { graph: cheap500.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner headless-fast text chain 500',
        cheap500.project,
        {
          graph: cheap500.graphId,
          runtimeProfile: 'headless-fast',
        },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast text chain 500',
        cheap500.project,
        { graph: cheap500.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner headless-fast text chain 1000',
        cheap1000.project,
        {
          graph: cheap1000.graphId,
          runtimeProfile: 'headless-fast',
        },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast text chain 1000',
        cheap1000.project,
        { graph: cheap1000.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmark('runGraph wide independent text nodes 100', () =>
        runGraph(wideFanIn100.project, { graph: wideFanIn100.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe wide independent text nodes 100',
        wideFanIn100.project,
        { graph: wideFanIn100.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor compatible text chain 500', cheap500.project, {
        graph: cheap500.graphId,
        inputs: { input: 'bench' },
        runtimeProfile: 'compatible',
      }),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor default-safe text chain 500', cheap500.project, {
        graph: cheap500.graphId,
        inputs: { input: 'bench' },
      }),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor headless-fast text chain 500', cheap500.project, {
        graph: cheap500.graphId,
        inputs: { input: 'bench' },
        runtimeProfile: 'headless-fast',
      }),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor default-safe text chain 1000', cheap1000.project, {
        graph: cheap1000.graphId,
        inputs: { input: 'bench' },
      }),
    );
    results.push(
      await benchmark('runGraph single subgraph call', () =>
        runGraph(singleSubgraph.project, { graph: singleSubgraph.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe single subgraph call',
        singleSubgraph.project,
        { graph: singleSubgraph.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmark('runGraph repeated subgraph same-input 50', () =>
        runGraph(repeatedSubgraph50.project, { graph: repeatedSubgraph50.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmark('runGraph repeated subgraph changing-input 50', () =>
        runGraph(subgraph50.project, { graph: subgraph50.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmark('runGraph nested subgraph depth 5', () =>
        runGraph(nestedSubgraph5.project, { graph: nestedSubgraph5.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe nested subgraph depth 5',
        nestedSubgraph5.project,
        { graph: nestedSubgraph5.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible subgraph chain 50',
        subgraph50.project,
        { graph: subgraph50.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner headless-fast subgraph chain 50',
        subgraph50.project,
        {
          graph: subgraph50.graphId,
          runtimeProfile: 'headless-fast',
        },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast subgraph chain 50',
        subgraph50.project,
        { graph: subgraph50.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor compatible repeated subgraph same-input 50',
        repeatedSubgraph50.project,
        { graph: repeatedSubgraph50.graphId, inputs: { input: 'bench' }, runtimeProfile: 'compatible' },
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe repeated subgraph same-input 50',
        repeatedSubgraph50.project,
        { graph: repeatedSubgraph50.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor headless-fast repeated subgraph same-input 50',
        repeatedSubgraph50.project,
        { graph: repeatedSubgraph50.graphId, inputs: { input: 'bench' }, runtimeProfile: 'headless-fast' },
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor compatible repeated subgraph changing-input 50',
        subgraph50.project,
        { graph: subgraph50.graphId, inputs: { input: 'bench' }, runtimeProfile: 'compatible' },
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe repeated subgraph changing-input 50',
        subgraph50.project,
        { graph: subgraph50.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor headless-fast repeated subgraph changing-input 50',
        subgraph50.project,
        { graph: subgraph50.graphId, inputs: { input: 'bench' }, runtimeProfile: 'headless-fast' },
      ),
    );
    results.push(
      await benchmark('runGraph Call Graph repeated same-input 50', () =>
        runGraph(callGraph50.project, { graph: callGraph50.graphId, inputs: { input: 'bench' } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe Call Graph repeated same-input 50',
        callGraph50.project,
        { graph: callGraph50.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmark('runGraph Referenced Graph Alias repeated same-input 50', () =>
        runGraph(referencedGraph50.project, {
          graph: referencedGraph50.graphId,
          inputs: { input: 'bench' },
          projectReferenceLoader: referencedGraph50.projectReferenceLoader,
        }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe Referenced Graph Alias repeated same-input 50',
        referencedGraph50.project,
        {
          graph: referencedGraph50.graphId,
          inputs: { input: 'bench' },
          projectReferenceLoader: referencedGraph50.projectReferenceLoader,
        },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast Referenced Graph Alias repeated same-input 50',
        referencedGraph50.project,
        {
          graph: referencedGraph50.graphId,
          projectReferenceLoader: referencedGraph50.projectReferenceLoader,
        },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmark('runGraph custom projectReferenceLoader referenced graph', () =>
        runGraph(referencedGraph1.project, {
          graph: referencedGraph1.graphId,
          inputs: { input: 'bench' },
          projectReferenceLoader: referencedGraph1.projectReferenceLoader,
        }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe custom projectReferenceLoader referenced graph',
        referencedGraph1.project,
        {
          graph: referencedGraph1.graphId,
          inputs: { input: 'bench' },
          projectReferenceLoader: referencedGraph1.projectReferenceLoader,
        },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible wide fan-in 200',
        wideFanIn200.project,
        { graph: wideFanIn200.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkDirectProcessor('direct GraphProcessor compatible wide fan-in 200', wideFanIn200, 'compatible'),
    );
    results.push(
      await benchmarkDirectProcessor(
        'direct GraphProcessor fast-acyclic wide fan-in 200',
        wideFanIn200,
        'fast-acyclic',
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner headless-fast wide fan-in 200',
        wideFanIn200.project,
        {
          graph: wideFanIn200.graphId,
          runtimeProfile: 'headless-fast',
        },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible coalesce fan-in',
        coalesceFanIn.project,
        { graph: coalesceFanIn.graphId },
        {
          inputs: {
            first: { type: 'any', value: null },
            second: { type: 'any', value: undefined },
            third: { type: 'string', value: 'bench' },
          },
        },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast coalesce fan-in',
        coalesceFanIn.project,
        { graph: coalesceFanIn.graphId },
        {
          inputs: {
            first: { type: 'any', value: null },
            second: { type: 'any', value: undefined },
            third: { type: 'string', value: 'bench' },
          },
        },
      ),
    );
    const destructureInputs = {
      inputs: {
        object: {
          type: 'object' as const,
          value: {
            meta: { role: 'runner' },
            name: 'bench',
            tags: ['native', 'destructure'],
          },
        },
      },
    };
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible destructure fan-out',
        destructureFanOut.project,
        { graph: destructureFanOut.graphId },
        destructureInputs,
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast destructure fan-out',
        destructureFanOut.project,
        { graph: destructureFanOut.graphId },
        destructureInputs,
      ),
    );
    const extractObjectPathInputs = {
      inputs: {
        object: {
          type: 'object' as const,
          value: {
            meta: { role: 'runner' },
            name: 'bench',
          },
        },
      },
    };
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible extract object path',
        extractObjectPath.project,
        { graph: extractObjectPath.graphId },
        extractObjectPathInputs,
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast extract object path',
        extractObjectPath.project,
        { graph: extractObjectPath.graphId },
        extractObjectPathInputs,
      ),
    );
    const objectConstructionInputs = {
      context: {
        suffix: { type: 'string' as const, value: 'ctx' },
      },
      inputs: {
        count: { type: 'number' as const, value: 3 },
        meta: {
          type: 'object' as const,
          value: {
            role: 'runner',
          },
        },
        name: { type: 'string' as const, value: 'bench "object"' },
      },
    };
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible object construction',
        objectConstruction.project,
        { graph: objectConstruction.graphId },
        objectConstructionInputs,
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast object construction',
        objectConstruction.project,
        { graph: objectConstruction.graphId },
        objectConstructionInputs,
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast wide fan-in 200',
        wideFanIn200.project,
        { graph: wideFanIn200.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible mixed subgraph fan-in',
        mixedSubgraphFanIn.project,
        { graph: mixedSubgraphFanIn.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast mixed subgraph fan-in',
        mixedSubgraphFanIn.project,
        { graph: mixedSubgraphFanIn.graphId },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner headless-fast mixed subgraph fan-in',
        mixedSubgraphFanIn.project,
        {
          graph: mixedSubgraphFanIn.graphId,
          runtimeProfile: 'headless-fast',
        },
        { inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmark('runGraph expression chain 20', () =>
        runGraph(expression20.project, { graph: expression20.graphId, inputs: { input: 0 } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor default-safe expression chain 20', expression20.project, {
        graph: expression20.graphId,
        inputs: { input: 0 },
      }),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible expression chain 20',
        expression20.project,
        { graph: expression20.graphId },
        { inputs: { input: 0 } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner headless-fast expression chain 20',
        expression20.project,
        {
          graph: expression20.graphId,
          runtimeProfile: 'headless-fast',
        },
        { inputs: { input: 0 } },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast unsupported expression chain 20',
        expression20.project,
        { graph: expression20.graphId },
        { inputs: { input: 0 } },
      ),
    );
    results.push(
      await benchmark('runGraph code chain 20', () =>
        runGraph(code20.project, { graph: code20.graphId, inputs: { input: 0 } }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor default-safe code chain 20', code20.project, {
        graph: code20.graphId,
        inputs: { input: 0 },
      }),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner compatible code chain 20',
        code20.project,
        { graph: code20.graphId },
        { inputs: { input: 0 } },
      ),
    );
    results.push(
      await benchmarkGraphRunner(
        'createGraphRunner headless-fast code chain 20',
        code20.project,
        {
          graph: code20.graphId,
          runtimeProfile: 'headless-fast',
        },
        { inputs: { input: 0 } },
      ),
    );
    results.push(
      await benchmarkNativeFastGraphRunner(
        'createGraphRunner native-fast unsupported code chain 20',
        code20.project,
        { graph: code20.graphId },
        { inputs: { input: 0 } },
      ),
    );
    results.push(
      await benchmark('lazy preprocess/dependency text chain 500', () => benchmarkLazyPreprocessDependency(cheap500)),
    );
    results.push(await benchmark('NodeCodeRunner compile/run one snippet', () => benchmarkCodeRunner(codeRunner)));
    results.push(
      await benchmark('CachedNodeCodeRunner run cached snippet', () => benchmarkCodeRunner(cachedCodeRunner)),
    );

    const executedResults = results.filter((result) => result.iterations > 0);
    if (executedResults.length === 0) {
      throw new Error(
        `No runtime-speed benchmarks matched filter ${JSON.stringify(process.env.RIVET_RUNTIME_BENCH_FILTER)}.`,
      );
    }

    if (process.env.RIVET_RUNTIME_BENCH_JSON === '1') {
      console.log(JSON.stringify(executedResults));
    } else {
      console.table(executedResults);
    }
  } finally {
    await benchmarkProjectFiles.cleanup();
  }
}

async function benchmark(name: string, run: () => Promise<unknown> | unknown): Promise<BenchmarkResult> {
  if (!shouldRunBenchmark(name)) {
    return skippedBenchmarkResult(name);
  }

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

function shouldRunBenchmark(name: string): boolean {
  return benchmarkFilter == null || benchmarkFilter.test(name);
}

function skippedBenchmarkResult(name: string): BenchmarkResult {
  return {
    iterations: 0,
    maxMeanMs: '0.000',
    meanMs: '0.000',
    minMeanMs: '0.000',
    name,
    samples: 0,
    stdDevMs: '0.000',
    totalMs: '0.000',
  };
}

async function benchmarkGraphRunner(
  name: string,
  project: Project,
  options: NodeGraphRunnerOptions,
  runOptions: NodeGraphRunnerRunOptions,
): Promise<BenchmarkResult> {
  if (!shouldRunBenchmark(name)) {
    return skippedBenchmarkResult(name);
  }

  const runner = createGraphRunner(project, options);
  try {
    return await benchmark(name, () => runner.run(runOptions));
  } finally {
    runner.dispose();
  }
}

async function benchmarkNativeFastGraphRunner(
  name: string,
  project: Project,
  options: Omit<NodeGraphRunnerOptions, 'runtimeProfile'>,
  runOptions: NodeGraphRunnerRunOptions,
): Promise<BenchmarkResult> {
  if (!shouldRunBenchmark(name)) {
    return skippedBenchmarkResult(name);
  }

  const runner = createGraphRunner(project, { ...options, runtimeProfile: 'native-fast' });
  try {
    const result = await benchmark(name, () => runner.run(runOptions));
    const nativeDecision = runner.getNativeRuntimeDecision?.();
    return {
      ...result,
      nativeBackend: nativeDecision?.nativeBackend,
      nativeEligible: nativeDecision?.nativeEligible,
      nativeFallbackReason: nativeDecision?.fallbackReason,
      nativeUsed: nativeDecision?.nativeUsed,
    };
  } finally {
    runner.dispose();
  }
}

async function benchmarkCreateProcessor(
  name: string,
  project: Project,
  options: NodeCreateProcessorOptions,
): Promise<BenchmarkResult> {
  return await benchmark(name, () => createProcessor(project, options).run());
}

async function benchmarkDirectProcessor(
  name: string,
  fixture: RuntimeSpeedProjectFixture,
  scheduler: GraphProcessorScheduler,
): Promise<BenchmarkResult> {
  if (!shouldRunBenchmark(name)) {
    return skippedBenchmarkResult(name);
  }

  const processor = createRuntimeSpeedProcessor(fixture.project, fixture.graphId, { scheduler });
  const context = createRuntimeSpeedProcessContext();
  const inputs = { input: { type: 'string', value: 'bench' } satisfies DataValue };
  return await benchmark(name, () => processor.processGraph(context, inputs));
}

async function benchmarkCodeRunner(
  runner: NodeCodeRunner | CachedNodeCodeRunner,
): Promise<Record<string, DataValue | undefined>> {
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

function readBenchmarkFilter(): RegExp | undefined {
  const value = process.env.RIVET_RUNTIME_BENCH_FILTER?.trim();
  if (!value) {
    return undefined;
  }

  try {
    return new RegExp(value, 'i');
  } catch (error) {
    throw new Error(`Invalid RIVET_RUNTIME_BENCH_FILTER regex ${JSON.stringify(value)}.`, { cause: error });
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean = average(values)): number {
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

async function createBenchmarkProjectFiles(
  subgraphProject: Project,
  referencedFixture: ReturnType<typeof makeReferencedGraphAliasFanInProject>,
): Promise<BenchmarkProjectFiles> {
  const directory = await mkdtemp(join(tmpdir(), 'rivet-runtime-speed-'));
  const subgraphProjectPath = join(directory, 'subgraph.rivet-project');
  const referencedDependencyPath = join(directory, 'referenced-dependency.rivet-project');
  const referencedProjectPath = join(directory, 'referenced-main.rivet-project');
  const referencedMainProject = structuredClone(referencedFixture.project) as Project;

  referencedMainProject.references = (referencedMainProject.references ?? []).map((reference) =>
    reference.id === referencedFixture.referencedProject.metadata.id
      ? {
          ...reference,
          hintPaths: ['referenced-dependency.rivet-project'],
        }
      : reference,
  );

  await writeSerializedProject(subgraphProjectPath, subgraphProject);
  await writeSerializedProject(referencedDependencyPath, referencedFixture.referencedProject);
  await writeSerializedProject(referencedProjectPath, referencedMainProject);

  return {
    cleanup: () => rm(directory, { force: true, recursive: true }),
    referencedProjectPath,
    subgraphProjectPath,
  };
}

async function writeSerializedProject(path: string, project: Project): Promise<void> {
  await writeFile(path, String(serializeProject(project)), 'utf8');
}

await main();
