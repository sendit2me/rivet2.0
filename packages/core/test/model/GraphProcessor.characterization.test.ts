import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  GraphProcessor,
  NodeImpl,
  createBuiltInRegistry,
  nodeDefinition,
  type ChartNode,
  type DataValue,
  type GraphId,
  type GraphProcessorRuntimeCache,
  type Inputs,
  type InternalProcessContext,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type Outputs,
  type PortId,
  type ProcessEvents,
  type Project,
  type ProjectId,
  type ScalarOrArrayDataValue,
} from '../../src/index.js';
import { testProcessContext } from '../testUtils.js';

type CharacterizationNode = ChartNode<'graphProcessorCharacterization', CharacterizationNodeData>;

type CharacterizationNodeData = {
  value?: DataValue;
  delayMs?: number;
  throwMessage?: string;
  partialValues?: DataValue[];
  setGlobal?: {
    id: string;
    value: ScalarOrArrayDataValue;
  };
  waitForGlobal?: string;
};

const graphId = 'graph-processor-characterization' as GraphId;

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, label: string, ms = 2_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
  });

  try {
    return await Promise.race([promise, timedOut]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

class CharacterizationNodeImpl extends NodeImpl<CharacterizationNode> {
  static create(): CharacterizationNode {
    return makeProbeNode('probe-node');
  }

  static getUIData() {
    return {};
  }

  getInputDefinitions(): NodeInputDefinition[] {
    return [
      {
        id: 'input' as PortId,
        title: 'Input',
        dataType: 'any',
      },
    ];
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        id: 'output' as PortId,
        title: 'Output',
        dataType: 'any',
      },
    ];
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    if (this.data.delayMs) {
      await waitFor(this.data.delayMs);
    }

    for (const partialValue of this.data.partialValues ?? []) {
      context.onPartialOutputs?.({ output: partialValue });
    }

    if (this.data.throwMessage) {
      throw new Error(this.data.throwMessage);
    }

    if (this.data.setGlobal) {
      context.setGlobal(this.data.setGlobal.id, this.data.setGlobal.value);
    }

    if (this.data.waitForGlobal) {
      const value = await context.waitForGlobal(this.data.waitForGlobal);
      return { output: value };
    }

    return {
      output: this.data.value ?? inputs['input' as PortId] ?? { type: 'string', value: this.id },
    };
  }
}

const characterizationNode = nodeDefinition(CharacterizationNodeImpl, 'Graph Processor Characterization');

function createRegistry() {
  return createBuiltInRegistry().register(characterizationNode);
}

function makeProbeNode(id: string, data: CharacterizationNodeData = {}): CharacterizationNode {
  return {
    id: id as NodeId,
    type: 'graphProcessorCharacterization',
    title: id,
    data,
    visualData: { x: 0, y: 0, width: 200 },
  };
}

function makeGraphOutputNode(id = 'result'): ChartNode {
  return {
    id: `${id}-output-node` as NodeId,
    type: 'graphOutput',
    title: 'Graph Output',
    data: {
      id,
      dataType: 'any',
    },
    visualData: { x: 600, y: 0, width: 240 },
  };
}

function connect(outputNodeId: string, inputNodeId: string, inputId = 'input'): NodeConnection {
  return {
    outputNodeId: outputNodeId as NodeId,
    outputId: 'output' as PortId,
    inputNodeId: inputNodeId as NodeId,
    inputId: inputId as PortId,
  };
}

function makeGraph(nodes: ChartNode[], connections: NodeConnection[], id: GraphId = graphId): NodeGraph {
  return {
    metadata: {
      id,
      name: id,
      description: '',
    },
    nodes,
    connections,
  };
}

function makeProject(graph: NodeGraph, extraGraphs: NodeGraph[] = []): Project {
  return {
    metadata: {
      id: 'project-1' as ProjectId,
      title: 'Project',
      description: '',
      mainGraphId: graph.metadata!.id,
    },
    graphs: Object.fromEntries(
      [graph, ...extraGraphs].map((projectGraph) => [projectGraph.metadata!.id, projectGraph]),
    ),
    plugins: [],
  };
}

