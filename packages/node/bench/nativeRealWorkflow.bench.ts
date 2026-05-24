import { AssertionError } from 'node:assert';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGraphRunner,
  loadProjectFromFile,
  type DataType,
  type LooseDataValue,
  type NodeGraph,
  type NodeGraphRunnerOptions,
  type NodeGraphRunnerRunOptions,
  type Project,
} from '../src/index.js';

type BenchmarkSummary = {
  iterations: number;
  maxMeanMs: string;
  meanMs: string;
  minMeanMs: string;
  samples: number;
  stdDevMs: string;
};

type RealWorkflowResult = {
  compatible?: BenchmarkSummary;
  fallbackReason?: string;
  graphId?: string;
  graphName?: string;
  headlessFast?: BenchmarkSummary;
  nativeBackend?: string;
  nativeFast?: BenchmarkSummary;
  nativeUsed?: boolean;
  nodeCount?: number;
  projectPath: string;
  speedupVsBestTypeScript?: string;
  status: 'eligible' | 'fallback' | 'load-error' | 'output-mismatch' | 'run-error';
};

type TypeScriptBenchmarkProfile = 'compatible' | 'headless-fast';

const benchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(benchDir, '..', '..', '..');
const iterations = readPositiveIntegerEnv('RIVET_REAL_WORKFLOW_BENCH_ITERATIONS', 25);
const warmupIterations = readPositiveIntegerEnv('RIVET_REAL_WORKFLOW_BENCH_WARMUP_ITERATIONS', 3);
const samples = readPositiveIntegerEnv('RIVET_REAL_WORKFLOW_BENCH_SAMPLES', 3);
const benchmarkFilter = readBenchmarkFilter();

const defaultProjectPaths = [
  'rivet.rivet-project',
  'packages/app/graphs/code-node-generator.rivet-project',
  'packages/app/graphs/graph-creator.rivet-project',
  'packages/app/src/assets/templates/ai_agent_template.rivet-project',
  'packages/app/src/assets/templates/mcp_ai_agent_template.rivet-project',
  'packages/app/src/assets/tutorials/documentation-tutorial.rivet-project',
  'packages/cli/cli-example.rivet-project',
  'examples/rpg/RPG.rivet-project',
] as const;

async function main(): Promise<void> {
  configureDefaultNativeRuntimeModule();

  const projectPaths = getBenchmarkProjectPaths();
  const results: RealWorkflowResult[] = [];

  for (const projectPath of projectPaths) {
    const relativeProjectPath = toRepoRelativePath(projectPath);
    let project: Project;

    try {
      project = await loadProjectFromFile(projectPath);
    } catch (error) {
      results.push({
        fallbackReason: getErrorMessage(error),
        projectPath: relativeProjectPath,
        status: 'load-error',
      });
      continue;
    }

    const graphs = getSortedProjectGraphs(project);

    if (hasProjectReferences(project)) {
      for (const [graphId, graph] of graphs) {
        const graphName = getGraphName(graph);
        const rowName = `${relativeProjectPath}#${graphName}`;
        if (!shouldRunBenchmark(rowName)) {
          continue;
        }

        results.push({
          fallbackReason: 'project-has-references',
          graphId,
          graphName,
          nodeCount: graph.nodes.length,
          projectPath: relativeProjectPath,
          status: 'fallback',
        });
      }

      continue;
    }

    for (const [graphId, graph] of graphs) {
      const graphName = getGraphName(graph);
      const rowName = `${relativeProjectPath}#${graphName}`;
      if (!shouldRunBenchmark(rowName)) {
        continue;
      }

      results.push(await benchmarkGraph(project, relativeProjectPath, graphId, graphName, graph));
    }
  }

  if (results.length === 0) {
    throw new Error(
      `No real-workflow benchmarks matched filter ${JSON.stringify(process.env.RIVET_REAL_WORKFLOW_BENCH_FILTER)}.`,
    );
  }

  if (process.env.RIVET_REAL_WORKFLOW_BENCH_JSON === '1') {
    console.log(JSON.stringify(results));
  } else {
    console.table(
      results.map((result) => ({
        projectPath: result.projectPath,
        graphName: result.graphName,
        status: result.status,
        nodes: result.nodeCount,
        compatibleMeanMs: result.compatible?.meanMs,
        headlessFastMeanMs: result.headlessFast?.meanMs,
        nativeFastMeanMs: result.nativeFast?.meanMs,
        nativeBackend: result.nativeBackend,
        nativeUsed: result.nativeUsed,
        speedupVsBestTypeScript: result.speedupVsBestTypeScript,
        fallbackReason: result.fallbackReason,
      })),
    );
  }
}

