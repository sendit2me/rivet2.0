import { max, range, sum, uniqBy } from 'lodash-es';
import {
  type DataValue,
  type ArrayDataValue,
  type AnyDataValue,
  type StringArrayDataValue,
  type ControlFlowExcludedDataValue,
  isArrayDataValue,
  arrayizeDataValue,
  type ScalarOrArrayDataValue,
  getScalarTypeOf,
} from './DataValue.js';
import {
  IF_PORT,
  type ChartNode,
  type NodeConnection,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
} from './NodeBase.js';
import type { GraphId, NodeGraph } from './NodeGraph.js';
import type { NodeImpl } from './NodeImpl.js';
import PQueueImport from 'p-queue';
import { getError } from '../utils/errors.js';
import Emittery from 'emittery';
import { entries, fromEntries, values } from '../utils/typeSafety.js';
import { isNotNull } from '../utils/genericUtilFunctions.js';
import { type ProjectId, type Project, type ProjectReference } from './Project.js';
import { nanoid } from 'nanoid/non-secure';
import type { InternalProcessContext, ProcessContext, ProcessId } from './ProcessContext.js';
import type { ExecutionRecorder } from '../recording/ExecutionRecorder.js';
import type { Tagged } from 'type-fest';
import { coerceTypeOptional } from '../utils/coerceType.js';
import type { BuiltInNodeType, BuiltInNodes } from './Nodes.js';
import type { NodeRegistration } from './NodeRegistration.js';
import { getPluginConfig } from '../utils/index.js';
import { preprocessGraphState } from './GraphPreprocessor.js';
import { replayExecutionRecording } from './RecordingPlayer.js';
import { buildNodeProcessContext } from './ProcessContextBuilder.js';

// eslint-disable-next-line import/no-cycle -- There has to be a cycle because CodeRunner needs to import the entirety of Rivet
import { IsomorphicCodeRunner } from '../integrations/CodeRunner.js';

// CJS compatibility, gets default.default for whatever reason
let PQueue = PQueueImport;
if (typeof PQueue !== 'function') {
  PQueue = (PQueueImport as unknown as { default: typeof PQueueImport }).default;
}

export type ProcessEvents = {
  /** Called when processing has started. */
  start: { project: Project; startGraph: NodeGraph; inputs: GraphInputs; contextValues: Record<string, DataValue> };

  /** Called when a graph or subgraph has started. */
  graphStart: { graph: NodeGraph; inputs: GraphInputs };

  /** Called when a graph or subgraph has errored. */
  graphError: { graph: NodeGraph; error: Error | string };

  /** Called when a graph or a subgraph has finished. */
  graphFinish: { graph: NodeGraph; outputs: GraphOutputs };

  /** Called when a graph has been aborted. */
  graphAbort: { successful: boolean; graph: NodeGraph; error?: Error | string };

  /** Called when a node has started processing, with the input values for the node. */
  nodeStart: { node: ChartNode; inputs: Inputs; processId: ProcessId };

  /** Called when a node has finished processing, with the output values for the node. */
  nodeFinish: { node: ChartNode; outputs: Outputs; processId: ProcessId };

  /** Called when a node has errored during processing. */
  nodeError: { node: ChartNode; error: Error | string; processId: ProcessId };

  /** Called when a node has been excluded from processing. */
  nodeExcluded: { node: ChartNode; processId: ProcessId; inputs: Inputs; outputs: Outputs; reason: string };

  /** Called when a user input node requires user input. Call the callback when finished, or call userInput() on the GraphProcessor with the results. */
  userInput: {
    node: ChartNode;
    inputStrings: string[];

    /** @deprecated use inputStrings instead */
    inputs: Inputs;

    callback: (values: StringArrayDataValue) => void;
    processId: ProcessId;

    renderingType: 'text' | 'markdown';
  };

  /** Called when a node has partially processed, with the current partial output values for the node. */
  partialOutput: { node: ChartNode; outputs: Outputs; index: number; processId: ProcessId };

  /** Called when the outputs of a node have been cleared entirely. If processId is present, only the one process() should be cleared. */
  nodeOutputsCleared: { node: ChartNode; processId?: ProcessId };

  /** Called when the root graph has errored. The root graph will also throw. */
  error: { error: Error | string };

  /** Called when processing has completed. */
  done: { results: GraphOutputs };

  /** Called when processing has been aborted. */
  abort: { successful: boolean; error?: string | Error };

  /** Called when processing has finished either successfully or unsuccessfully. */
  finish: void;

  /** Called for trace level logs. */
  trace: string;

  /** Called when the graph has been paused. */
  pause: void;

  /** Called when the graph has been resumed. */
  resume: void;

  /** Called when a global variable has been set in a graph. */
  globalSet: { id: string; value: ScalarOrArrayDataValue; processId: ProcessId };

  /** Called when an AbortController has been created. Used by node to increase the max event listeners. */
  newAbortController: AbortController;
} & {
  /** Listen for any user event. */
  [key: `userEvent:${string}`]: DataValue | undefined;
} & {
  [key: `globalSet:${string}`]: ScalarOrArrayDataValue | undefined;
};

export type ProcessEvent = {
  [P in keyof ProcessEvents]: { type: P } & ProcessEvents[P];
}[keyof ProcessEvents];

export type GraphOutputs = Record<string, DataValue>;
export type GraphInputs = Record<string, DataValue>;

export type NodeResults = Map<NodeId, Outputs>;
export type Inputs = Record<PortId, DataValue | undefined>;
export type Outputs = Record<PortId, DataValue | undefined>;

export type ExternalFunctionProcessContext = Omit<InternalProcessContext, 'setGlobal'>;

export type ExternalFunction = (
  context: ExternalFunctionProcessContext,
  ...args: unknown[]
) => Promise<DataValue & { cost?: number }>;

export type RaceId = Tagged<string, 'RaceId'>;

export type LoopInfo = AttachedNodeDataItem & {
  /** ID of the controller of the loop */
  loopControllerId: NodeId;

  /** Nodes add themselves to this as the loop processes */
  nodes: Set<NodeId>;

  iterationCount: number;
};

export type AttachedNodeDataItem = {
  propagate: boolean | ((parent: ChartNode, connections: NodeConnection[]) => boolean);
};

export type AttachedNodeData = {
  loopInfo?: LoopInfo;
  races?: {
    propagate: boolean;
    raceIds: RaceId[];

    // The race is completed by some branch
    completed: boolean;
  };

  [key: string]: AttachedNodeDataItem | undefined;
};

export class GraphProcessor {
  // Per-instance state
  readonly #graph: NodeGraph;
  readonly #project: Project;
  readonly #nodesById: Record<NodeId, ChartNode>;
  readonly #nodeInstances: Record<NodeId, NodeImpl<ChartNode>>;
  readonly #connections: Record<NodeId, NodeConnection[]>;
  readonly #emitter: Emittery<ProcessEvents> = new Emittery();
  #running = false;
  #isSubProcessor = false;
  #externalFunctions: Record<string, ExternalFunction> = {};
  slowMode = false;
  #isPaused = false;
  #parent: GraphProcessor | undefined;
  readonly #registry: NodeRegistration<any, any>;
  id = nanoid();

