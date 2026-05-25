import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir, type } from 'node:os';
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
  type GraphId,
  type GraphProcessorScheduler,
  type NodeGraph,
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
  ci95HighMs: string;
  ci95LowMs: string;
  coefficientVariation: string;
  maxMs: string;
  nativeBackend?: string;
  nativeEligible?: boolean;
  nativeFallbackReason?: string;
  nativeUsed?: boolean;
  iterations: number;
  meanMs: string;
  medianMs: string;
  minMs: string;
  name: string;
  p75Ms: string;
  p95Ms: string;
  rawSamplesMs: number[];
  samples: number;
  sessions: number;
  stdDevMs: string;
  totalMs: string;
  warmupIterations: number;
};

type BenchmarkMetadata = {
  arch: string;
  command: string;
  commit: string;
  cpuModel: string;
  date: string;
  filter?: string;
  gitDirty: boolean;
  gitStatusShort: string[];
  iterations: number;
  jsonMode: boolean;
  node: string;
  os: string;
  outputPath?: string;
  platform: NodeJS.Platform;
  release: string;
  samplesPerSession: number;
  sessions: number;
  warmupIterations: number;
  yarnUserAgent?: string;
};

type BenchmarkOutput = {
  metadata: BenchmarkMetadata;
  results: BenchmarkResult[];
};

type BenchmarkProjectFiles = {
  cleanup: () => Promise<void>;
  referencedProjectPath: string;
  subgraphProjectPath: string;
};

type BenchmarkGraphBoundaryPort = {
  id: string;
  portId: string;
};

type BenchmarkGraphBoundary = {
  inputs: readonly BenchmarkGraphBoundaryPort[];
  outputs: readonly BenchmarkGraphBoundaryPort[];
};

