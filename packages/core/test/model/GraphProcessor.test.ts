import { afterEach, it, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  GraphProcessor,
  NodeImpl,
  createBuiltInRegistry,
  globalRivetNodeRegistry,
  nodeDefinition,
  type ChartNode,
  type Inputs,
  type NodeConnection,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type Outputs,
  type PortId,
} from '../../src/index.js';
import { loadTestGraphInProcessor, testProcessContext } from '../testUtils';

type TrackedNode = ChartNode<'trackedTest', { delayMs: number }>;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function waitFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TrackedTestNodeImpl extends NodeImpl<TrackedNode> {
  static activeCount = 0;
  static maxActiveCount = 0;

  static resetCounts() {
    TrackedTestNodeImpl.activeCount = 0;
    TrackedTestNodeImpl.maxActiveCount = 0;
  }

  static create(): TrackedNode {
    return {
      type: 'trackedTest',
      id: `tracked-${Math.random()}` as NodeId,
      title: 'Tracked Test',
      visualData: { x: 0, y: 0, width: 175 },
      data: { delayMs: 25 },
    };
  }

  static getUIData() {
    return {};
  }

  getInputDefinitions(connections: NodeConnection[]): NodeInputDefinition[] {
    const hasInputConnection = connections.some(
      (connection) => connection.inputNodeId === this.chartNode.id && connection.inputId === ('input1' as PortId),
    );

    return hasInputConnection
      ? [
          {
            id: 'input1' as PortId,
            title: 'Input 1',
            dataType: 'string',
          },
        ]
      : [];
  }

  getOutputDefinitions(connections: NodeConnection[]): NodeOutputDefinition[] {
    const hasOutputConnection = connections.some(
      (connection) => connection.outputNodeId === this.chartNode.id && connection.outputId === ('output1' as PortId),
    );

    return hasOutputConnection
      ? [
          {
            id: 'output1' as PortId,
            title: 'Output 1',
            dataType: 'string',
          },
        ]
      : [];
  }

  async process(inputs: Inputs): Promise<Outputs> {
    TrackedTestNodeImpl.activeCount += 1;
    TrackedTestNodeImpl.maxActiveCount = Math.max(TrackedTestNodeImpl.maxActiveCount, TrackedTestNodeImpl.activeCount);

    try {
      await waitFor(this.data.delayMs);
      return inputs['input1' as PortId] != null ? { ['output1' as PortId]: inputs['input1' as PortId] } : {};
    } finally {
      TrackedTestNodeImpl.activeCount -= 1;
    }
  }
}

const trackedTestNode = nodeDefinition(TrackedTestNodeImpl, 'Tracked Test');

function createTrackedRegistry() {
  return createBuiltInRegistry().register(trackedTestNode);
}

function makeProject(graph: any) {
  return {
    metadata: {
      id: 'project-1',
      title: 'Project',
      description: '',
      mainGraphId: graph.metadata.id,
    },
    graphs: {
      [graph.metadata.id]: graph,
    },
    plugins: [],
  } as any;
}