  readonly #includeTrace?: boolean = true;

  executor?: 'nodejs' | 'browser';

  /** If set, specifies the node(s) that the graph will run TO, instead of the nodes without any dependents. */
  runToNodeIds?: NodeId[];

  /** If set, specifies the node that the graph will run FROM, instead of the start nodes. Requires preloading data. */
  runFromNodeId?: NodeId;

  /** The node that is executing this graph, almost always a subgraph node. Undefined for root. */
  #executor:
    | {
        nodeId: NodeId;
        index: number;
        processId: ProcessId;
      }
    | undefined;

  /** The interval between nodeFinish events when playing back a recording. I.e. how fast the playback is. */
  recordingPlaybackChatLatency = 1000;

  warnOnInvalidGraph = false;

  // Per-process state
  #erroredNodes: Map<NodeId, Error | string> = undefined!; // Values are strings in recordings
  #remainingNodes: Set<NodeId> = undefined!;
  #visitedNodes: Set<NodeId> = undefined!;
  #currentlyProcessing: Set<NodeId> = undefined!;
  #context: ProcessContext = undefined!;
  #nodeResults: NodeResults = undefined!;
  #abortController: AbortController = undefined!;
  #processingQueue: PQueueImport = undefined!;
  #graphInputs: GraphInputs = undefined!;
  #graphOutputs: GraphOutputs = undefined!;
  #executionCache: Map<string, unknown> = undefined!;
  #queuedNodes: Set<NodeId> = undefined!;
  #loopControllersSeen: Set<NodeId> = undefined!;
  #subprocessors: Set<GraphProcessor> = undefined!;
  #contextValues: Record<string, DataValue> = undefined!;
  #globals: Map<string, ScalarOrArrayDataValue> = undefined!;
  #attachedNodeData: Map<NodeId, AttachedNodeData> = undefined!;
  #aborted = false;
  #abortSuccessfully = false;
  #abortError: Error | string | undefined = undefined;
  #totalCost: number = 0;
  #ignoreNodes: Set<NodeId> = undefined!;
  #hasPreloadedData = false;
  #loadedProjects: Record<ProjectId, Project> = undefined!;
  #definitions: Record<NodeId, { inputs: NodeInputDefinition[]; outputs: NodeOutputDefinition[] }> = undefined!;
  #scc: ChartNode[][] = undefined!;

  // @ts-expect-error
  #nodesNotInCycle: ChartNode[] = undefined!;

  #nodeAbortControllers = new Map<`${NodeId}-${ProcessId}`, AbortController>();

  #graphInputNodeValues: Record<string, DataValue> = {};

  /** User input nodes that are pending user input. */
  #pendingUserInputs: Record<
    NodeId,
    { resolve: (values: StringArrayDataValue) => void; reject: (error: unknown) => void }
  > = undefined!;

  get isRunning() {
    return this.#running;
  }