const benchDir = dirname(fileURLToPath(import.meta.url));
const nodePackageDir = join(benchDir, '..');
const testGraphsPath = join(nodePackageDir, 'test', 'test-graphs.rivet-project');
const iterations = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_ITERATIONS', 50);
const warmupIterations = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS', 5);
const samples = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_SAMPLES', 1);
const sessions = readPositiveIntegerEnv('RIVET_RUNTIME_BENCH_SESSIONS', 1);
const benchmarkFilterPattern = process.env.RIVET_RUNTIME_BENCH_FILTER?.trim();
const benchmarkFilter = readBenchmarkFilter(benchmarkFilterPattern);
const benchmarkOutputPath = process.env.RIVET_RUNTIME_BENCH_OUTPUT?.trim();

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
  const singleSubgraphChildGraphId = getFirstSubgraphTargetGraphId(singleSubgraph.project, singleSubgraph.graphId);
  const nestedSubgraphFirstChildGraphId = getFirstSubgraphTargetGraphId(
    nestedSubgraph5.project,
    nestedSubgraph5.graphId,
  );
  const singleSubgraphChildBoundary = deriveBenchmarkGraphBoundary(
    singleSubgraph.project,
    singleSubgraphChildGraphId,
  );
  const singleSubgraphChildGraph = getGraphOrThrow(singleSubgraph.project, singleSubgraphChildGraphId);
  const singleSubgraphBoundaryCache = new WeakMap<NodeGraph, BenchmarkGraphBoundary>([
    [singleSubgraphChildGraph, singleSubgraphChildBoundary],
  ]);
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
      await benchmarkCreateProcessorConstruction(
        'attribution createProcessor object only single subgraph call',
        singleSubgraph.project,
        { graph: singleSubgraph.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkGraphProcessorConstruction(
        'attribution construct GraphProcessor single subgraph root',
        singleSubgraph.project,
        singleSubgraph.graphId,
      ),
    );
    results.push(
      await benchmarkGraphProcessorConstruction(
        'attribution construct GraphProcessor single subgraph child',
        singleSubgraph.project,
        singleSubgraphChildGraphId,
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor single subgraph root',
        singleSubgraph.project,
        singleSubgraph.graphId,
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor fast-acyclic single subgraph root',
        singleSubgraph.project,
        singleSubgraph.graphId,
        'fast-acyclic',
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor single subgraph child body',
        singleSubgraph.project,
        singleSubgraphChildGraphId,
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor fast-acyclic single subgraph child body',
        singleSubgraph.project,
        singleSubgraphChildGraphId,
        'fast-acyclic',
      ),
    );
    results.push(
      await benchmark('attribution derive graph boundary equivalent single subgraph child', () =>
        deriveBenchmarkGraphBoundary(singleSubgraph.project, singleSubgraphChildGraphId),
      ),
    );
    results.push(
      await benchmark('attribution cached graph boundary lookup equivalent single subgraph child', () => {
        const boundary = singleSubgraphBoundaryCache.get(singleSubgraphChildGraph);
        if (!boundary) {
          throw new Error('Expected warmed benchmark graph boundary cache entry.');
        }

        return boundary;
      }),
    );
    results.push(
      await benchmark('attribution build boundary input map equivalent single subgraph child', () =>
        buildBenchmarkGraphBoundaryInputData(singleSubgraphChildBoundary, {
          input: { type: 'string', value: 'bench' },
        }),
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor compatible single subgraph call', singleSubgraph.project, {
        graph: singleSubgraph.graphId,
        inputs: { input: 'bench' },
        runtimeProfile: 'compatible',
      }),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe single subgraph call',
        singleSubgraph.project,
        { graph: singleSubgraph.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor headless-fast single subgraph call', singleSubgraph.project, {
        graph: singleSubgraph.graphId,
        inputs: { input: 'bench' },
        runtimeProfile: 'headless-fast',
      }),
    );
    {
      const processor = createProcessor(singleSubgraph.project, {
        graph: singleSubgraph.graphId,
        inputs: { input: 'bench' },
      });
      results.push(await benchmark('reuse createProcessor default-safe single subgraph call', () => processor.run()));
    }
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
      await benchmarkGraphProcessorConstruction(
        'attribution construct GraphProcessor nested subgraph root',
        nestedSubgraph5.project,
        nestedSubgraph5.graphId,
      ),
    );
    results.push(
      await benchmarkGraphProcessorConstruction(
        'attribution construct GraphProcessor nested first child',
        nestedSubgraph5.project,
        nestedSubgraphFirstChildGraphId,
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor nested subgraph root',
        nestedSubgraph5.project,
        nestedSubgraph5.graphId,
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor fast-acyclic nested subgraph root',
        nestedSubgraph5.project,
        nestedSubgraph5.graphId,
        'fast-acyclic',
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor nested first child',
        nestedSubgraph5.project,
        nestedSubgraphFirstChildGraphId,
      ),
    );
    results.push(
      await benchmarkDirectGraphProcessor(
        'attribution direct GraphProcessor fast-acyclic nested first child',
        nestedSubgraph5.project,
        nestedSubgraphFirstChildGraphId,
        'fast-acyclic',
      ),
    );
    results.push(
      await benchmarkCreateProcessor('fresh createProcessor compatible nested subgraph depth 5', nestedSubgraph5.project, {
        graph: nestedSubgraph5.graphId,
        inputs: { input: 'bench' },
        runtimeProfile: 'compatible',
      }),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor default-safe nested subgraph depth 5',
        nestedSubgraph5.project,
        { graph: nestedSubgraph5.graphId, inputs: { input: 'bench' } },
      ),
    );
    results.push(
      await benchmarkCreateProcessor(
        'fresh createProcessor headless-fast nested subgraph depth 5',
        nestedSubgraph5.project,
        { graph: nestedSubgraph5.graphId, inputs: { input: 'bench' }, runtimeProfile: 'headless-fast' },
      ),
    );
    {
      const processor = createProcessor(nestedSubgraph5.project, {
        graph: nestedSubgraph5.graphId,
        inputs: { input: 'bench' },
      });
      results.push(await benchmark('reuse createProcessor default-safe nested subgraph depth 5', () => processor.run()));
    }
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

    const output = createBenchmarkOutput(executedResults);
    if (benchmarkOutputPath) {
      await writeBenchmarkOutput(benchmarkOutputPath, output);
    }

    if (process.env.RIVET_RUNTIME_BENCH_JSON === '1') {
      console.log(JSON.stringify(output));
    } else {
      console.table(executedResults.map(formatBenchmarkResultForConsole));
      if (benchmarkOutputPath) {
        console.log(`Wrote runtime-speed benchmark artifact to ${benchmarkOutputPath}`);
      }
    }
  } finally {
    await benchmarkProjectFiles.cleanup();
  }
}

