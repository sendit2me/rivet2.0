import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createGraphRunner,
  globalRivetNodeRegistry,
  type ChartNode,
  type CodeRunner,
  type DataValue,
  type GraphId,
  type Inputs,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type NodeImpl,
  type NodeRegistration,
  type Outputs,
  type PortId,
  type Project,
  type ProjectId,
} from '../src/index.js';
import {
  makeAbortSignalProject,
  makeAsyncDelayProject,
  makeCodeChainProject,
  makeGlobalStateProject,
  makeInputContextTextProject,
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

function makeSubgraphProject(): { graphIds: GraphId[]; project: Project } {
  const mainGraphId = 'main-graph' as GraphId;
  const subGraphId = 'sub-graph' as GraphId;

  const mainInput = makeGraphInputNode('main-input', 'input');
  const subGraphNode: ChartNode = {
    data: {
      graphId: subGraphId,
      useErrorOutput: false,
      useAsGraphPartialOutput: false,
    },
    id: 'subgraph-node' as NodeId,
    title: 'Subgraph',
    type: 'subGraph',
    visualData: { width: 300, x: 300, y: 0 },
  };
  const mainOutput = makeGraphOutputNode('main-output', 'result');
  const subInput = makeGraphInputNode('sub-input', 'input');
  const subText: ChartNode = {
    data: {
      normalizeLineEndings: true,
      text: '{{input}} sub',
    },
    id: 'sub-text' as NodeId,
    title: 'Text',
    type: 'text',
    visualData: { width: 260, x: 300, y: 0 },
  };
  const subOutput = makeGraphOutputNode('sub-output', 'result');

  const mainGraph: NodeGraph = {
    connections: [
      connect(mainInput.id, 'data', subGraphNode.id, 'input'),
      connect(subGraphNode.id, 'result', mainOutput.id, 'value'),
    ],
    metadata: {
      id: mainGraphId,
      name: 'Main Graph',
    },
    nodes: [mainInput, subGraphNode, mainOutput],
  };
  const subGraph: NodeGraph = {
    connections: [connect(subInput.id, 'data', subText.id, 'input'), connect(subText.id, 'output', subOutput.id, 'value')],
    metadata: {
      id: subGraphId,
      name: 'Sub Graph',
    },
    nodes: [subInput, subText, subOutput],
  };

  return {
    graphIds: [mainGraphId, subGraphId],
    project: {
      graphs: {
        [mainGraphId]: mainGraph,
        [subGraphId]: subGraph,
      },
      metadata: {
        id: 'subgraph-project' as ProjectId,
        mainGraphId,
        title: 'Subgraph Project',
      },
      plugins: [],
    },
  };
}

function makeGraphInputNode(id: string, inputId: string): ChartNode {
  return {
    data: {
      dataType: 'string',
      id: inputId,
      useDefaultValueInput: false,
    },
    id: id as NodeId,
    title: 'Graph Input',
    type: 'graphInput',
    visualData: { width: 240, x: 0, y: 0 },
  };
}

function makeGraphOutputNode(id: string, outputId: string): ChartNode {
  return {
    data: {
      dataType: 'string',
      id: outputId,
    },
    id: id as NodeId,
    title: 'Graph Output',
    type: 'graphOutput',
    visualData: { width: 240, x: 600, y: 0 },
  };
}

function connect(outputNodeId: string | NodeId, outputId: string, inputNodeId: string | NodeId, inputId: string): NodeConnection {
  return {
    inputId: inputId as PortId,
    inputNodeId: inputNodeId as NodeId,
    outputId: outputId as PortId,
    outputNodeId: outputNodeId as NodeId,
  };
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
    const fixture = makeSubgraphProject();
    const nodeCount = fixture.graphIds.reduce(
      (total, graphId) => total + fixture.project.graphs[graphId]!.nodes.length,
      0,
    );

    const fastRegistry = createCountingRegistry();
    const fastRunner = createGraphRunner(fixture.project, {
      graph: fixture.graphIds[0],
      registry: fastRegistry.registry,
      runtimeProfile: 'headless-fast',
    });
    const firstFastOutputs = await fastRunner.run({ inputs: { input: 'a' } });
    const secondFastOutputs = await fastRunner.run({ inputs: { input: 'b' } });
    assert.equal(firstFastOutputs.result?.value, 'a sub');
    assert.equal(secondFastOutputs.result?.value, 'b sub');
    assert.equal(fastRegistry.getCreateCalls(), nodeCount * 2);
    assert.equal(fastRegistry.getDefinitionCalls(), nodeCount * 2);

    const compatibleRegistry = createCountingRegistry();
    const compatibleRunner = createGraphRunner(fixture.project, {
      graph: fixture.graphIds[0],
      registry: compatibleRegistry.registry,
    });
    await compatibleRunner.run({ inputs: { input: 'a' } });
    await compatibleRunner.run({ inputs: { input: 'b' } });
    assert.equal(compatibleRegistry.getCreateCalls(), nodeCount * 2);
    assert.equal(compatibleRegistry.getDefinitionCalls(), nodeCount * 4);
  });
});