void describe('GraphProcessor', () => {
  void it('Can run passthrough graph', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');

    const outputs = await processor.processGraph(testProcessContext(), {
      input: {
        type: 'string',
        value: 'input value',
      },
    });

    assert.deepEqual(outputs.output, {
      type: 'string',
      value: 'input value',
    });
  });

  void it('Can stream graph processor events', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');

    void processor.processGraph(testProcessContext(), {
      input: {
        type: 'string',
        value: 'input value',
      },
    });

    const eventNames: string[] = [];
    for await (const event of processor.events()) {
      if (event.type !== 'trace') {
        eventNames.push(event.type);
      }
    }

    assert.equal(eventNames[eventNames.length - 2], 'done');
    assert.equal(eventNames[eventNames.length - 1], 'finish');
  });

  void it('emits finish once for a successful run', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');
    let finishCount = 0;

    processor.on('finish', () => {
      finishCount += 1;
    });

    await processor.processGraph(testProcessContext(), {
      input: {
        type: 'string',
        value: 'input value',
      },
    });

    assert.equal(finishCount, 1);
  });

  void it('can resolve dependency nodes before processing and through cycles', () => {
    const graph = {
      metadata: {
        id: 'cycle-graph',
        name: 'Cycle Graph',
        description: '',
      },
      nodes: [
        {
          id: 'node-a',
          type: 'passthrough',
          title: 'Node A',
          data: {},
          visualData: { x: 0, y: 0, width: 175 },
        },
        {
          id: 'node-b',
          type: 'passthrough',
          title: 'Node B',
          data: {},
          visualData: { x: 250, y: 0, width: 175 },
        },
      ],
      connections: [
        {
          outputNodeId: 'node-a',
          outputId: 'output1',
          inputNodeId: 'node-b',
          inputId: 'input1',
        },
        {
          outputNodeId: 'node-b',
          outputId: 'output1',
          inputNodeId: 'node-a',
          inputId: 'input1',
        },
      ],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, globalRivetNodeRegistry);

    assert.deepEqual(new Set(processor.getDependencyNodesDeep('node-a' as any)), new Set(['node-a', 'node-b']));
  });

  void it('uses the latest context values for each run', async () => {
    const graph = {
      metadata: {
        id: 'context-graph',
        name: 'Context Graph',
        description: '',
      },
      nodes: [
        {
          id: 'context-node',
          type: 'context',
          title: 'Context',
          data: {
            id: 'greeting',
            dataType: 'string',
            useDefaultValueInput: false,
          },
          visualData: { x: 0, y: 0, width: 300 },
        },
        {
          id: 'output-node',
          type: 'graphOutput',
          title: 'Graph Output',
          data: {
            id: 'output',
            dataType: 'string',
          },
          visualData: { x: 250, y: 0, width: 300 },
        },
      ],
      connections: [
        {
          outputNodeId: 'context-node',
          outputId: 'data',
          inputNodeId: 'output-node',
          inputId: 'value',
        },
      ],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, globalRivetNodeRegistry);

    const firstOutputs = await processor.processGraph(testProcessContext(), {}, {
      greeting: { type: 'string', value: 'hello' },
    });
    const secondOutputs = await processor.processGraph(testProcessContext(), {}, {
      greeting: { type: 'string', value: 'goodbye' },
    });

    assert.deepEqual(firstOutputs.output, { type: 'string', value: 'hello' });
    assert.deepEqual(secondOutputs.output, { type: 'string', value: 'goodbye' });
  });

  void it('aborting a paused graph does not hang the run promise', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');

    processor.pause();

    const runOutcome = processor
      .processGraph(testProcessContext(), {
        input: {
          type: 'string',
          value: 'input value',
        },
      })
      .then(
        () => 'resolved',
        (error) => `rejected:${(error as Error).message}`,
      );

    setTimeout(() => {
      void processor.abort(false, 'graph execution aborted');
    }, 10);

    const outcome = await Promise.race([
      runOutcome,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 500)),
    ]);

    assert.equal(outcome, 'rejected:graph execution aborted');
  });

  void it('bounds graph-level node concurrency', async () => {
    TrackedTestNodeImpl.resetCounts();
    const registry = createTrackedRegistry();
    const makeTrackedNode = (id: string) => ({
      ...registry.create('trackedTest'),
      id: id as NodeId,
      title: id,
    });

    const graph = {
      metadata: {
        id: 'bounded-node-concurrency',
        name: 'Bounded Node Concurrency',
        description: '',
      },
      nodes: [makeTrackedNode('node-a'), makeTrackedNode('node-b'), makeTrackedNode('node-c'), makeTrackedNode('node-d')],
      connections: [],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, registry, true, {
      concurrency: { nodeConcurrency: 2 },
    });

    await processor.processGraph(testProcessContext());

    assert.equal(TrackedTestNodeImpl.maxActiveCount, 2);
  });

  void it('bounds split-run parallel concurrency', async () => {
    TrackedTestNodeImpl.resetCounts();
    const registry = createTrackedRegistry();

    const inputNode = registry.create('graphInput');
    inputNode.id = 'input-node' as NodeId;
    inputNode.data = {
      ...inputNode.data,
      id: 'items',
      dataType: 'string[]',
      useDefaultValueInput: false,
    };

    const trackedNode = registry.create('trackedTest');
    trackedNode.id = 'tracked-node' as NodeId;
    trackedNode.title = 'Tracked Split Node';
    trackedNode.isSplitRun = true;
    trackedNode.splitRunMax = 4;

    const outputNode = registry.create('graphOutput');
    outputNode.id = 'output-node' as NodeId;
    outputNode.data = {
      ...outputNode.data,
      id: 'output',
      dataType: 'string[]',
    };

    const graph = {
      metadata: {
        id: 'bounded-split-concurrency',
        name: 'Bounded Split Concurrency',
        description: '',
      },
      nodes: [inputNode, trackedNode, outputNode],
      connections: [
        {
          outputNodeId: inputNode.id,
          outputId: 'data' as PortId,
          inputNodeId: trackedNode.id,
          inputId: 'input1' as PortId,
        },
        {
          outputNodeId: trackedNode.id,
          outputId: 'output1' as PortId,
          inputNodeId: outputNode.id,
          inputId: 'value' as PortId,
        },
      ],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, registry, true, {
      concurrency: { splitRunConcurrency: 2 },
    });

    const outputs = await processor.processGraph(testProcessContext(), {
      items: { type: 'string[]', value: ['a', 'b', 'c', 'd'] },
    });

    assert.deepEqual(outputs.output, { type: 'string[]', value: ['a', 'b', 'c', 'd'] });
    assert.equal(TrackedTestNodeImpl.maxActiveCount, 2);
  });

  void it('treats caught Http Call request failures as successful node finishes', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    const graph = {
      metadata: {
        id: 'http-call-catch-request-failed',
        name: 'HTTP Call Catch Request Failed',
        description: '',
      },
      nodes: [
        {
          id: 'http-node',
          type: 'httpCall',
          title: 'Http Call',
          data: {
            method: 'GET',
            url: 'https://example.invalid',
            headers: '',
            body: '',
            errorOnNon200: true,
            catchRequestFailed: true,
          },
          visualData: { x: 0, y: 0, width: 250 },
        },
        {
          id: 'output-node',
          type: 'graphOutput',
          title: 'Graph Output',
          data: {
            id: 'requestFailed',
            dataType: 'boolean',
          },
          visualData: { x: 250, y: 0, width: 300 },
        },
      ],
      connections: [
        {
          outputNodeId: 'http-node',
          outputId: 'requestFailed',
          inputNodeId: 'output-node',
          inputId: 'value',
        },
      ],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, globalRivetNodeRegistry);
    const nodeErrors: string[] = [];
    const finishedNodes: string[] = [];

    processor.on('nodeError', ({ node }) => {
      nodeErrors.push(node.id);
    });

    processor.on('nodeFinish', ({ node }) => {
      finishedNodes.push(node.id);
    });

    const outputs = await processor.processGraph(testProcessContext());

    assert.deepStrictEqual(outputs.requestFailed, { type: 'boolean', value: true });
    assert.equal(nodeErrors.includes('http-node'), false);
    assert.equal(finishedNodes.includes('http-node'), true);
  });

  void it('treats caught non-2XX Http Call responses as successful node finishes', async () => {
    globalThis.fetch = async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });

    const graph = {
      metadata: {
        id: 'http-call-catch-non-2xx',
        name: 'HTTP Call Catch Non-2XX',
        description: '',
      },
      nodes: [
        {
          id: 'http-node',
          type: 'httpCall',
          title: 'Http Call',
          data: {
            method: 'GET',
            url: 'https://example.invalid',
            headers: '',
            body: '',
            errorOnNon200: true,
            catchRequestFailed: true,
          },
          visualData: { x: 0, y: 0, width: 250 },
        },
        {
          id: 'output-node',
          type: 'graphOutput',
          title: 'Graph Output',
          data: {
            id: 'requestFailed',
            dataType: 'boolean',
          },
          visualData: { x: 250, y: 0, width: 300 },
        },
      ],
      connections: [
        {
          outputNodeId: 'http-node',
          outputId: 'requestFailed',
          inputNodeId: 'output-node',
          inputId: 'value',
        },
      ],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, globalRivetNodeRegistry);
    const nodeErrors: string[] = [];
    const finishedNodes: string[] = [];

    processor.on('nodeError', ({ node }) => {
      nodeErrors.push(node.id);
    });

    processor.on('nodeFinish', ({ node }) => {
      finishedNodes.push(node.id);
    });

    const outputs = await processor.processGraph(testProcessContext());

    assert.deepStrictEqual(outputs.requestFailed, { type: 'boolean', value: true });
    assert.equal(nodeErrors.includes('http-node'), false);
    assert.equal(finishedNodes.includes('http-node'), true);
  });
});