async function benchmark(name: string, run: () => Promise<unknown> | unknown): Promise<BenchmarkResult> {
  if (!shouldRunBenchmark(name)) {
    return skippedBenchmarkResult(name);
  }

  const sampleMs: number[] = [];
  let measuredTotalMs = 0;

  for (let session = 0; session < sessions; session++) {
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
      sampleMs.push(totalMs / iterations);
    }
  }

  const meanMs = average(sampleMs);
  const stdDevMs = standardDeviation(sampleMs, meanMs);
  const confidence = confidenceInterval95(sampleMs, meanMs, stdDevMs);

  return {
    ci95HighMs: confidence.high.toFixed(3),
    ci95LowMs: confidence.low.toFixed(3),
    coefficientVariation: meanMs === 0 ? '0.000' : (stdDevMs / meanMs).toFixed(3),
    iterations,
    maxMs: Math.max(...sampleMs).toFixed(3),
    meanMs: meanMs.toFixed(3),
    medianMs: percentile(sampleMs, 0.5).toFixed(3),
    minMs: Math.min(...sampleMs).toFixed(3),
    name,
    p75Ms: percentile(sampleMs, 0.75).toFixed(3),
    p95Ms: percentile(sampleMs, 0.95).toFixed(3),
    rawSamplesMs: sampleMs.map((sample) => Number(sample.toFixed(6))),
    samples: sampleMs.length,
    sessions,
    stdDevMs: stdDevMs.toFixed(3),
    totalMs: measuredTotalMs.toFixed(3),
    warmupIterations,
  };
}

function shouldRunBenchmark(name: string): boolean {
  return benchmarkFilter == null || benchmarkFilter.test(name);
}