  constructor(project: Project, graphId: GraphId | undefined, registry: NodeRegistration<any, any>, includeTrace?: boolean) {
    this.#project = project;
    const graph = graphId
      ? project.graphs[graphId]
      : project.metadata.mainGraphId
        ? project.graphs[project.metadata.mainGraphId]
        : undefined;

    if (!graph) {
      throw new Error(`Graph ${graphId} not found in project`);
    }
    this.#graph = graph;

    this.#includeTrace = includeTrace;
    this.#nodeInstances = {};
    this.#connections = {};
    this.#nodesById = {};
    this.#registry = registry;

    this.#emitter.bindMethods(this as unknown as Record<string, unknown>, ['on', 'off', 'once', 'onAny', 'offAny']);

    this.setExternalFunction('echo', async (value) => ({ type: 'any', value }) satisfies DataValue);

    this.#emitter.on('globalSet', ({ id, value }) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit(`globalSet:${id}`, value);
    });
  }

  #preprocessGraph() {
    const preprocessedGraph = preprocessGraphState({
      graph: this.#graph,
      loadedProjects: this.#loadedProjects,
      project: this.#project,
      registry: this.#registry,
      warnOnInvalidGraph: this.warnOnInvalidGraph,
    });

    Object.assign(this.#nodeInstances, preprocessedGraph.nodeInstances);
    Object.assign(this.#nodesById, preprocessedGraph.nodesById);
    Object.assign(this.#connections, preprocessedGraph.connections);
    this.#definitions = preprocessedGraph.definitions;
    this.#scc = preprocessedGraph.stronglyConnectedComponents;
    this.#nodesNotInCycle = preprocessedGraph.nodesNotInCycle;
  }

  #emitTraceEvent(eventData: string) {
    if (this.#includeTrace) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('trace', eventData);
    }
  }

  on = undefined! as Emittery<ProcessEvents>['on'];
  off = undefined! as Emittery<ProcessEvents>['off'];
  once = undefined! as Emittery<ProcessEvents>['once'];
  onAny = undefined! as Emittery<ProcessEvents>['onAny'];
  offAny = undefined! as Emittery<ProcessEvents>['offAny'];

  readonly #onUserEventHandlers: Map<
    (event: DataValue | undefined) => void,
    (event: keyof ProcessEvents, value: unknown) => void
  > = new Map();

  onUserEvent(onEvent: string, listener: (event: DataValue | undefined) => void): void {
    const handler = (event: string, value: unknown) => {
      if (event === `userEvent:${onEvent}`) {
        listener(value as DataValue | undefined);
      }
    };

    this.#onUserEventHandlers.set(listener, handler);
    this.#emitter.onAny(handler);
  }

  offUserEvent(listener: (data: DataValue | undefined) => void): void {
    const internalHandler = this.#onUserEventHandlers.get(listener);
    if (internalHandler) {
      this.#emitter.offAny(internalHandler);
    }
  }

  userInput(nodeId: NodeId, values: StringArrayDataValue): void {
    const pending = this.#pendingUserInputs[nodeId];
    if (pending) {
      pending.resolve(values as StringArrayDataValue);
      delete this.#pendingUserInputs[nodeId];
    }

    for (const processor of this.#subprocessors) {
      processor.userInput(nodeId, values);
    }
  }

  setExternalFunction(name: string, fn: ExternalFunction): void {
    this.#externalFunctions[name] = fn;
  }

  async abort(successful: boolean = false, error?: Error | string): Promise<void> {
    if (!this.#running || this.#aborted) {
      return Promise.resolve();
    }

    this.#abortController.abort();
    this.#abortSuccessfully = successful;
    this.#abortError = error;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit('graphAbort', { successful, error, graph: this.#graph });

    if (!this.#isSubProcessor) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('abort', { successful, error });
    }

    await this.#processingQueue.onIdle();
  }

  pause(): void {
    if (this.#isPaused === false) {
      this.#isPaused = true;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('pause', void 0);
    }
  }

  resume(): void {
    if (this.#isPaused) {
      this.#isPaused = false;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('resume', void 0);
    }
  }

  setSlowMode(slowMode: boolean): void {
    this.slowMode = slowMode;
  }

  async #waitUntilUnpaused(): Promise<void> {
    if (!this.#isPaused) {
      return;
    }

    await this.#emitter.once('resume');
  }

  async *events(): AsyncGenerator<ProcessEvent> {
    for await (const [event, data] of this.#emitter.anyEvent()) {
      yield {
        type: event,
        ...(typeof data === 'object' && data != null ? data : {}),
      } as unknown as ProcessEvent;

      if (event === 'finish') {
        break;
      }
    }
  }

  preloadNodeData(nodeId: NodeId, data: Outputs): void {
    this.#nodeResults ??= new Map();
    this.#visitedNodes ??= new Set();

    for (const value of Object.values(data)) {
      if (!value || !('type' in value) || !value.type) {
        throw new Error(`Invalid data value for node ${nodeId}, must be a DataValue`);
      }
    }

    this.#nodeResults.set(nodeId, data);
    this.#visitedNodes.add(nodeId);
    this.#hasPreloadedData = true;
  }

  /** Gets all node IDs that a given node ID depends on being complete before the given node ID can start. */
  getDependencyNodesDeep(nodeId: NodeId): NodeId[] {
    const node = this.#nodesById[nodeId];
    if (!node) {
      return [];
    }

    const connections = this.#connections[nodeId];
    if (!connections) {
      return [];
    }

    const dependencyNodes = connections
      .map((conn) => {
        if (conn.inputNodeId === nodeId) {
          return this.getDependencyNodesDeep(conn.outputNodeId);
        }
        return [];
      })
      .flat();

    return [...new Set([nodeId, ...dependencyNodes])];
  }

  async replayRecording(recorder: ExecutionRecorder): Promise<GraphOutputs> {
    this.#initProcessState();
    this.#graphOutputs = await replayExecutionRecording({
      emitter: this.#emitter,
      erroredNodes: this.#erroredNodes,
      graphInputs: this.#graphInputs,
      graphOutputs: this.#graphOutputs,
      isAborted: () => this.#aborted,
      nodeResults: this.#nodeResults,
      project: this.#project,
      recorder,
      recordingPlaybackChatLatency: this.recordingPlaybackChatLatency,
      setContextValues: (contextValues) => {
        this.#contextValues = contextValues;
      },
      setGraphInputs: (graphInputs) => {
        this.#graphInputs = graphInputs;
      },
      setGraphOutputs: (graphOutputs) => {
        this.#graphOutputs = graphOutputs;
      },
      setRunning: (running) => {
        this.#running = running;
      },
      visitedNodes: this.#visitedNodes,
      waitUntilUnpaused: () => this.#waitUntilUnpaused(),
    });

    return this.#graphOutputs;
  }

  #initProcessState() {
    this.#running = true;

    if (!this.#hasPreloadedData) {
      this.#nodeResults = new Map();
      this.#visitedNodes = new Set();
    }

    this.#erroredNodes = new Map();
    this.#currentlyProcessing = new Set();
    this.#remainingNodes = new Set(this.#graph.nodes.map((n) => n.id));
    this.#pendingUserInputs = {};
    this.#processingQueue = new PQueue({ concurrency: Infinity });
    this.#graphOutputs = {};
    this.#executionCache ??= new Map();
    this.#queuedNodes = new Set();
    this.#loopControllersSeen = new Set();
    this.#subprocessors = new Set();
    this.#attachedNodeData = new Map();
    this.#globals ??= new Map();
    this.#ignoreNodes = new Set();

    this.#abortController = this.#newAbortController();
    this.#abortController.signal.addEventListener('abort', () => {
      this.#aborted = true;
    });
    this.#aborted = false;
    this.#abortError = undefined;
    this.#abortSuccessfully = false;
    this.#nodeAbortControllers = new Map();
    this.#loadedProjects = {};
    this.#graphInputNodeValues = {};
  }

  /** Main function for running a graph. Runs a graph and returns the outputs from the output nodes of the graph. */
  async processGraph(
    /** Required and optional context available to the nodes and all subgraphs. */
    context: ProcessContext,

    /** Inputs to the main graph. You should pass all inputs required by the GraphInputNodes of the graph. */
    inputs: Record<string, DataValue> = {},

    /** Contextual data available to all graphs and subgraphs. Kind of like react context, avoids drilling down data into subgraphs. Be careful when using it. */
    contextValues: Record<string, DataValue> = {},
  ): Promise<GraphOutputs> {
    try {
      if (this.#running) {
        throw new Error('Cannot process graph while already processing');
      }

      this.#initializeGraphRun(context, inputs, contextValues);
      await this.#loadProjectReferences();
      this.#preprocessGraph();
      await this.#emitGraphStart();
      await this.#emitPreloadedNodeResults();
      await this.#waitUntilUnpaused();
      await this.#queueStartNodes(this.#getStartNodes());
      await this.#processingQueue.onIdle();
      this.#markUnqueuedNodesIgnored();
      await this.#throwIfGraphErrored();
      return await this.#finalizeGraphRun();
    } finally {
      this.#running = false;

      if (!this.#isSubProcessor) {
        await this.#emitter.emit('finish', undefined);
      }
    }
  }

  #initializeGraphRun(
    context: ProcessContext,
    inputs: Record<string, DataValue>,
    contextValues: Record<string, DataValue>,
  ): void {
    this.#initProcessState();

    this.#context = context;
    this.#graphInputs = inputs;
    this.#contextValues ??= contextValues;

    this.#context.tokenizer.on('error', (error) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('error', { error });
    });
  }

  async #emitGraphStart(): Promise<void> {
    if (!this.#isSubProcessor) {
      await this.#emitter.emit('start', {
        contextValues: this.#contextValues,
        inputs: this.#graphInputs,
        project: this.#project,
        startGraph: this.#graph,
      });
    }

    await this.#emitter.emit('graphStart', { graph: this.#graph, inputs: this.#graphInputs });
  }

  async #emitPreloadedNodeResults(): Promise<void> {
    if (!this.#hasPreloadedData) {
      return;
    }

    for (const node of this.#graph.nodes) {
      if (!this.#nodeResults.has(node.id)) {
        continue;
      }

      this.#emitTraceEvent(`Node ${node.title} has preloaded data`);

      await this.#emitter.emit('nodeStart', {
        node,
        inputs: {},
        processId: 'preload' as ProcessId,
      });

      await this.#emitter.emit('nodeFinish', {
        node,
        outputs: this.#nodeResults.get(node.id)!,
        processId: 'preload' as ProcessId,
      });
    }
  }

  #getStartNodes(): ChartNode[] {
    return this.runToNodeIds
      ? this.#graph.nodes.filter((node) => this.runToNodeIds?.includes(node.id))
      : this.#graph.nodes.filter((node) => this.#outputNodesFrom(node).nodes.length === 0);
  }

  async #queueStartNodes(startNodes: ChartNode[]): Promise<void> {
    for (const startNode of startNodes) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#processingQueue.add(async () => {
        await this.#fetchNodeDataAndProcessNode(startNode);
      });
    }
  }

  #markUnqueuedNodesIgnored(): void {
    if (!this.runToNodeIds) {
      return;
    }

    for (const node of this.#graph.nodes) {
      if (this.#queuedNodes.has(node.id) === false) {
        this.#ignoreNodes.add(node.id);
      }
    }
  }

  #getUnhandledErroredNodes(): [NodeId, Error | string][] {
    return [...this.#erroredNodes.entries()].filter(([nodeId]) => {
      const erroredNodeAttachedData = this.#getAttachedDataTo(nodeId);
      return erroredNodeAttachedData.races == null || erroredNodeAttachedData.races.completed === false;
    });
  }

  #createGraphError(erroredNodes: [NodeId, Error | string][]): Error {
    if (this.#abortError) {
      return typeof this.#abortError === 'string' ? new Error(this.#abortError) : this.#abortError;
    }

    const message = `Graph ${this.#graph.metadata!.name} (${
      this.#graph.metadata!.id
    }) failed to process due to errors in nodes:\n${erroredNodes
      .map(([nodeId]) => `- ${this.#nodesById[nodeId]!.title} (${nodeId})`)
      .join('\n')}`;

    if (erroredNodes.length === 1) {
      const [, nodeError] = erroredNodes[0]!;
      return new Error(message, { cause: nodeError });
    }

    return new AggregateError(
      erroredNodes.map(([, nodeError]) => nodeError),
      message,
    );
  }

  async #throwIfGraphErrored(): Promise<void> {
    const erroredNodes = this.#getUnhandledErroredNodes();
    if (!erroredNodes.length || this.#abortSuccessfully) {
      return;
    }

    const error = this.#createGraphError(erroredNodes);
    await this.#emitter.emit('graphError', { graph: this.#graph, error });

    if (!this.#isSubProcessor) {
      await this.#emitter.emit('error', { error });
    }

    throw error;
  }

  async #finalizeGraphRun(): Promise<GraphOutputs> {
    if (this.#graphOutputs['cost' as PortId] == null) {
      this.#graphOutputs['cost' as PortId] = {
        type: 'number',
        value: this.#totalCost,
      };
    }

    const outputValues = this.#graphOutputs;
    this.#running = false;

    await this.#emitter.emit('graphFinish', { graph: this.#graph, outputs: outputValues });

    if (!this.#isSubProcessor) {
      await this.#emitter.emit('done', { results: outputValues });
      await this.#emitter.emit('finish', undefined);
    }

    return outputValues;
  }

  async #loadProjectReferences() {
    if ((this.#project.references?.length ?? 0) > 0) {
      if (!this.#context.projectReferenceLoader) {
        throw new Error(
          'Project references are set, but no projectReferenceLoader is set in the context. Since this project uses project references, you must provide a projectReferenceLoader in the context.',
        );
      }

      const seenProjectIds = new Set<ProjectId>();

      const loadProject = async (ref: ProjectReference) => {
        if (seenProjectIds.has(ref.id)) {
          return;
        }

        seenProjectIds.add(ref.id);

        const project = await this.#context.projectReferenceLoader!.loadProject(this.#context.projectPath, ref);

        this.#loadedProjects[project.metadata!.id!] = project;

        for (const reference of project.references ?? []) {
          await loadProject(reference);
        }
      };

      for (const reference of this.#project.references!) {
        await loadProject(reference);
      }
    }
  }

  /** Returns true if any input node has errored. Optionally emits a trace event. */
  #hasErroredInputNode(node: ChartNode, inputNodes: ChartNode[], trace = false): boolean {
    for (const inputNode of inputNodes) {
      if (this.#erroredNodes.has(inputNode.id)) {
        if (trace) {
          this.#emitTraceEvent(`Node ${node.title} has errored input node ${inputNode.title}`);
        }
        return true;
      }
    }
    return false;
  }

  /** Returns true if all required inputs have connections. */
  #areRequiredInputsConnected(node: ChartNode): boolean {
    const connections = this.#connections[node.id] ?? [];
    return this.#definitions[node.id]!.inputs.every((input) => {
      const connectionToInput = connections?.find((conn) => conn.inputId === input.id && conn.inputNodeId === node.id);
      return connectionToInput || !input.required;
    });
  }

  /** Accumulates cost from a node's output. */
  #accumulateCost(output: Outputs): void {
    if (output['cost' as PortId]?.type === 'number') {
      this.#totalCost += coerceTypeOptional(output['cost' as PortId], 'number') ?? 0;
    }
  }

  async #fetchNodeDataAndProcessNode(node: ChartNode): Promise<void> {
    if (this.#currentlyProcessing.has(node.id) || this.#queuedNodes.has(node.id)) {
      return;
    }

    if (this.#nodeResults.has(node.id) || this.#erroredNodes.has(node.id)) {
      return;
    }

    const inputNodes = this.#inputNodesTo(node);

    if (this.#hasErroredInputNode(node, inputNodes)) {
      return;
    }

    if (!this.#areRequiredInputsConnected(node)) {
      return;
    }

    this.#emitTraceEvent(`Node ${node.title} has required inputs nodes: ${inputNodes.map((n) => n.title).join(', ')}`);

    const attachedData = this.#getAttachedDataTo(node);

    if (node.type === 'raceInputs' || attachedData.races) {
      for (const inputNode of inputNodes) {
        const inputNodeAttachedData = this.#getAttachedDataTo(inputNode);
        const raceIds = new Set<RaceId>([...(attachedData.races?.raceIds ?? ([] as RaceId[]))]);

        if (node.type === 'raceInputs') {
          raceIds.add(`race-${node.id}` as RaceId);
        }

        inputNodeAttachedData.races = {
          propagate: false,
          raceIds: [...raceIds],
          completed: false,
        };
      }
    }

    this.#queuedNodes.add(node.id);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#processingQueue.addAll(
      inputNodes.map((inputNode) => {
        return async () => {
          this.#emitTraceEvent(`Fetching required data for node ${inputNode.title} (${inputNode.id})`);

          await this.#fetchNodeDataAndProcessNode(inputNode);
        };
      }),
    );

    await this.#processNodeIfAllInputsAvailable(node);
  }

  /** If all inputs are present, all conditions met, processes the node. */
  async #processNodeIfAllInputsAvailable(node: ChartNode): Promise<void> {
    const builtInNode = node as BuiltInNodes;
    const inputNodes = this.#inputNodesTo(node);
    if (this.#shouldSkipNodeProcessing(node, inputNodes)) {
      return;
    }

    const inputValues = this.#getInputValuesForNode(node);
    if (this.#excludedDueToControlFlow(node, inputValues, nanoid() as ProcessId, 'loop-not-broken')) {
      this.#emitTraceEvent(`Node ${node.title} is excluded due to control flow`);
      return;
    }

    const waitingForInputNode = this.#getWaitingForInputNode(node, inputNodes, inputValues);
    if (waitingForInputNode) {
      this.#emitTraceEvent(`Node ${node.title} is waiting for input node ${waitingForInputNode}`);
      return;
    }

    const attachedData = this.#getAttachedDataTo(node);
    if (this.#beginNodeProcessing(node, attachedData) === false) {
      return;
    }

    const processId = await this.#processNode(node);

    if (this.slowMode) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    this.#emitTraceEvent(`Finished processing node ${node.title} (${node.id})`);
    this.#visitedNodes.add(node.id);
    this.#currentlyProcessing.delete(node.id);
    this.#remainingNodes.delete(node.id);

    const outputNodes = this.#outputNodesFrom(node);
    this.#handleLoopControllerPostProcess(node, attachedData);
    this.#handleCompletedRace(node);

    if (!this.#assignChildLoopInfo(node, builtInNode, attachedData, processId)) {
      return;
    }

    this.#propagateAttachedDataToOutputNodes(node, attachedData, outputNodes.connectionsToNodes);
    this.#queueOutputNodes(node, outputNodes.nodes);
  }

  #shouldSkipNodeProcessing(node: ChartNode, inputNodes: ChartNode[]): boolean {
    if (this.#ignoreNodes.has(node.id)) {
      this.#emitTraceEvent(`Node ${node.title} is ignored`);
      return true;
    }

    if (this.runToNodeIds) {
      const dependencyNodes = this.getDependencyNodesDeep(node.id);
      if (this.runToNodeIds.some((runTo) => runTo !== node.id && dependencyNodes.includes(runTo))) {
        this.#emitTraceEvent(`Node ${node.title} is excluded due to runToNodeIds`);
        return true;
      }
    }

    if (this.#currentlyProcessing.has(node.id)) {
      this.#emitTraceEvent(`Node ${node.title} is already being processed`);
      return true;
    }

    if (this.#visitedNodes.has(node.id) && node.type !== 'loopController') {
      this.#emitTraceEvent(`Node ${node.title} has already been processed`);
      return true;
    }

    if (this.#erroredNodes.has(node.id)) {
      this.#emitTraceEvent(`Node ${node.title} has already errored`);
      return true;
    }

    if (this.#hasErroredInputNode(node, inputNodes, true)) {
      return true;
    }

    if (!this.#areRequiredInputsConnected(node)) {
      this.#emitTraceEvent(`Node ${node.title} has required inputs nodes: ${inputNodes.map((n) => n.title).join(', ')}`);
      return true;
    }

    return false;
  }

  #getWaitingForInputNode(node: ChartNode, inputNodes: ChartNode[], inputValues: Inputs): false | string {
    let waitingForInputNode: false | string = false;
    const anyInputIsValid = Object.values(inputValues).some(
      (value) => value && value.type.includes('control-flow-excluded') === false,
    );

    for (const inputNode of inputNodes) {
      if (
        node.type === 'loopController' &&
        !this.#loopControllersSeen.has(node.id) &&
        this.#nodesAreInSameCycle(node.id, inputNode.id)
      ) {
        continue;
      }

      if (node.type === 'raceInputs' && this.#visitedNodes.has(inputNode.id) && anyInputIsValid) {
        waitingForInputNode = false;
        break;
      }

      if (waitingForInputNode === false && this.#visitedNodes.has(inputNode.id) === false) {
        waitingForInputNode = inputNode.title;
      }
    }

    return waitingForInputNode;
  }

  #beginNodeProcessing(node: ChartNode, attachedData: AttachedNodeData): boolean {
    this.#currentlyProcessing.add(node.id);

    if (node.type === 'loopController') {
      this.#loopControllersSeen.add(node.id);
    }

    if (attachedData.loopInfo && attachedData.loopInfo.loopControllerId !== node.id) {
      attachedData.loopInfo.nodes.add(node.id);
    }

    if (attachedData.races?.completed) {
      this.#emitTraceEvent(`Node ${node.title} is part of a race that was completed`);
      return false;
    }

    return true;
  }

  #handleLoopControllerPostProcess(node: ChartNode, attachedData: AttachedNodeData): void {
    if (node.type !== 'loopController') {
      return;
    }

    const loopControllerResults = this.#nodeResults.get(node.id)!;
    const breakValue = loopControllerResults['break' as PortId];
    const didBreak =
      // @ts-ignore
      !(breakValue?.type === 'control-flow-excluded' && breakValue?.value === 'loop-not-broken') ??
      this.#excludedDueToControlFlow(node, this.#getInputValuesForNode(node), nanoid() as ProcessId);

    if (didBreak) {
      return;
    }

    this.#emitTraceEvent(`Loop controller ${node.title} did not break, so we're looping again`);
    for (const loopNodeId of attachedData.loopInfo?.nodes ?? []) {
      const cycleNode = this.#nodesById[loopNodeId]!;
      this.#emitTraceEvent(`Clearing cycle node ${cycleNode.title} (${cycleNode.id})`);
      this.#visitedNodes.delete(cycleNode.id);
      this.#currentlyProcessing.delete(cycleNode.id);
      this.#remainingNodes.add(cycleNode.id);
      this.#nodeResults.delete(cycleNode.id);
    }
  }

  #handleCompletedRace(node: ChartNode): void {
    if (node.type !== 'raceInputs') {
      return;
    }

    const allNodesForRace = [...this.#attachedNodeData.entries()].filter(([, { races }]) =>
      races?.raceIds.includes(`race-${node.id}` as RaceId),
    );

    for (const [nodeId] of allNodesForRace) {
      for (const [key, abortController] of this.#nodeAbortControllers.entries()) {
        if (key.startsWith(nodeId)) {
          this.#emitTraceEvent(`Aborting node ${nodeId} because other race branch won`);
          abortController.abort();
        }
      }

      for (const [, nodeAttachedData] of [...this.#attachedNodeData.entries()]) {
        if (nodeAttachedData.races?.raceIds.includes(`race-${node.id}` as RaceId)) {
          nodeAttachedData.races.completed = true;
        }
      }
    }
  }

  #assignChildLoopInfo(
    node: ChartNode,
    builtInNode: BuiltInNodes,
    attachedData: AttachedNodeData,
    processId: ProcessId,
  ): boolean {
    if (builtInNode.type !== 'loopController') {
      return true;
    }

    let childLoopInfo = attachedData.loopInfo;
    if (childLoopInfo != null && childLoopInfo.loopControllerId !== builtInNode.id) {
      this.#nodeErrored(node, new Error('Nested loops are not supported'), processId);
      return false;
    }

    childLoopInfo = {
      propagate: (parent, connectionsFromParent) => {
        if (parent.type === 'loopController' && connectionsFromParent.some((c) => c.outputId === ('break' as PortId))) {
          return false;
        }
        return true;
      },
      loopControllerId: node.id,
      nodes: childLoopInfo?.nodes ?? new Set(),
      iterationCount: (childLoopInfo?.iterationCount ?? 0) + 1,
    };

    attachedData.loopInfo = childLoopInfo;
    return true;
  }

  #propagateAttachedDataToOutputNodes(
    node: ChartNode,
    attachedData: AttachedNodeData,
    outputConnections: { connections: NodeConnection[]; node: ChartNode }[],
  ): void {
    for (const { node: outputNode, connections: connectionsToOutputNode } of outputConnections) {
      const outputNodeAttachedData = this.#getAttachedDataTo(outputNode);
      const propagatedAttachedData = Object.entries(attachedData).filter(([, value]): boolean => {
        if (!value) {
          return false;
        }

        if (typeof value.propagate === 'boolean') {
          return value.propagate;
        }

        return value.propagate(node, connectionsToOutputNode);
      });

      for (const [key, value] of propagatedAttachedData) {
        outputNodeAttachedData[key] = value;
      }
    }
  }

  #queueOutputNodes(node: ChartNode, outputNodes: ChartNode[]): void {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#processingQueue.addAll(
      outputNodes.map((outputNode) => async () => {
        this.#emitTraceEvent(`Trying to run output node from ${node.title}: ${outputNode.title} (${outputNode.id})`);
        await this.#processNodeIfAllInputsAvailable(outputNode);
      }),
    );
  }

  #getAttachedDataTo(node: ChartNode | NodeId): AttachedNodeData {
    const nodeId = typeof node === 'string' ? node : node.id;
    let nodeData = this.#attachedNodeData.get(nodeId);
    if (nodeData == null) {
      nodeData = {};
      this.#attachedNodeData.set(nodeId, nodeData);
    }
    return nodeData;
  }

  async #processNode(node: ChartNode) {
    const processId = nanoid() as ProcessId;

    if (this.#abortController.signal.aborted) {
      this.#nodeErrored(node, new Error('Processing aborted'), processId);
      return processId;
    }

    const inputNodes = this.#inputNodesTo(node);
    const erroredInputNodes = inputNodes.filter((inputNode) => this.#erroredNodes.has(inputNode.id));
    if (erroredInputNodes.length > 0) {
      const error = new Error(
        `Cannot process node ${node.title} (${node.id}) because it depends on errored nodes: ${erroredInputNodes
          .map((n) => `${n.title} (${n.id})`)
          .join(', ')}`,
      );
      this.#nodeErrored(node, error, processId);
      return processId;
    }

    if (node.isSplitRun) {
      await this.#processSplitRunNode(node, processId);
    } else {
      await this.#processNormalNode(node, processId);
    }

    return processId;
  }

  async #processSplitRunNode(node: ChartNode, processId: ProcessId) {
    const inputValues = this.#getInputValuesForNode(node);

    if (this.#excludedDueToControlFlow(node, inputValues, processId)) {
      return;
    }

    const splittingAmount = Math.min(
      max(values(inputValues).map((value) => (Array.isArray(value?.value) ? value?.value.length : 1))) ?? 1,
      node.splitRunMax ?? 10,
    );

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit('nodeStart', { node, inputs: inputValues, processId });

    try {
      let results: (
        | {
            type: string;
            output: Outputs;
            error?: Error;
          }
        | {
            type: string;
            error: Error;
            output?: Outputs;
          }
      )[] = [];

      if (node.isSplitSequential) {
        for (let i = 0; i < splittingAmount; i++) {
          if (this.#aborted) {
            throw new Error('Processing aborted');
          }

          const inputs = fromEntries(
            entries(inputValues).map(([port, value]) => [
              port as PortId,
              isArrayDataValue(value) ? arrayizeDataValue(value)[i] ?? undefined : value,
            ]),
          );

          try {
            const output = await this.#processNodeWithInputData(
              node,
              inputs as Inputs,
              i,
              processId,
              (node, partialOutputs, index) => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.#emitter.emit('partialOutput', { node, outputs: partialOutputs, index, processId });
              },
            );

            this.#accumulateCost(output);
            results.push({ type: 'output', output });
          } catch (error) {
            results.push({ type: 'error', error: getError(error) });
          }
        }
      } else {
        results = await Promise.all(
          range(0, splittingAmount).map(async (i) => {
            const inputs = fromEntries(
              entries(inputValues).map(([port, value]) => [
                port as PortId,
                isArrayDataValue(value) ? arrayizeDataValue(value)[i] ?? undefined : value,
              ]),
            );

            try {
              const output = await this.#processNodeWithInputData(
                node,
                inputs as Inputs,
                i,
                processId,
                (node, partialOutputs, index) => {
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  this.#emitter.emit('partialOutput', { node, outputs: partialOutputs, index, processId });
                },
              );

              this.#accumulateCost(output);
              return { type: 'output', output };
            } catch (error) {
              return { type: 'error', error: getError(error) };
            }
          }),
        );
      }

      const errors = results.filter((r) => r.type === 'error').map((r) => r.error!);
      if (errors.length === 1) {
        const e = errors[0]!;
        throw e;
      } else if (errors.length > 0) {
        throw new AggregateError(errors);
      }

      // Combine the parallel results into the final output

      // Turn a Record<PortId, DataValue[]> into a Record<PortId, AnyArrayDataValue>
      const aggregateResults = results.reduce((acc, result) => {
        for (const [portId, value] of entries(result.output!)) {
          acc[portId as PortId] ??= { type: (value?.type + '[]') as DataValue['type'], value: [] } as DataValue;
          (acc[portId as PortId] as ArrayDataValue<AnyDataValue>).value.push(value?.value);
        }
        return acc;
      }, {} as Outputs);

      this.#nodeResults.set(node.id, aggregateResults);
      this.#visitedNodes.add(node.id);
      this.#totalCost += sum(results.map((r) => coerceTypeOptional(r.output?.['cost' as PortId], 'number') ?? 0));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('nodeFinish', { node, outputs: aggregateResults, processId });
    } catch (error) {
      this.#nodeErrored(node, error, processId);
    }
  }

  async #processNormalNode(node: ChartNode, processId: ProcessId) {
    const inputValues = this.#getInputValuesForNode(node);

    if (this.#excludedDueToControlFlow(node, inputValues, processId)) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit('nodeStart', { node, inputs: inputValues, processId });

    try {
      const outputValues = await this.#processNodeWithInputData(
        node,
        inputValues,
        0,
        processId,
        (node, partialOutputs, index) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.#emitter.emit('partialOutput', { node, outputs: partialOutputs, index, processId });
        },
      );

      this.#nodeResults.set(node.id, outputValues);
      this.#visitedNodes.add(node.id);
      this.#accumulateCost(outputValues);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('nodeFinish', { node, outputs: outputValues, processId });
    } catch (error) {
      this.#nodeErrored(node, error, processId);
    }
  }

  #nodeErrored(node: ChartNode, e: unknown, processId: ProcessId) {
    const error = getError(e);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit('nodeError', { node, error, processId });
    this.#emitTraceEvent(`Node ${node.title} (${node.id}-${processId}) errored: ${error.stack}`);
    this.#erroredNodes.set(node.id, error);
  }

  getRootProcessor(): GraphProcessor {
    let processor: GraphProcessor = this;
    while (processor.#parent) {
      processor = processor.#parent;
    }
    return processor;
  }

  /** Raise a user event on the processor, all subprocessors, and their children. */
  raiseEvent(event: string, data: DataValue) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit(`userEvent:${event}`, data);

    for (const subprocessor of this.#subprocessors) {
      subprocessor.raiseEvent(event, data);
    }
  }

  #newAbortController() {
    const controller = new AbortController();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit('newAbortController', controller);
    return controller;
  }

  async #processNodeWithInputData(
    node: ChartNode,
    inputValues: Inputs,
    index: number,
    processId: ProcessId,
    partialOutput?: (node: ChartNode, partialOutputs: Outputs, index: number) => void,
  ) {
    const instance = this.#nodeInstances[node.id]!;
    const nodeAbortController = this.#newAbortController();
    const abortListener = () => {
      nodeAbortController.abort();
    };
    this.#nodeAbortControllers.set(`${node.id}-${processId}`, nodeAbortController);
    this.#abortController.signal.addEventListener('abort', abortListener);
    const context = this.#createNodeProcessContext(
      node,
      inputValues,
      index,
      processId,
      nodeAbortController,
      partialOutput,
    );

    await this.#waitUntilUnpaused();
    const results = await instance.process(inputValues, context);
    this.#nodeAbortControllers.delete(`${node.id}-${processId}`);
    this.#abortController.signal.removeEventListener('abort', abortListener);

    if (nodeAbortController.signal.aborted) {
      throw new Error('Aborted');
    }

    return results;
  }

  #getTokenizer() {
    return this.#context.tokenizer;
  }

  #createNodeProcessContext(
    node: ChartNode,
    inputValues: Inputs,
    index: number,
    processId: ProcessId,
    nodeAbortController: AbortController,
    partialOutput?: (node: ChartNode, partialOutputs: Outputs, index: number) => void,
  ): InternalProcessContext {
    const plugin = this.#registry.getPluginFor(node.type);

    return buildNodeProcessContext({
      abortGraph: (error) => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.abort(error === undefined, error);
      },
      attachedData: this.#getAttachedDataTo(node),
      codeRunner: this.#context.codeRunner ?? new IsomorphicCodeRunner(),
      context: this.#context,
      contextValues: this.#contextValues,
      createSubProcessor: (subGraphId, options = {}) =>
        this.#createSubProcessor(node, index, processId, subGraphId, options),
      executionCache: this.#executionCache,
      executor: this.executor ?? 'nodejs',
      externalFunctions: this.#externalFunctions,
      getGlobal: (id) => this.#globals.get(id),
      getPluginConfig: (name) => getPluginConfig(plugin, this.#context.settings, name),
      graphInputNodeValues: this.#graphInputNodeValues,
      graphInputs: this.#graphInputs,
      graphOutputs: this.#graphOutputs,
      loadedProjects: this.#loadedProjects,
      node,
      nodeAbortController,
      onPartialOutputs: (partialOutputs) => {
        partialOutput?.(node, partialOutputs, index);
        this.#emitGraphPartialOutputIfNeeded(node, partialOutputs);
      },
      processId,
      project: this.#project,
      raiseEvent: (event, data) => {
        this.getRootProcessor().raiseEvent(event, data as DataValue);
      },
      requestUserInput: async (inputStrings, renderingType) =>
        this.#requestUserInput(node, inputStrings, inputValues, renderingType, processId),
      setGlobal: (id, value) => {
        this.#globals.set(id, value);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.#emitter.emit('globalSet', { id, value, processId });
      },
      tokenizer: this.#getTokenizer(),
      trace: (message) => {
        this.#emitTraceEvent(message);
      },
      waitEvent: async (event) => {
        return new Promise((resolve, reject) => {
          this.#emitter.once(`userEvent:${event}`).then(resolve).catch(reject);
          nodeAbortController.signal.addEventListener('abort', () => {
            reject(new Error('Process aborted'));
          });
        });
      },
      waitForGlobal: async (id) => {
        if (this.#globals.has(id)) {
          return this.#globals.get(id)!;
        }
        await this.getRootProcessor().#emitter.once(`globalSet:${id}`);
        return this.#globals.get(id)!;
      },
    });
  }

  #emitGraphPartialOutputIfNeeded(node: ChartNode, partialOutputs: Outputs): void {
    const { useAsGraphPartialOutput } = (node.data as { useAsGraphPartialOutput?: boolean } | undefined) ?? {};
    if (!(useAsGraphPartialOutput && this.#executor && this.#parent)) {
      return;
    }

    const executorNode = this.#parent.#nodesById[this.#executor.nodeId];
    if (!executorNode) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit('partialOutput', {
      index: this.#executor.index,
      node: executorNode,
      outputs: partialOutputs,
      processId: this.#executor.processId,
    });
  }

  #createSubProcessor(
    node: ChartNode,
    index: number,
    processId: ProcessId,
    subGraphId: GraphId | undefined,
    { signal, project }: { signal?: AbortSignal; project?: Project } = {},
  ): GraphProcessor {
    const processor = new GraphProcessor(project ?? this.#project, subGraphId, this.#registry);
    processor.executor = this.executor;
    processor.#isSubProcessor = true;
    processor.#executionCache = this.#executionCache;
    processor.#externalFunctions = this.#externalFunctions;
    processor.#contextValues = this.#contextValues;
    processor.#parent = this;
    processor.#globals = this.#globals;
    processor.#executor = {
      nodeId: node.id,
      index,
      processId,
    };

    this.#wireSubProcessorEvents(processor);
    this.#subprocessors.add(processor);

    if (signal) {
      signal.addEventListener('abort', () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        processor.abort();
      });
    }

    this.#abortController.signal.addEventListener('abort', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      processor.abort();
    });

    this.on('pause', () => processor.pause());
    this.on('resume', () => processor.resume());

    return processor;
  }

  #wireSubProcessorEvents(processor: GraphProcessor): void {
    processor.on('nodeError', (e) => this.#emitter.emit('nodeError', e));
    processor.on('nodeFinish', (e) => this.#emitter.emit('nodeFinish', e));
    processor.on('partialOutput', (e) => this.#emitter.emit('partialOutput', e));
    processor.on('nodeExcluded', (e) => this.#emitter.emit('nodeExcluded', e));
    processor.on('nodeStart', (e) => this.#emitter.emit('nodeStart', e));
    processor.on('graphAbort', (e) => this.#emitter.emit('graphAbort', e));
    processor.on('userInput', (e) => this.#emitter.emit('userInput', e));
    processor.on('graphStart', (e) => this.#emitter.emit('graphStart', e));
    processor.on('graphFinish', (e) => this.#emitter.emit('graphFinish', e));
    processor.on('globalSet', (e) => this.#emitter.emit('globalSet', e));
    processor.on('newAbortController', (e) => this.#emitter.emit('newAbortController', e));
    processor.on('pause', () => {
      if (!this.#isPaused) {
        this.pause();
      }
    });
    processor.on('resume', () => {
      if (this.#isPaused) {
        this.resume();
      }
    });

    processor.onAny((event, data) => {
      if (event.startsWith('globalSet:')) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.#emitter.emit(event, data);
      }
    });
  }

  async #requestUserInput(
    node: ChartNode,
    inputStrings: string[],
    inputValues: Inputs,
    renderingType: 'text' | 'markdown',
    processId: ProcessId,
  ): Promise<StringArrayDataValue> {
    return await new Promise<StringArrayDataValue>((resolve, reject) => {
      this.#pendingUserInputs[node.id] = {
        resolve,
        reject,
      };

      this.#abortController.signal.addEventListener('abort', () => {
        delete this.#pendingUserInputs[node.id];
        reject(new Error('Processing aborted'));
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#emitter.emit('userInput', {
        node,
        inputStrings,
        inputs: inputValues,
        renderingType,
        callback: (results) => {
          resolve(results);
          delete this.#pendingUserInputs[node.id];
        },
        processId,
      });
    });
  }

  #excludedDueToControlFlow(
    node: ChartNode,
    inputValues: Inputs,
    processId: ProcessId,
    typeOfExclusion: ControlFlowExcludedDataValue['value'] = undefined,
  ) {
    if (node.disabled) {
      this.#emitTraceEvent(`Excluding node ${node.title} because it's disabled`);

      this.#visitedNodes.add(node.id);
      this.#markAsExcluded(node, processId, inputValues, 'disabled');

      return true;
    }

    if (node.isConditional && typeOfExclusion === undefined) {
      const ifValue = coerceTypeOptional(inputValues[IF_PORT.id], 'boolean');
      if (ifValue === false) {
        this.#emitTraceEvent(`Excluding node ${node.title} because if port is false`);

        this.#visitedNodes.add(node.id);
        this.#markAsExcluded(node, processId, inputValues, 'if port is false');
        return true;
      }
    }

    const inputsWithValues = entries(inputValues);
    const controlFlowExcludedValues = inputsWithValues.filter(
      ([, value]) =>
        value &&
        getScalarTypeOf(value.type) === 'control-flow-excluded' &&
        (!typeOfExclusion || value.value === typeOfExclusion),
    );
    const inputIsExcludedValue = inputsWithValues.length > 0 && controlFlowExcludedValues.length > 0;

    const isWaitingForLoop = controlFlowExcludedValues.some((value) => value?.[1]?.value === 'loop-not-broken');

    const nodesAllowedToConsumeExcludedValue: BuiltInNodeType[] = [
      'if',
      'ifElse',
      'coalesce',
      'graphOutput',
      'raceInputs',
      'loopController',
    ];

    const allowedToConsumedExcludedValue =
      nodesAllowedToConsumeExcludedValue.includes(node.type as BuiltInNodeType) && !isWaitingForLoop;

    if (inputIsExcludedValue && !allowedToConsumedExcludedValue) {
      if (!isWaitingForLoop) {
        if (inputIsExcludedValue) {
          this.#emitTraceEvent(
            `Excluding node ${node.title} because of control flow. Input is has excluded value: ${controlFlowExcludedValues[0]?.[0]}`,
          );
        }

        this.#visitedNodes.add(node.id);
        this.#markAsExcluded(node, processId, inputValues, 'input is excluded value');
      }

      return true;
    }

    return false;
  }

  #markAsExcluded(node: ChartNode, processId: ProcessId, inputValues: Inputs, reason: string) {
    const outputs: Outputs = {};
    for (const output of this.#definitions[node.id]!.outputs) {
      outputs[output.id] = { type: 'control-flow-excluded', value: undefined };
    }

    // Prevent infinite loop, a control-flow-excluded to loop controller shouldn't set the break port, let the loop controller handle it
    if (node.type === 'loopController') {
      outputs['break' as PortId] = { type: 'control-flow-excluded', value: 'loop-not-broken' };
    }

    this.#nodeResults.set(node.id, outputs);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#emitter.emit('nodeExcluded', {
      node,
      processId,
      inputs: inputValues,
      outputs,
      reason,
    });
  }

  #getInputValuesForNode(node: ChartNode): Inputs {
    const connections = this.#connections[node.id];
    return this.#definitions[node.id]!.inputs.reduce(
      (values, input) => {
        if (!connections) {
          return values;
        }
        const connection = connections.find((conn) => conn.inputId === input.id && conn.inputNodeId === node.id);
        if (connection) {
          const outputNode = this.#nodeInstances[connection.outputNodeId]!.chartNode;
          const outputNodeOutputs = this.#nodeResults.get(outputNode.id);
          const outputResult = outputNodeOutputs?.[connection.outputId];

          values[input.id] = outputResult;
        }
        return values;
      },
      {} as Record<string, any>,
    );
  }

  /** Gets the nodes that are inputting to the given node. */
  #inputNodesTo(node: ChartNode): ChartNode[] {
    const connections = this.#connections[node.id];
    if (!connections) {
      return [];
    }

    const connectionsToNode = connections.filter((conn) => conn.inputNodeId === node.id).filter(isNotNull);

    // Filter out invalid connections
    const inputDefinitions = this.#definitions[node.id]?.inputs ?? [];
    return connectionsToNode
      .filter((connection) => {
        const connectionDefinition = inputDefinitions.find((def) => def.id === connection.inputId);
        return connectionDefinition != null;
      })
      .map((conn) => this.#nodesById[conn.outputNodeId])
      .filter(isNotNull);
  }

  /** Gets the nodes that the given node it outputting to. */
  #outputNodesFrom(node: ChartNode): {
    nodes: ChartNode[];
    connections: NodeConnection[];
    connectionsToNodes: { connections: NodeConnection[]; node: ChartNode }[];
  } {
    const connections = this.#connections[node.id];
    if (!connections) {
      return { nodes: [], connections: [], connectionsToNodes: [] };
    }

    const connectionsToNode = connections.filter((conn) => conn.outputNodeId === node.id);

    // Filter out invalid connections
    const outputDefinitions = this.#definitions[node.id]?.outputs ?? [];
    const outputConnections = connectionsToNode.filter((connection) => {
      const connectionDefinition = outputDefinitions.find((def) => def.id === connection.outputId);
      return connectionDefinition != null;
    });

    const outputNodes = uniqBy(
      outputConnections.map((conn) => this.#nodesById[conn.inputNodeId]).filter(isNotNull),
      (x) => x.id,
    );

    const connectionsToNodes: { connections: NodeConnection[]; node: ChartNode }[] = [];

    outputNodes.forEach((node) => {
      const connections = outputConnections.filter((conn) => conn.inputNodeId === node.id);
      connectionsToNodes.push({ connections, node });
    });

    return { nodes: outputNodes, connections: outputConnections, connectionsToNodes };
  }

  #nodesAreInSameCycle(a: NodeId, b: NodeId) {
    return this.#scc.find((cycle) => cycle.find((node) => node.id === a) && cycle.find((node) => node.id === b));
  }
}