function createProcessor(graph: NodeGraph, extraGraphs: NodeGraph[] = []): GraphProcessor {
  return new GraphProcessor(makeProject(graph, extraGraphs), graph.metadata!.id, createRegistry());
}

void describe('GraphProcessor characterization', () => {
  void it('preserves successful root event order from graph start through finish', async () => {
    const nodeA = makeProbeNode('node-a', { value: { type: 'string', value: 'alpha' } });
    const nodeB = makeProbeNode('node-b');
    const outputNode = makeGraphOutputNode('result');
    const graph = makeGraph(
      [nodeA, nodeB, outputNode],
      [connect('node-a', 'node-b'), connect('node-b', outputNode.id, 'value')],
    );
    const processor = createProcessor(graph);
    const events: string[] = [];

    processor.on('start', () => events.push('start'));
    processor.on('graphStart', () => events.push('graphStart'));
    processor.on('nodeStart', ({ node }) => events.push(`nodeStart:${node.id}`));
    processor.on('nodeFinish', ({ node }) => events.push(`nodeFinish:${node.id}`));
    processor.on('graphFinish', () => events.push('graphFinish'));
    processor.on('done', () => events.push('done'));
    processor.on('finish', () => events.push('finish'));

    const outputs = await processor.processGraph(testProcessContext());

    assert.deepEqual(outputs.result, { type: 'string', value: 'alpha' });
    assert.deepEqual(events, [
      'start',
      'graphStart',
      'nodeStart:node-a',
      'nodeFinish:node-a',
      'nodeStart:node-b',
      'nodeFinish:node-b',
      `nodeStart:${outputNode.id}`,
      `nodeFinish:${outputNode.id}`,
      'graphFinish',
      'done',
      'finish',
    ]);
  });

  void it('replaces preprocessed graph maps when a reused processor sees graph edits', async () => {
    const nodeA = makeProbeNode('node-a', { value: { type: 'string', value: 'alpha' } });
    const outputNode = makeGraphOutputNode('result');
    const graph = makeGraph([nodeA, outputNode], [connect(nodeA.id, outputNode.id, 'value')]);
    const processor = createProcessor(graph);

    const firstOutputs = await processor.processGraph(testProcessContext());
    graph.connections = [];
    const secondOutputs = await processor.processGraph(testProcessContext());

    assert.deepEqual(firstOutputs.result, { type: 'string', value: 'alpha' });
    assert.equal(secondOutputs.result, undefined);
  });

  void it('emits node and graph errors without graphFinish or done, then still emits finish', async () => {
    const failingNode = makeProbeNode('failing-node', { throwMessage: 'characterized failure' });
    const graph = makeGraph([failingNode], []);
    const processor = createProcessor(graph);
    const events: string[] = [];
    const nodeErrored = processor.once('nodeError');
    const graphErrored = processor.once('graphError');
    const genericErrored = processor.once('error');

    processor.on('start', () => events.push('start'));
    processor.on('graphStart', () => events.push('graphStart'));
    processor.on('nodeStart', ({ node }) => events.push(`nodeStart:${node.id}`));
    processor.on('nodeError', ({ node }) => events.push(`nodeError:${node.id}`));
    processor.on('graphError', () => events.push('graphError'));
    processor.on('error', () => events.push('error'));
    processor.on('graphFinish', () => events.push('graphFinish'));
    processor.on('done', () => events.push('done'));
    processor.on('finish', () => events.push('finish'));

    await assert.rejects(
      () => withTimeout(processor.processGraph(testProcessContext()), 'failing graph rejection'),
      (error) =>
        error instanceof Error &&
        error.message.includes('failed to process due to errors in nodes') &&
        error.cause instanceof Error &&
        error.cause.message === 'characterized failure',
    );
    await withTimeout(Promise.all([nodeErrored, graphErrored, genericErrored]), 'processor error events');

    assert.equal(events.includes('nodeError:failing-node'), true);
    assert.equal(events.includes('graphError'), true);
    assert.equal(events.includes('error'), true);
    assert.equal(events.includes('graphFinish'), false);
    assert.equal(events.includes('done'), false);
    assert.equal(events.at(-1), 'finish');
    assert.ok(events.indexOf('nodeStart:failing-node') < events.indexOf('nodeError:failing-node'));
    assert.ok(events.indexOf('graphError') < events.indexOf('finish'));
  });

  void it('does not start downstream nodes after an input node errors', async () => {
    const failingNode = makeProbeNode('failing-node', { throwMessage: 'upstream failure' });
    const downstreamNode = makeProbeNode('downstream-node');
    const graph = makeGraph([failingNode, downstreamNode], [connect('failing-node', 'downstream-node')]);
    const processor = createProcessor(graph);
    const nodeStarts: NodeId[] = [];
    const nodeErrors: NodeId[] = [];

    processor.on('nodeStart', ({ node }) => nodeStarts.push(node.id));
    processor.on('nodeError', ({ node }) => nodeErrors.push(node.id));

    await assert.rejects(
      () => withTimeout(processor.processGraph(testProcessContext()), 'errored-input graph rejection'),
      (error) =>
        error instanceof Error &&
        error.message.includes('failed to process due to errors in nodes') &&
        error.cause instanceof Error &&
        error.cause.message === 'upstream failure',
    );

    assert.deepEqual(nodeStarts, [failingNode.id]);
    assert.deepEqual(nodeErrors, [failingNode.id]);
  });

  void it('emits partial outputs with the same process id as the finished node', async () => {
    const partialNode = makeProbeNode('partial-node', {
      partialValues: [
        { type: 'string', value: 'partial one' },
        { type: 'string', value: 'partial two' },
      ],
      value: { type: 'string', value: 'final' },
    });
    const graph = makeGraph([partialNode], []);
    const processor = createProcessor(graph);
    const partialOutputs: ProcessEvents['partialOutput'][] = [];
    let resolvePartialOutputs: (() => void) | undefined;
    const allPartialOutputs = new Promise<void>((resolve) => {
      resolvePartialOutputs = resolve;
    });
    let nodeStartProcessId: ProcessEvents['nodeStart']['processId'] | undefined;
    let nodeFinish: ProcessEvents['nodeFinish'] | undefined;

    processor.on('nodeStart', ({ node, processId }) => {
      if (node.id === partialNode.id) {
        nodeStartProcessId = processId;
      }
    });
    processor.on('partialOutput', (event) => {
      partialOutputs.push(event);
      if (partialOutputs.length === 2) {
        resolvePartialOutputs?.();
      }
    });
    processor.on('nodeFinish', (event) => {
      if (event.node.id === partialNode.id) {
        nodeFinish = event;
      }
    });

    await withTimeout(processor.processGraph(testProcessContext()), 'partial-output graph run');
    await withTimeout(allPartialOutputs, 'partial output events');

    assert.equal(partialOutputs.length, 2);
    assert.deepEqual(
      partialOutputs.map((event) => event.outputs.output),
      [
        { type: 'string', value: 'partial one' },
        { type: 'string', value: 'partial two' },
      ],
    );
    assert.equal(
      partialOutputs.every((event) => event.processId === nodeStartProcessId),
      true,
    );
    assert.equal(nodeFinish?.processId, nodeStartProcessId);
    assert.deepEqual(nodeFinish?.outputs.output, { type: 'string', value: 'final' });
  });

  void it('forwards subgraph events with stable root, parent, executor, and graph run metadata', async () => {
    const childInputNode: ChartNode = {
      id: 'child-input' as NodeId,
      type: 'graphInput',
      title: 'Child Input',
      data: {
        id: 'incoming',
        dataType: 'string',
        useDefaultValueInput: false,
      },
      visualData: { x: 0, y: 0, width: 240 },
    };
    const childProbeNode = makeProbeNode('child-probe');
    const childOutputNode = makeGraphOutputNode('childResult');
    const childGraph = makeGraph(
      [childInputNode, childProbeNode, childOutputNode],
      [
        {
          outputNodeId: childInputNode.id,
          outputId: 'data' as PortId,
          inputNodeId: childProbeNode.id,
          inputId: 'input' as PortId,
        },
        connect(childProbeNode.id, childOutputNode.id, 'value'),
      ],
      'child-graph' as GraphId,
    );
    const subgraphNode: ChartNode = {
      id: 'subgraph-node' as NodeId,
      type: 'subGraph',
      title: 'Subgraph',
      data: {
        graphId: childGraph.metadata!.id,
        useErrorOutput: false,
        useAsGraphPartialOutput: false,
        inputData: {
          incoming: { type: 'string', value: 'from parent' },
        },
      },
      visualData: { x: 0, y: 0, width: 240 },
    };
    const parentOutputNode = makeGraphOutputNode('parentResult');
    const parentGraph = makeGraph(
      [subgraphNode, parentOutputNode],
      [
        {
          outputNodeId: subgraphNode.id,
          outputId: 'childResult' as PortId,
          inputNodeId: parentOutputNode.id,
          inputId: 'value' as PortId,
        },
      ],
      'parent-graph' as GraphId,
    );
    const processor = createProcessor(parentGraph, [childGraph]);
    const graphStarts: ProcessEvents['graphStart'][] = [];
    let parentSubgraphProcessId: ProcessEvents['nodeStart']['processId'] | undefined;

    processor.on('graphStart', (event) => graphStarts.push(event));
    processor.on('nodeStart', ({ node, processId }) => {
      if (node.id === subgraphNode.id) {
        parentSubgraphProcessId = processId;
      }
    });

    const outputs = await processor.processGraph(testProcessContext());

    assert.deepEqual(outputs.parentResult, { type: 'string', value: 'from parent' });
    assert.equal(graphStarts.length, 2);
    assert.equal(graphStarts[0]!.execution.graphId, parentGraph.metadata!.id);
    assert.equal(graphStarts[1]!.execution.graphId, childGraph.metadata!.id);
    assert.equal(graphStarts[1]!.execution.rootRunId, graphStarts[0]!.execution.rootRunId);
    assert.equal(graphStarts[1]!.execution.parentGraphRunId, graphStarts[0]!.execution.graphRunId);
    assert.deepEqual(graphStarts[1]!.execution.executor, {
      nodeId: subgraphNode.id,
      parentGraphId: parentGraph.metadata!.id,
      processId: parentSubgraphProcessId,
      splitIndex: 0,
    });
  });

  void it('preloads boundary nodes and runs only the requested terminal slice', async () => {
    const nodeA = makeProbeNode('node-a', { value: { type: 'string', value: 'fresh a' } });
    const nodeB = makeProbeNode('node-b');
    const nodeC = makeProbeNode('node-c');
    const graph = makeGraph([nodeA, nodeB, nodeC], [connect('node-a', 'node-b'), connect('node-b', 'node-c')]);
    const processor = createProcessor(graph);
    const starts: Array<{ nodeId: NodeId; processId: ProcessEvents['nodeStart']['processId'] }> = [];
    const finishes: Array<{ nodeId: NodeId; processId: ProcessEvents['nodeFinish']['processId']; outputs: Outputs }> =
      [];

    processor.preloadNodeData(nodeB.id, {
      output: { type: 'string', value: 'preloaded b' },
    });
    processor.runToNodeIds = [nodeC.id];
    processor.on('nodeStart', ({ node, processId }) => starts.push({ nodeId: node.id, processId }));
    processor.on('nodeFinish', ({ node, outputs, processId }) =>
      finishes.push({ nodeId: node.id, processId, outputs }),
    );

    await processor.processGraph(testProcessContext());

    assert.equal(starts.length, 2);
    assert.deepEqual(starts[0], {
      nodeId: nodeB.id,
      processId: 'preload' as ProcessEvents['nodeStart']['processId'],
    });
    assert.equal(starts[1]!.nodeId, nodeC.id);
    assert.notEqual(starts[1]!.processId, 'preload');
    assert.equal(finishes.length, 2);
    assert.equal(finishes[0]!.nodeId, nodeB.id);
    assert.equal(finishes[0]!.processId, 'preload');
    assert.deepEqual(finishes[0]!.outputs.output, { type: 'string', value: 'preloaded b' });
    assert.equal(finishes[1]!.nodeId, nodeC.id);
    assert.deepEqual(finishes[1]!.outputs.output, { type: 'string', value: 'preloaded b' });
    assert.equal(
      starts.some((event) => event.nodeId === nodeA.id),
      false,
    );
    assert.equal(starts.filter((event) => event.nodeId === nodeB.id).length, 1);
  });

  void it('honors runTo terminal selection without executing downstream consumers', async () => {
    const nodeA = makeProbeNode('node-a', { value: { type: 'string', value: 'alpha' } });
    const nodeB = makeProbeNode('node-b');
    const nodeC = makeProbeNode('node-c');
    const outputNode = makeGraphOutputNode('result');
    const graph = makeGraph(
      [nodeA, nodeB, nodeC, outputNode],
      [connect('node-a', 'node-b'), connect('node-b', 'node-c'), connect('node-c', outputNode.id, 'value')],
    );
    const processor = createProcessor(graph);
    const finishedNodeIds: NodeId[] = [];

    processor.runToNodeIds = [nodeB.id];
    processor.on('nodeFinish', ({ node }) => finishedNodeIds.push(node.id));

    const outputs = await processor.processGraph(testProcessContext());

    assert.deepEqual(finishedNodeIds, [nodeA.id, nodeB.id]);
    assert.equal(outputs.result, undefined);
    assert.deepEqual(outputs.cost, { type: 'number', value: 0 });
  });

  void it('does not start queued nodes while paused and resumes them in the same run', async () => {
    const pausedNode = makeProbeNode('paused-node', { value: { type: 'string', value: 'resumed' } });
    const graph = makeGraph([pausedNode], []);
    const processor = createProcessor(graph);
    const events: string[] = [];
    const pauseEmitted = processor.once('pause');
    const graphStarted = processor.once('graphStart');

    processor.on('pause', () => events.push('pause'));
    processor.on('graphStart', () => events.push('graphStart'));
    processor.on('nodeStart', ({ node }) => events.push(`nodeStart:${node.id}`));
    processor.on('resume', () => events.push('resume'));
    processor.on('finish', () => events.push('finish'));

    processor.pause();
    await withTimeout(pauseEmitted, 'pause event');

    const runPromise = processor.processGraph(testProcessContext());
    await withTimeout(graphStarted, 'paused graph start');
    await waitFor(20);

    assert.deepEqual(events, ['pause', 'graphStart']);

    processor.resume();
    await withTimeout(runPromise, 'paused graph run to finish');

    assert.deepEqual(events, ['pause', 'graphStart', 'resume', `nodeStart:${pausedNode.id}`, 'finish']);
  });

  void it('keeps globals shared across concurrently-started nodes in the same run', async () => {
    const writerNode = makeProbeNode('writer-node', {
      delayMs: 10,
      setGlobal: { id: 'shared', value: { type: 'string', value: 'global value' } },
      value: { type: 'string', value: 'writer done' },
    });
    const readerNode = makeProbeNode('reader-node', {
      waitForGlobal: 'shared',
    });
    const graph = makeGraph([writerNode, readerNode], []);
    const processor = createProcessor(graph);
    const globalSetEvents: ProcessEvents['globalSet'][] = [];
    let resolveReaderFinished: (() => void) | undefined;
    const readerFinished = new Promise<void>((resolve) => {
      resolveReaderFinished = resolve;
    });
    let readerFinish: ProcessEvents['nodeFinish'] | undefined;

    processor.on('globalSet', (event) => globalSetEvents.push(event));
    processor.on('nodeFinish', (event) => {
      if (event.node.id === readerNode.id) {
        readerFinish = event;
        resolveReaderFinished?.();
      }
    });

    await withTimeout(processor.processGraph(testProcessContext()), 'global-sharing graph run');
    await withTimeout(readerFinished, 'reader node finish event');

    assert.deepEqual(
      globalSetEvents.map((event) => [event.id, event.value]),
      [['shared', { type: 'string', value: 'global value' }]],
    );
    assert.deepEqual(readerFinish?.outputs.output, { type: 'string', value: 'global value' });
  });

  void it('reads cached referenced projects only when loaded-project caching is enabled', async () => {
    const mainGraphId = 'reference-cache-main' as GraphId;
    const referencedProjectId = 'reference-cache-child' as ProjectId;
    const project: Project = {
      graphs: {
        [mainGraphId]: {
          connections: [],
          metadata: {
            id: mainGraphId,
            name: 'Reference Cache Main',
          },
          nodes: [],
        },
      },
      metadata: {
        description: '',
        id: 'reference-cache-root' as ProjectId,
        mainGraphId,
        title: 'Reference Cache Root',
      },
      plugins: [],
      references: [{ id: referencedProjectId, title: 'Reference Cache Child' }],
    };
    const referencedProject: Project = {
      graphs: {},
      metadata: {
        description: '',
        id: referencedProjectId,
        title: 'Reference Cache Child',
      },
      plugins: [],
    };
    const mainGraph = project.graphs[mainGraphId]!;
    const runtimeCache: GraphProcessorRuntimeCache = {
      loadedProjects: {
        [referencedProjectId]: referencedProject,
      },
    };
    let loadCalls = 0;
    const context = {
      ...testProcessContext(),
      projectReferenceLoader: {
        async loadProject() {
          loadCalls += 1;
          return referencedProject;
        },
      },
    };

    const uncachedProcessor = new GraphProcessor(project, mainGraphId, createRegistry(), false, {
      cacheLoadedProjects: false,
      runtimeCache,
    });
    await uncachedProcessor.processGraph(context);
    assert.equal(loadCalls, 1);
    assert.notEqual(runtimeCache.executionPlans?.has(mainGraph), true);

    const cachedProcessor = new GraphProcessor(project, mainGraphId, createRegistry(), false, {
      cacheLoadedProjects: true,
      runtimeCache,
    });
    await cachedProcessor.processGraph(context);
    assert.equal(loadCalls, 1);
    assert.equal(runtimeCache.executionPlans?.has(mainGraph), true);
  });

  void it('can cache execution plans for subprocessors without caching the root graph', async () => {
    const childProbeNode = makeProbeNode('child-probe', { value: { type: 'string', value: 'child value' } });
    const childOutputNode = makeGraphOutputNode('childResult');
    const childGraph = makeGraph(
      [childProbeNode, childOutputNode],
      [connect(childProbeNode.id, childOutputNode.id, 'value')],
      'subprocessor-cache-child' as GraphId,
    );
    const subgraphNode: ChartNode = {
      id: 'subgraph-node' as NodeId,
      type: 'subGraph',
      title: 'Subgraph',
      data: {
        graphId: childGraph.metadata!.id,
        inputData: {},
        useAsGraphPartialOutput: false,
        useErrorOutput: false,
      },
      visualData: { x: 0, y: 0, width: 240 },
    };
    const parentOutputNode = makeGraphOutputNode('parentResult');
    const parentGraph = makeGraph(
      [subgraphNode, parentOutputNode],
      [
        {
          outputNodeId: subgraphNode.id,
          outputId: 'childResult' as PortId,
          inputNodeId: parentOutputNode.id,
          inputId: 'value' as PortId,
        },
      ],
      'subprocessor-cache-parent' as GraphId,
    );
    const runtimeCache: GraphProcessorRuntimeCache = {};
    const processor = new GraphProcessor(
      makeProject(parentGraph, [childGraph]),
      parentGraph.metadata!.id,
      createRegistry(),
      false,
      {
        executionPlanCacheMode: 'subprocessors',
        runtimeCache,
      },
    );

    const outputs = await processor.processGraph(testProcessContext());

    assert.deepEqual(outputs.parentResult, { type: 'string', value: 'child value' });
    assert.notEqual(runtimeCache.executionPlans?.has(parentGraph), true);
    assert.equal(runtimeCache.executionPlans?.has(childGraph), true);
  });

  void it('uses the runtime graph boundary cache while preprocessing subgraph definitions', () => {
    const childProbeNode = makeProbeNode('child-probe', { value: { type: 'string', value: 'child value' } });
    const childOutputNode = makeGraphOutputNode('childResult');
    const childGraph = makeGraph(
      [childProbeNode, childOutputNode],
      [connect(childProbeNode.id, childOutputNode.id, 'value')],
      'boundary-cache-child' as GraphId,
    );
    const subgraphNode: ChartNode = {
      id: 'subgraph-node' as NodeId,
      type: 'subGraph',
      title: 'Subgraph',
      data: {
        graphId: childGraph.metadata!.id,
        inputData: {},
        useAsGraphPartialOutput: false,
        useErrorOutput: false,
      },
      visualData: { x: 0, y: 0, width: 240 },
    };
    const parentOutputNode = makeGraphOutputNode('parentResult');
    const parentGraph = makeGraph(
      [subgraphNode, parentOutputNode],
      [
        {
          outputNodeId: subgraphNode.id,
          outputId: 'childResult' as PortId,
          inputNodeId: parentOutputNode.id,
          inputId: 'value' as PortId,
        },
      ],
      'boundary-cache-parent' as GraphId,
    );
    const runtimeCache: GraphProcessorRuntimeCache = {};
    const processor = new GraphProcessor(
      makeProject(parentGraph, [childGraph]),
      parentGraph.metadata!.id,
      createRegistry(),
      false,
      {
        executionPlanCacheMode: 'subprocessors',
        runtimeCache,
      },
    );

    processor.getDependencyNodesDeep(parentOutputNode.id);

    assert.notEqual(runtimeCache.executionPlans?.has(parentGraph), true);
    assert.equal(runtimeCache.graphBoundaries?.has(childGraph), true);
  });

  void it('does not reuse referenced-project graph boundaries across runs when referenced projects reload', async () => {
    const referencedProjectId = 'referenced-project' as ProjectId;
    const referencedGraphId = 'referenced-boundary-graph' as GraphId;
    const referencedProbeNode = makeProbeNode('referenced-probe', {
      value: { type: 'string', value: 'referenced value' },
    });
    const referencedOutputNode = makeGraphOutputNode('oldResult');
    const referencedGraph = makeGraph(
      [referencedProbeNode, referencedOutputNode],
      [connect(referencedProbeNode.id, referencedOutputNode.id, 'value')],
      referencedGraphId,
    );
    const referencedProject = makeProject(referencedGraph);
    referencedProject.metadata.id = referencedProjectId;

    const aliasNode: ChartNode = {
      id: 'referenced-alias' as NodeId,
      type: 'referencedGraphAlias',
      title: 'Referenced Graph Alias',
      data: {
        graphId: referencedGraphId,
        inputData: {},
        projectId: referencedProjectId,
        useErrorOutput: false,
      },
      visualData: { x: 0, y: 0, width: 240 },
    };
    const parentOutputNode = makeGraphOutputNode('parentResult');
    const aliasConnection: NodeConnection = {
      outputNodeId: aliasNode.id,
      outputId: 'oldResult' as PortId,
      inputNodeId: parentOutputNode.id,
      inputId: 'value' as PortId,
    };
    const parentGraph = makeGraph(
      [aliasNode, parentOutputNode],
      [aliasConnection],
      'referenced-boundary-parent' as GraphId,
    );
    const project = makeProject(parentGraph);
    project.references = [{ id: referencedProjectId }];
    const runtimeCache: GraphProcessorRuntimeCache = {};
    const processor = new GraphProcessor(project, parentGraph.metadata!.id, createRegistry(), false, {
      runtimeCache,
    });
    const context = {
      ...testProcessContext(),
      projectReferenceLoader: {
        loadProject: async () => referencedProject,
      },
    };

    const firstOutputs = await processor.processGraph(context);
    assert.deepEqual(firstOutputs.parentResult, { type: 'string', value: 'referenced value' });
    assert.equal(runtimeCache.graphBoundaries?.has(referencedGraph), true);

    referencedOutputNode.data.id = 'newResult';
    aliasConnection.outputId = 'newResult' as PortId;

    const secondOutputs = await processor.processGraph(context);

    assert.deepEqual(secondOutputs.parentResult, { type: 'string', value: 'referenced value' });
    assert.equal(runtimeCache.graphBoundaries?.has(referencedGraph), true);
  });

  void it('allows a race winner to finish the graph while the losing branch is aborted', async () => {
    const slowNode = makeProbeNode('slow-node', {
      delayMs: 50,
      value: { type: 'string', value: 'slow' },
    });
    const fastNode = makeProbeNode('fast-node', {
      value: { type: 'string', value: 'fast' },
    });
    const raceNode: ChartNode = {
      id: 'race-node' as NodeId,
      type: 'raceInputs',
      title: 'Race Inputs',
      data: {},
      visualData: { x: 250, y: 0, width: 240 },
    };
    const graph = makeGraph(
      [slowNode, fastNode, raceNode],
      [connect('slow-node', raceNode.id, 'input1'), connect('fast-node', raceNode.id, 'input2')],
    );
    const processor = createProcessor(graph);
    let raceFinish: ProcessEvents['nodeFinish'] | undefined;
    const nodeErrors: NodeId[] = [];
    const slowNodeErrored = processor.once('nodeError');

    processor.on('nodeFinish', (event) => {
      if (event.node.id === raceNode.id) {
        raceFinish = event;
      }
    });
    processor.on('nodeError', ({ node }) => nodeErrors.push(node.id));

    await withTimeout(processor.processGraph(testProcessContext()), 'race graph run');
    await withTimeout(slowNodeErrored, 'race loser nodeError');

    assert.deepEqual(raceFinish?.outputs.result, { type: 'string', value: 'fast' });
    assert.equal(nodeErrors.includes(slowNode.id), true);
  });

  void it('does not abort active non-race nodes whose ids share a race loser prefix', async () => {
    const slowNode = makeProbeNode('slow-node', {
      delayMs: 50,
      value: { type: 'string', value: 'slow' },
    });
    const unrelatedNode = makeProbeNode('slow-node-extra', {
      delayMs: 75,
      value: { type: 'string', value: 'unrelated' },
    });
    const fastNode = makeProbeNode('fast-node', {
      value: { type: 'string', value: 'fast' },
    });
    const raceNode: ChartNode = {
      id: 'race-node' as NodeId,
      type: 'raceInputs',
      title: 'Race Inputs',
      data: {},
      visualData: { x: 250, y: 0, width: 240 },
    };
    const graph = makeGraph(
      [slowNode, unrelatedNode, fastNode, raceNode],
      [connect('slow-node', raceNode.id, 'input1'), connect('fast-node', raceNode.id, 'input2')],
    );
    const processor = createProcessor(graph);
    const nodeErrors: NodeId[] = [];
    const nodeFinishes: NodeId[] = [];

    processor.on('nodeError', ({ node }) => nodeErrors.push(node.id));
    processor.on('nodeFinish', ({ node }) => nodeFinishes.push(node.id));

    await withTimeout(processor.processGraph(testProcessContext()), 'race graph run with prefix node');

    assert.equal(nodeErrors.includes(slowNode.id), true);
    assert.equal(nodeErrors.includes(unrelatedNode.id), false);
    assert.equal(nodeFinishes.includes(unrelatedNode.id), true);
  });
});
