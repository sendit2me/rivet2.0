import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createGraphRunner,
  globalRivetNodeRegistry,
  type ChartNode,
  type CodeRunner,
  type DataValue,
  type Inputs,
  type NodeImpl,
  type NodeRegistration,
  type Outputs,
} from '../src/index.js';
import {
  makeAbortSignalProject,
  makeAsyncDelayProject,
  makeCodeChainProject,
  makeGlobalStateProject,
  makeInputContextTextProject,
  makeSubgraphChainProject,
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
});