async function benchmarkGraph(
  project: Project,
  projectPath: string,
  graphId: string,
  graphName: string,
  graph: NodeGraph,
): Promise<RealWorkflowResult> {
  if (graph.nodes.length === 0) {
    return {
      fallbackReason: 'empty-graph',
      graphId,
      graphName,
      nodeCount: graph.nodes.length,
      projectPath,
      status: 'fallback',
    };
  }

  const graphOptions = { graph: graphId } satisfies NodeGraphRunnerOptions;
  const nativeProbe = createGraphRunner(project, { ...graphOptions, runtimeProfile: 'native-fast' });
  const initialNativeDecision = nativeProbe.getNativeRuntimeDecision?.();
  nativeProbe.dispose();

  if (initialNativeDecision?.fallbackReason || initialNativeDecision?.nativeEligible === false) {
    return {
      fallbackReason: initialNativeDecision?.fallbackReason ?? 'native-ineligible',
      graphId,
      graphName,
      nodeCount: graph.nodes.length,
      projectPath,
      status: 'fallback',
    };
  }

  const runOptions = { inputs: getSampleInputs(graph) } satisfies NodeGraphRunnerRunOptions;

  try {
    await assertNativeOutputParity(project, graphOptions, runOptions);

    const compatible = await benchmarkGraphRunner(project, graphOptions, runOptions, 'compatible');
    const headlessFast = await benchmarkGraphRunner(project, graphOptions, runOptions, 'headless-fast');
    const nativeResult = await benchmarkNativeFastGraphRunner(project, graphOptions, runOptions);
    const bestTypeScriptMean = Math.min(Number(compatible.meanMs), Number(headlessFast.meanMs));
    const nativeMean = Number(nativeResult.summary.meanMs);

    return {
      compatible,
      graphId,
      graphName,
      headlessFast,
      nativeBackend: nativeResult.nativeBackend,
      nativeFast: nativeResult.summary,
      nativeUsed: nativeResult.nativeUsed,
      nodeCount: graph.nodes.length,
      projectPath,
      speedupVsBestTypeScript:
        nativeResult.nativeUsed === true && Number.isFinite(bestTypeScriptMean) && Number.isFinite(nativeMean)
          ? `${(bestTypeScriptMean / nativeMean).toFixed(2)}x`
          : undefined,
      status: 'eligible',
    };
  } catch (error) {
    return {
      fallbackReason: getErrorMessage(error),
      graphId,
      graphName,
      nodeCount: graph.nodes.length,
      projectPath,
      status: error instanceof AssertionError ? 'output-mismatch' : 'run-error',
    };
  }
}

async function assertNativeOutputParity(
  project: Project,
  graphOptions: NodeGraphRunnerOptions,
  runOptions: NodeGraphRunnerRunOptions,
): Promise<void> {
  const compatibleRunner = createGraphRunner(project, graphOptions);
  const nativeRunner = createGraphRunner(project, { ...graphOptions, runtimeProfile: 'native-fast' });

  try {
    const compatibleOutputs = await compatibleRunner.run(runOptions);
    const nativeOutputs = await nativeRunner.run(runOptions);
    const nativeDecision = nativeRunner.getNativeRuntimeDecision?.();

    assert.equal(nativeDecision?.nativeUsed, true, JSON.stringify(nativeDecision));
    assert.deepEqual(nativeOutputs, compatibleOutputs);
  } finally {
    compatibleRunner.dispose();
    nativeRunner.dispose();
  }
}

async function benchmarkGraphRunner(
  project: Project,
  graphOptions: NodeGraphRunnerOptions,
  runOptions: NodeGraphRunnerRunOptions,
  profile: TypeScriptBenchmarkProfile,
): Promise<BenchmarkSummary> {
  const runtimeProfile = profile === 'compatible' ? undefined : profile;
  const runner = createGraphRunner(project, {
    ...graphOptions,
    ...(runtimeProfile ? { runtimeProfile } : {}),
  });

  try {
    return await benchmark(() => runner.run(runOptions));
  } finally {
    runner.dispose();
  }
}

