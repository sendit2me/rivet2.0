import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProcessor,
  createGraphRunner,
  globalRivetNodeRegistry,
  runGraph,
  type ChartNode,
  type CodeRunner,
  type DataValue,
  type Inputs,
  type NodeConnection,
  type NodeImpl,
  type NodeId,
  type NodeRegistration,
  type Outputs,
  type PortId,
} from '../src/index.js';
import { setNativeRuntimeModuleLoaderForTesting, type NativeRuntimeModule } from '../src/nativeGraphRunner.js';
import {
  makeAbortSignalProject,
  makeAsyncDelayProject,
  makeCodeChainProject,
  makeCoalesceFanInProject,
  makeGlobalStateProject,
  makeInputContextTextProject,
  makeSubgraphChainProject,
  makeTextChainProject,
  makeWideTextFanInProject,
} from './runtimeSpeedFixtures.js';

class CountingCodeRunner implements CodeRunner {
  calls = 0;

  async runCode(_code: string, inputs: Inputs): Promise<Outputs> {
    this.calls += 1;
    const inputValue = Number(inputs.input?.value ?? 0);

    return {
      output: { type: 'any', value: inputValue + this.calls },
    } satisfies Outputs;
  }
}

function createCountingRegistry(): {
  getCreateCalls: () => number;
  getDefinitionCalls: () => number;
  registry: NodeRegistration<any, any>;
} {
  let createCalls = 0;
  let definitionCalls = 0;

  return {
    getCreateCalls: () => createCalls,
    getDefinitionCalls: () => definitionCalls,
    registry: {
      createDynamicImpl(node: ChartNode) {
        createCalls += 1;
        const impl = globalRivetNodeRegistry.createDynamicImpl(node);
        return trackDefinitionCalls(impl, () => {
          definitionCalls += 1;
        });
      },
      getPluginFor(type: string) {
        return globalRivetNodeRegistry.getPluginFor(type);
      },
      getPlugins() {
        return globalRivetNodeRegistry.getPlugins();
      },
    } as unknown as NodeRegistration<any, any>,
  };
}

function trackDefinitionCalls(impl: NodeImpl<ChartNode>, onDefinitionCall: () => void): NodeImpl<ChartNode> {
  const getInputDefinitionsIncludingBuiltIn = impl.getInputDefinitionsIncludingBuiltIn.bind(impl);
  const getOutputDefinitions = impl.getOutputDefinitions.bind(impl);

  impl.getInputDefinitionsIncludingBuiltIn = (...args) => {
    onDefinitionCall();
    return getInputDefinitionsIncludingBuiltIn(...args);
  };
  impl.getOutputDefinitions = (...args) => {
    onDefinitionCall();
    return getOutputDefinitions(...args);
  };

  return impl;
}