function skippedBenchmarkResult(name: string): BenchmarkResult {
  return {
    ci95HighMs: '0.000',
    ci95LowMs: '0.000',
    coefficientVariation: '0.000',
    iterations: 0,
    maxMs: '0.000',
    meanMs: '0.000',
    medianMs: '0.000',
    minMs: '0.000',
    name,
    p75Ms: '0.000',
    p95Ms: '0.000',
    rawSamplesMs: [],
    samples: 0,
    sessions: 0,
    stdDevMs: '0.000',
    totalMs: '0.000',
    warmupIterations: 0,
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

async function benchmarkCreateProcessorConstruction(
  name: string,
  project: Project,
  options: NodeCreateProcessorOptions,
): Promise<BenchmarkResult> {
  return await benchmark(name, () => createProcessor(project, options));
}

async function benchmarkGraphProcessorConstruction(
  name: string,
  project: Project,
  graphId: GraphId,
): Promise<BenchmarkResult> {
  return await benchmark(name, () => createRuntimeSpeedProcessor(project, graphId));
}

async function benchmarkDirectGraphProcessor(
  name: string,
  project: Project,
  graphId: GraphId,
  scheduler?: GraphProcessorScheduler,
): Promise<BenchmarkResult> {
  if (!shouldRunBenchmark(name)) {
    return skippedBenchmarkResult(name);
  }

  const processor = createRuntimeSpeedProcessor(project, graphId, scheduler ? { scheduler } : undefined);
  const context = createRuntimeSpeedProcessContext();
  const inputs = { input: { type: 'string', value: 'bench' } satisfies DataValue };
  return await benchmark(name, () => processor.processGraph(context, inputs));
}

async function benchmarkDirectProcessor(
  name: string,
  fixture: RuntimeSpeedProjectFixture,
  scheduler: GraphProcessorScheduler,
): Promise<BenchmarkResult> {
  return await benchmarkDirectGraphProcessor(name, fixture.project, fixture.graphId, scheduler);
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

function getFirstSubgraphTargetGraphId(project: Project, graphId: GraphId): GraphId {
  const graph = getGraphOrThrow(project, graphId);
  const subgraphNode = graph.nodes.find((node) => node.type === 'subGraph') as
    | { data?: { graphId?: GraphId } }
    | undefined;

  if (!subgraphNode?.data?.graphId) {
    throw new Error(`Graph ${graphId} does not contain a Subgraph node.`);
  }

  return subgraphNode.data.graphId;
}

function getGraphOrThrow(project: Project, graphId: GraphId): NodeGraph {
  const graph = project.graphs[graphId];
  if (!graph) {
    throw new Error(`Graph ${graphId} does not exist in runtime speed fixture.`);
  }

  return graph;
}

function deriveBenchmarkGraphBoundary(project: Project, graphId: GraphId): BenchmarkGraphBoundary {
  const graph = getGraphOrThrow(project, graphId);
  const inputsById = new Map<string, BenchmarkGraphBoundaryPort>();
  const outputsById = new Map<string, BenchmarkGraphBoundaryPort>();

  for (const node of graph.nodes) {
    const data = node.data as { id?: string };

    if (typeof data.id !== 'string') {
      continue;
    }

    if (node.type === 'graphInput' && !inputsById.has(data.id)) {
      inputsById.set(data.id, {
        id: data.id,
        portId: data.id,
      });
    } else if (node.type === 'graphOutput' && !outputsById.has(data.id)) {
      outputsById.set(data.id, {
        id: data.id,
        portId: data.id,
      });
    }
  }

  return {
    inputs: Array.from(inputsById.keys())
      .sort()
      .map((id) => inputsById.get(id)!),
    outputs: Array.from(outputsById.keys())
      .sort()
      .map((id) => outputsById.get(id)!),
  };
}

function buildBenchmarkGraphBoundaryInputData(
  boundary: BenchmarkGraphBoundary,
  inputs: Record<string, DataValue>,
  defaults?: Record<string, DataValue>,
): Record<string, DataValue> {
  const inputData: Record<string, DataValue> = {};

  for (const input of boundary.inputs) {
    const inputValue = inputs[input.portId];
    if (inputValue != null) {
      inputData[input.portId] = inputValue;
      continue;
    }

    const defaultValue = defaults?.[input.id];
    if (defaultValue != null) {
      inputData[input.portId] = defaultValue;
    }
  }

  return inputData;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function readBenchmarkFilter(value: string | undefined): RegExp | undefined {
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

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index]!;
}

function confidenceInterval95(
  values: number[],
  mean: number,
  stdDev: number,
): {
  high: number;
  low: number;
} {
  if (values.length <= 1) {
    return { high: mean, low: mean };
  }

  const margin = 1.96 * (stdDev / Math.sqrt(values.length));
  return {
    high: mean + margin,
    low: mean - margin,
  };
}

function createBenchmarkOutput(results: BenchmarkResult[]): BenchmarkOutput {
  return {
    metadata: createBenchmarkMetadata(),
    results,
  };
}

function createBenchmarkMetadata(): BenchmarkMetadata {
  const gitStatusShort = getGitStatusShort();

  return {
    arch: arch(),
    command: process.argv.join(' '),
    commit: getGitCommit(),
    cpuModel: cpus()[0]?.model ?? '<unknown>',
    date: new Date().toISOString(),
    filter: benchmarkFilterPattern || undefined,
    gitDirty: gitStatusShort.length > 0,
    gitStatusShort,
    iterations,
    jsonMode: process.env.RIVET_RUNTIME_BENCH_JSON === '1',
    node: process.version,
    os: type(),
    outputPath: benchmarkOutputPath || undefined,
    platform: platform(),
    release: release(),
    samplesPerSession: samples,
    sessions,
    warmupIterations,
    yarnUserAgent: process.env.npm_config_user_agent,
  };
}

function getGitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: join(benchDir, '..', '..', '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '<unknown>';
  }
}

function getGitStatusShort(): string[] {
  try {
    return execFileSync('git', ['status', '--short'], {
      cwd: join(benchDir, '..', '..', '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function writeBenchmarkOutput(path: string, output: BenchmarkOutput): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

function formatBenchmarkResultForConsole(result: BenchmarkResult): Omit<BenchmarkResult, 'rawSamplesMs'> {
  const { rawSamplesMs: _rawSamplesMs, ...summary } = result;
  return summary;
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