async function benchmarkNativeFastGraphRunner(
  project: Project,
  graphOptions: NodeGraphRunnerOptions,
  runOptions: NodeGraphRunnerRunOptions,
): Promise<{
  nativeBackend?: string;
  nativeUsed?: boolean;
  summary: BenchmarkSummary;
}> {
  const runner = createGraphRunner(project, { ...graphOptions, runtimeProfile: 'native-fast' });

  try {
    const summary = await benchmark(() => runner.run(runOptions));
    const nativeDecision = runner.getNativeRuntimeDecision?.();
    return {
      nativeBackend: nativeDecision?.nativeBackend,
      nativeUsed: nativeDecision?.nativeUsed,
      summary,
    };
  } finally {
    runner.dispose();
  }
}

async function benchmark(run: () => Promise<unknown>): Promise<BenchmarkSummary> {
  const sampleMeanMs: number[] = [];

  for (let sample = 0; sample < samples; sample++) {
    for (let i = 0; i < warmupIterations; i++) {
      await run();
    }

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await run();
    }

    sampleMeanMs.push((performance.now() - start) / iterations);
  }

  const meanMs = average(sampleMeanMs);

  return {
    iterations,
    maxMeanMs: Math.max(...sampleMeanMs).toFixed(3),
    meanMs: meanMs.toFixed(3),
    minMeanMs: Math.min(...sampleMeanMs).toFixed(3),
    samples,
    stdDevMs: standardDeviation(sampleMeanMs, meanMs).toFixed(3),
  };
}

function getSampleInputs(graph: NodeGraph): Record<string, LooseDataValue> {
  const inputs: Record<string, LooseDataValue> = {};

  for (const node of graph.nodes) {
    if (node.type !== 'graphInput') {
      continue;
    }

    const data = node.data as { dataType?: unknown; id?: unknown };
    if (typeof data.id !== 'string') {
      continue;
    }

    inputs[data.id] = getSampleValue(typeof data.dataType === 'string' ? data.dataType : 'any');
  }

  return inputs;
}

function getSampleValue(dataType: DataType | string): LooseDataValue {
  switch (dataType) {
    case 'boolean':
      return true;
    case 'number':
      return 1;
    case 'object':
      return { name: 'bench', value: 1 };
    case 'object[]':
      return [{ name: 'bench', value: 1 }];
    case 'string':
      return 'bench';
    case 'string[]':
      return ['bench'];
    case 'number[]':
      return [1];
    case 'boolean[]':
      return [true];
    case 'any[]':
      return ['bench'];
    case 'any':
    default:
      return 'bench';
  }
}

function configureDefaultNativeRuntimeModule(): void {
  process.env.RIVET_NATIVE_RUNTIME_MODULE ??= join(repoRoot, 'native-runtime', 'index.js');
}

function getBenchmarkProjectPaths(): string[] {
  const configured = process.env.RIVET_REAL_WORKFLOW_BENCH_PROJECTS?.trim();
  const projectPaths = configured
    ? configured
        .split(/[;,]/)
        .map((projectPath) => projectPath.trim())
        .filter(Boolean)
    : [...defaultProjectPaths];

  return projectPaths.map((projectPath) => resolve(repoRoot, projectPath));
}

function shouldRunBenchmark(name: string): boolean {
  return benchmarkFilter == null || benchmarkFilter.test(name);
}

function getSortedProjectGraphs(project: Project): [string, NodeGraph][] {
  return Object.entries(project.graphs).sort(([, left], [, right]) =>
    getGraphName(left).localeCompare(getGraphName(right)),
  );
}

function hasProjectReferences(project: Project): boolean {
  return (project.references?.length ?? 0) > 0;
}

function readBenchmarkFilter(): RegExp | undefined {
  const value = process.env.RIVET_REAL_WORKFLOW_BENCH_FILTER?.trim();
  if (!value) {
    return undefined;
  }

  try {
    return new RegExp(value, 'i');
  } catch (error) {
    throw new Error(`Invalid RIVET_REAL_WORKFLOW_BENCH_FILTER regex ${JSON.stringify(value)}.`, { cause: error });
  }
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

function getGraphName(graph: NodeGraph): string {
  return graph.metadata?.name || graph.metadata?.id || '<unnamed>';
}

function toRepoRelativePath(path: string): string {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

await main();