void describe('createGraphRunner', () => {
  void it('reuses stable Node setup while accepting per-run inputs and context', async () => {
    const fixture = makeInputContextTextProject();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      runtimeProfile: 'headless-fast',
    });

    const firstOutputs = await runner.run({
      context: { suffix: 'first' },
      inputs: { input: 'a' },
    });
    const secondOutputs = await runner.run({
      context: { suffix: 'second' },
      inputs: { input: 'b' },
    });

    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'a first' },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'b second' },
    } satisfies Record<string, DataValue>);
  });

  void it('runs overlapping calls without sharing a running processor', async () => {
    const fixture = makeAsyncDelayProject(20);
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
    });

    const [firstOutputs, secondOutputs] = await Promise.all([
      runner.run({ inputs: { input: 'first' } }),
      runner.run({ inputs: { input: 'second' } }),
    ]);

    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'first' },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'second' },
    } satisfies Record<string, DataValue>);
  });

  void it('honors per-run abort signals', async () => {
    const fixture = makeAbortSignalProject(20);
    const controller = new AbortController();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      onNodeStart: () => {
        controller.abort();
      },
    });

    await assert.rejects(
      () =>
        runner.run({
          abortSignal: controller.signal,
          inputs: { input: 'abort seed' },
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /failed to process due to errors in nodes/);
        assert.ok(error.cause instanceof Error);
        assert.match(error.cause.message, /Aborted|Processing aborted/);
        return true;
      },
    );
  });

  void it('rejects future runs after dispose', async () => {
    const fixture = makeInputContextTextProject();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
    });

    runner.dispose();

    await assert.rejects(() => runner.run(), /Cannot run a disposed graph runner/);
  });

  void it('does not leak GraphProcessor globals between runs', async () => {
    const fixture = makeGlobalStateProject();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
    });

    const firstOutputs = await runner.run({
      inputs: { input: 'first' },
    });
    const secondOutputs = await runner.run({
      inputs: { input: 'second' },
    });

    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      previousResult: { type: 'string', value: '' },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      previousResult: { type: 'string', value: '' },
    } satisfies Record<string, DataValue>);
  });

  void it('prefers custom runtime providers when the fast profile is requested', async () => {
    const fixture = makeCodeChainProject(1);
    const codeRunner = new CountingCodeRunner();
    const runner = createGraphRunner(fixture.project, {
      codeRunner,
      graph: fixture.graphId,
      runtimeProfile: 'headless-fast',
    });

    const firstOutputs = await runner.run({
      inputs: { input: 10 },
    });
    const secondOutputs = await runner.run({
      inputs: { input: 20 },
    });

    assert.equal(codeRunner.calls, 2);
    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'any', value: 11 },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'any', value: 22 },
    } satisfies Record<string, DataValue>);
  });

  void it('reuses immutable graph plans only for the fast profile', async () => {
    const fixture = makeInputContextTextProject();
    const nodeCount = fixture.project.graphs[fixture.graphId]!.nodes.length;

    const fastRegistry = createCountingRegistry();
    const fastRunner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      registry: fastRegistry.registry,
      runtimeProfile: 'headless-fast',
    });
    await fastRunner.run({ context: { suffix: 'first' }, inputs: { input: 'a' } });
    await fastRunner.run({ context: { suffix: 'second' }, inputs: { input: 'b' } });
    assert.equal(fastRegistry.getCreateCalls(), nodeCount * 2);
    assert.equal(fastRegistry.getDefinitionCalls(), nodeCount * 2);

    const compatibleRegistry = createCountingRegistry();
    const compatibleRunner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      registry: compatibleRegistry.registry,
    });
    await compatibleRunner.run({ context: { suffix: 'first' }, inputs: { input: 'a' } });
    await compatibleRunner.run({ context: { suffix: 'second' }, inputs: { input: 'b' } });
    assert.equal(compatibleRegistry.getCreateCalls(), nodeCount * 2);
    assert.equal(compatibleRegistry.getDefinitionCalls(), nodeCount * 4);
  });

  void it('reuses immutable graph plans for subprocessors in the fast profile', async () => {
    const fixture = makeSubgraphChainProject(1);
    const nodeCount = Object.values(fixture.project.graphs).reduce((total, graph) => total + graph.nodes.length, 0);

    const fastRegistry = createCountingRegistry();
    const fastRunner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      registry: fastRegistry.registry,
      runtimeProfile: 'headless-fast',
    });
    const firstFastOutputs = await fastRunner.run({ inputs: { input: 'a' } });
    const secondFastOutputs = await fastRunner.run({ inputs: { input: 'b' } });
    assert.equal(firstFastOutputs.result?.value, 'ax');
    assert.equal(secondFastOutputs.result?.value, 'bx');
    assert.equal(fastRegistry.getCreateCalls(), nodeCount * 2);
    assert.equal(fastRegistry.getDefinitionCalls(), nodeCount * 2);

    const compatibleRegistry = createCountingRegistry();
    const compatibleRunner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      registry: compatibleRegistry.registry,
    });
    await compatibleRunner.run({ inputs: { input: 'a' } });
    await compatibleRunner.run({ inputs: { input: 'b' } });
    assert.equal(compatibleRegistry.getCreateCalls(), nodeCount * 2);
    assert.equal(compatibleRegistry.getDefinitionCalls(), nodeCount * 4);
  });

  void it('does not load the native runtime for existing TypeScript profiles', async () => {
    const fixture = makeTextChainProject(1);
    let nativeLoadCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('Native runtime should not load for non-native profiles.');
    });

    try {
      const compatibleRunner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
      });
      const fastRunner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'headless-fast',
      });

      assert.deepEqual(await compatibleRunner.run({ inputs: { input: 'a' } }), {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'ax' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(await fastRunner.run({ inputs: { input: 'b' } }), {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'bx' },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeLoadCalls, 0);
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('keeps native-fast scoped away from runGraph and createProcessor', async () => {
    const fixture = makeTextChainProject(1);
    let nativeLoadCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('Native runtime should not load outside createGraphRunner native-fast.');
    });

    try {
      assert.deepEqual(
        await runGraph(fixture.project, {
          graph: fixture.graphId,
          inputs: { input: 'runGraph' },
          runtimeProfile: 'native-fast',
        } as Parameters<typeof runGraph>[1] & { runtimeProfile: 'native-fast' }),
        {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'runGraphx' },
        } satisfies Record<string, DataValue>,
      );

      assert.deepEqual(
        await createProcessor(fixture.project, {
          graph: fixture.graphId,
          inputs: { input: 'processor' },
          runtimeProfile: 'native-fast' as never,
        }).run(),
        {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'processorx' },
        } satisfies Record<string, DataValue>,
      );

      assert.equal(nativeLoadCalls, 0);
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('falls back from native-fast when the native module cannot load', async () => {
    const fixture = makeTextChainProject(1);
    let nativeLoadCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('native module missing');
    });

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'fallback' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'fallbackx' },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeLoadCalls, 1);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        fallbackReason: 'module-load-failed:native module missing',
        nativeEligible: true,
        nativeUsed: false,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('falls back without loading native code when the graph is not native eligible', async () => {
    const fixture = makeCodeChainProject(1);
    let nativeLoadCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('Native runtime should not load for unsupported graphs.');
    });

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 1 } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'any', value: 2 },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeLoadCalls, 0);
      assert.match(runner.getNativeRuntimeDecision?.().fallbackReason ?? '', /^unsupported-node:codeNew:/);
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('falls back without loading native code when runner callbacks are provided', async () => {
    const fixture = makeTextChainProject(1);
    let nativeLoadCalls = 0;
    let nodeFinishCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('Native runtime should not load when callbacks are present.');
    });

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        onNodeFinish: () => {
          nodeFinishCalls += 1;
        },
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'callback' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'callbackx' },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeLoadCalls, 0);
      assert.ok(nodeFinishCalls > 0);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        fallbackReason: 'unsupported-option:onNodeFinish',
        nativeEligible: false,
        nativeUsed: false,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('falls back without loading native code when a custom registry is provided', async () => {
    const fixture = makeTextChainProject(1);
    const countingRegistry = createCountingRegistry();
    let nativeLoadCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('Native runtime should not load when a custom registry is present.');
    });

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        registry: countingRegistry.registry,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'registry' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'registryx' },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeLoadCalls, 0);
      assert.ok(countingRegistry.getDefinitionCalls() > 0);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        fallbackReason: 'unsupported-option:registry',
        nativeEligible: false,
        nativeUsed: false,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('falls back without loading native code when per-run abort signals are used', async () => {
    const fixture = makeTextChainProject(1);
    const controller = new AbortController();
    let nativeLoadCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('Native runtime should not load when per-run abort handling is required.');
    });

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({
        abortSignal: controller.signal,
        inputs: { input: 'abort-signal' },
      });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'abort-signalx' },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeLoadCalls, 0);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        fallbackReason: 'unsupported-run-option:abortSignal',
        nativeEligible: true,
        nativeUsed: false,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('falls back without loading native code when eligible nodes have unsupported connection ports', async () => {
    const fixture = makeTextChainProject(1);
    fixture.project.graphs[fixture.graphId]!.connections.push({
      inputId: 'value' as PortId,
      inputNodeId: 'graph-output' as NodeId,
      outputId: 'missing' as PortId,
      outputNodeId: 'text-0' as NodeId,
    } satisfies NodeConnection);
    let nativeLoadCalls = 0;
    setNativeRuntimeModuleLoaderForTesting(async () => {
      nativeLoadCalls += 1;
      throw new Error('Native runtime should not load with unsupported connection ports.');
    });

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'ports' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'portsx' },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeLoadCalls, 0);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        fallbackReason: 'unsupported-connection-output-port:text-0:missing',
        nativeEligible: false,
        nativeUsed: false,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('can load and run the local native-fast adapter from an explicit file URL override', async () => {
    const fixture = makeTextChainProject(1);
    const previousNativeRuntimeModule = process.env.RIVET_NATIVE_RUNTIME_MODULE;
    const previousNativeRuntimeBackend = process.env.RIVET_NATIVE_RUNTIME_BACKEND;
    process.env.RIVET_NATIVE_RUNTIME_MODULE = new URL('../../../native-runtime/index.js', import.meta.url).href;
    process.env.RIVET_NATIVE_RUNTIME_BACKEND = 'js';

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'local-stub' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'local-stubx' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        nativeBackend: 'js-adapter',
        nativeEligible: true,
        nativeUsed: true,
        requested: true,
      });
    } finally {
      if (previousNativeRuntimeModule == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_MODULE;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_MODULE = previousNativeRuntimeModule;
      }
      if (previousNativeRuntimeBackend == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_BACKEND;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_BACKEND = previousNativeRuntimeBackend;
      }
    }
  });

  void it('runs direct subgraph boundaries through the local native-fast adapter', async () => {
    const fixture = makeSubgraphChainProject(2);
    const previousNativeRuntimeModule = process.env.RIVET_NATIVE_RUNTIME_MODULE;
    const previousNativeRuntimeBackend = process.env.RIVET_NATIVE_RUNTIME_BACKEND;
    process.env.RIVET_NATIVE_RUNTIME_MODULE = new URL('../../../native-runtime/index.js', import.meta.url).href;
    process.env.RIVET_NATIVE_RUNTIME_BACKEND = 'js';

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'nested' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'nestedxx' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        nativeBackend: 'js-adapter',
        nativeEligible: true,
        nativeUsed: true,
        requested: true,
      });
    } finally {
      if (previousNativeRuntimeModule == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_MODULE;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_MODULE = previousNativeRuntimeModule;
      }
      if (previousNativeRuntimeBackend == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_BACKEND;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_BACKEND = previousNativeRuntimeBackend;
      }
    }
  });

  void it('runs context interpolation, processing pipes, and join fan-in through the local native-fast adapter', async () => {
    const contextFixture = makeInputContextTextProject();
    const pipeFixture = makeTextChainProject(1);
    const wideFixture = makeWideTextFanInProject(3);
    const pipeTextNode = pipeFixture.project.graphs[pipeFixture.graphId]!.nodes.find((node) => node.id === 'text-0')!;
    (pipeTextNode.data as { text: string }).text = '{{input | truncate 0}}';
    const previousNativeRuntimeModule = process.env.RIVET_NATIVE_RUNTIME_MODULE;
    const previousNativeRuntimeBackend = process.env.RIVET_NATIVE_RUNTIME_BACKEND;
    process.env.RIVET_NATIVE_RUNTIME_MODULE = new URL('../../../native-runtime/index.js', import.meta.url).href;
    process.env.RIVET_NATIVE_RUNTIME_BACKEND = 'js';

    try {
      const contextRunner = createGraphRunner(contextFixture.project, {
        graph: contextFixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const wideRunner = createGraphRunner(wideFixture.project, {
        graph: wideFixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const pipeRunner = createGraphRunner(pipeFixture.project, {
        graph: pipeFixture.graphId,
        runtimeProfile: 'native-fast',
      });

      assert.deepEqual(await contextRunner.run({ context: { suffix: 'ctx' }, inputs: { input: 'native' } }), {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'native ctx' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(await wideRunner.run({ inputs: { input: 'fan' } }), {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'fan-0fan-1fan-2' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(await pipeRunner.run({ inputs: { input: 'truncate me' } }), {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: '...' },
      } satisfies Record<string, DataValue>);
      assert.equal(contextRunner.getNativeRuntimeDecision?.().nativeUsed, true);
      assert.equal(contextRunner.getNativeRuntimeDecision?.().nativeBackend, 'js-adapter');
      assert.equal(wideRunner.getNativeRuntimeDecision?.().nativeUsed, true);
      assert.equal(wideRunner.getNativeRuntimeDecision?.().nativeBackend, 'js-adapter');
      assert.equal(pipeRunner.getNativeRuntimeDecision?.().nativeUsed, true);
      assert.equal(pipeRunner.getNativeRuntimeDecision?.().nativeBackend, 'js-adapter');
    } finally {
      if (previousNativeRuntimeModule == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_MODULE;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_MODULE = previousNativeRuntimeModule;
      }
      if (previousNativeRuntimeBackend == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_BACKEND;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_BACKEND = previousNativeRuntimeBackend;
      }
    }
  });

  void it('runs coalesce fan-in through the local native-fast adapter', async () => {
    const fixture = makeCoalesceFanInProject();
    const previousNativeRuntimeModule = process.env.RIVET_NATIVE_RUNTIME_MODULE;
    const previousNativeRuntimeBackend = process.env.RIVET_NATIVE_RUNTIME_BACKEND;
    process.env.RIVET_NATIVE_RUNTIME_MODULE = new URL('../../../native-runtime/index.js', import.meta.url).href;
    process.env.RIVET_NATIVE_RUNTIME_BACKEND = 'js';

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({
        inputs: {
          first: { type: 'any', value: null },
          second: { type: 'any', value: undefined },
          third: { type: 'string', value: 'winner' },
        },
      });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'winner' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        nativeBackend: 'js-adapter',
        nativeEligible: true,
        nativeUsed: true,
        requested: true,
      });
    } finally {
      if (previousNativeRuntimeModule == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_MODULE;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_MODULE = previousNativeRuntimeModule;
      }
      if (previousNativeRuntimeBackend == null) {
        delete process.env.RIVET_NATIVE_RUNTIME_BACKEND;
      } else {
        process.env.RIVET_NATIVE_RUNTIME_BACKEND = previousNativeRuntimeBackend;
      }
    }
  });

  void it('falls back before loading native-fast when text processing is outside the native parity subset', async () => {
    const fixture = makeTextChainProject(1);
    const textNode = fixture.project.graphs[fixture.graphId]!.nodes.find((node) => node.id === 'text-0')!;
    (textNode.data as { text: string }).text = '{{input | list}}';
    setNativeRuntimeModuleLoaderForTesting(async () => {
      throw new Error('Unsupported native graph should not load the native runtime module.');
    });

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'fallback' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: '- fallback' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        fallbackReason: 'unsupported-text-processing:list:text-0',
        nativeEligible: false,
        nativeUsed: false,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('can use an injected native-fast runner and report that native execution ran', async () => {
    const fixture = makeTextChainProject(1);
    let nativeCreateCalls = 0;
    const nativeModule: NativeRuntimeModule = {
      async createNativeGraphRunner(request) {
        nativeCreateCalls += 1;
        assert.equal(request.graphId, fixture.graphId);
        assert.equal(request.graphs.length, 1);

        return {
          backend: 'test-native',
          runner: {
            async run(options) {
              return {
                result: { type: 'string', value: `${options.inputs.input?.value}x` },
              };
            },
          },
          supported: true,
        };
      },
    };
    setNativeRuntimeModuleLoaderForTesting(async () => nativeModule);

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'native' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'nativex' },
      } satisfies Record<string, DataValue>);
      assert.equal(nativeCreateCalls, 1);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        nativeBackend: 'test-native',
        nativeEligible: true,
        nativeUsed: true,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('normalizes native-fast DataValues that cross JSON transport without an explicit value field', async () => {
    const fixture = makeTextChainProject(1);
    const nativeModule: NativeRuntimeModule = {
      async createNativeGraphRunner() {
        return {
          backend: 'test-native',
          runner: {
            async run() {
              return {
                result: { type: 'any' } as unknown as DataValue,
              };
            },
          },
          supported: true,
        };
      },
    };
    setNativeRuntimeModuleLoaderForTesting(async () => nativeModule);

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const outputs = await runner.run({ inputs: { input: 'native' } });

      assert.deepEqual(outputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'any', value: undefined },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(runner.getNativeRuntimeDecision?.(), {
        nativeBackend: 'test-native',
        nativeEligible: true,
        nativeUsed: true,
        requested: true,
      });
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('rejects a native-fast run disposed while the native module is loading', async () => {
    const fixture = makeTextChainProject(1);
    let resolveNativeModule!: (module: NativeRuntimeModule) => void;
    const nativeModulePromise = new Promise<NativeRuntimeModule>((resolve) => {
      resolveNativeModule = resolve;
    });
    let nativeCreateCalls = 0;

    setNativeRuntimeModuleLoaderForTesting(async () => nativeModulePromise);

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const runPromise = runner.run({ inputs: { input: 'disposed' } });
      runner.dispose();
      resolveNativeModule({
        async createNativeGraphRunner() {
          nativeCreateCalls += 1;
          return {
            runner: {
              async run() {
                throw new Error('Disposed native runner should not run.');
              },
            },
            supported: true,
          };
        },
      });

      await assert.rejects(runPromise, /Cannot run a disposed graph runner/);
      assert.equal(nativeCreateCalls, 0);
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });

  void it('allows overlapping native-fast runner calls without sharing per-run inputs', async () => {
    const fixture = makeTextChainProject(1);
    const nativeModule: NativeRuntimeModule = {
      async createNativeGraphRunner() {
        return {
          runner: {
            async run(options) {
              await new Promise((resolve) => setTimeout(resolve, 5));
              return {
                cost: { type: 'number', value: 0 },
                result: { type: 'string', value: `${options.inputs.input?.value}x` },
              };
            },
          },
          supported: true,
        };
      },
    };
    setNativeRuntimeModuleLoaderForTesting(async () => nativeModule);

    try {
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        runtimeProfile: 'native-fast',
      });
      const [firstOutputs, secondOutputs] = await Promise.all([
        runner.run({ inputs: { input: 'first' } }),
        runner.run({ inputs: { input: 'second' } }),
      ]);

      assert.deepEqual(firstOutputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'firstx' },
      } satisfies Record<string, DataValue>);
      assert.deepEqual(secondOutputs, {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'secondx' },
      } satisfies Record<string, DataValue>);
      assert.equal(runner.getNativeRuntimeDecision?.().nativeUsed, true);
    } finally {
      setNativeRuntimeModuleLoaderForTesting(undefined);
    }
  });
});
