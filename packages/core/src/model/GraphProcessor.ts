import {
  type DataValue,
  type StringArrayDataValue,
  type ControlFlowExcludedDataValue,
  type ScalarOrArrayDataValue,
} from './DataValue.js';
import {
  type ChartNode,
  type NodeConnection,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
} from './NodeBase.js';
import type { GraphId, NodeGraph } from './NodeGraph.js';
import type { NodeImpl } from './NodeImpl.js';
import PQueue from '../utils/pQueueCompat.js';
import { getError } from '../utils/errors.js';
import Emittery from 'emittery';
import { type ProjectId, type Project, type ProjectReference } from './Project.js';
import { nanoid } from 'nanoid/non-secure';
import type {
  GraphExecutionMetadata,
  GraphRunId,
  InternalProcessContext,
  ProcessContext,
  ProcessId,
  RootRunId,
} from './ProcessContext.js';
import type { ExecutionRecorder } from '../recording/ExecutionRecorder.js';
import type { Tagged } from 'type-fest';
import { coerceTypeOptional } from '../utils/coerceType.js';
import type { BuiltInNodes } from './Nodes.js';
import type { NodeRegistration } from './NodeRegistration.js';
import { getPluginConfig } from '../utils/index.js';
import {
  type GraphExecutionPlan,
  type GraphPreprocessedState,
  isGraphExecutionPlan,
  preprocessGraphState,
  toReusableGraphExecutionPlan,
} from './GraphPreprocessor.js';
import { replayExecutionRecording } from './RecordingPlayer.js';
import { didLoopControllerBreak, LOOP_NOT_BROKEN_SENTINEL } from './loopControllerBreak.js';
import { buildNodeProcessContext } from './ProcessContextBuilder.js';
import { processSplitRunNode } from './SplitRunProcessor.js';
import {
  type ExecutionState,
  getInputNodesTo,
  getMissingRequiredInputs,
  getOutputNodesFrom,
  getStartNodes,
  getWaitingForInputNode,
  hasErroredInputNode,
} from './NodeExecutionPlanner.js';
import { wireSubprocessorEvents, wireSubprocessorLifecycle } from './SubprocessorBridge.js';
import { emitDetached } from '../utils/emitDetached.js';
import {
  createExcludedNodeOutputs,
  getControlFlowExclusionDecision,
  getMissingRequiredInputExclusion,
} from './NodeExclusionPolicy.js';

// eslint-disable-next-line import/no-cycle -- There has to be a cycle because CodeRunner needs to import the entirety of Rivet
import { IsomorphicCodeRunner } from '../integrations/CodeRunner.js';

type WithExecution<T extends object> = T & { execution: GraphExecutionMetadata };

export type ProcessEvents = {
  /** Called when processing has started. */
  start: WithExecution<{
    project: Project;
    startGraph: NodeGraph;
    inputs: GraphInputs;
    contextValues: Record<string, DataValue>;
  }>;

  /** Called when a graph or subgraph has started. */
  graphStart: WithExecution<{ graph: NodeGraph; inputs: GraphInputs }>;

  /** Called when a graph or subgraph has errored. */
  graphError: WithExecution<{ graph: NodeGraph; error: Error | string }>;

  /** Called when a graph or a subgraph has finished. */
  graphFinish: WithExecution<{ graph: NodeGraph; outputs: GraphOutputs }>;

  /** Called when a graph has been aborted. */
  graphAbort: WithExecution<{ successful: boolean; graph: NodeGraph; error?: Error | string }>;

  /** Called when a node has started processing, with the input values for the node. */
  nodeStart: WithExecution<{ node: ChartNode; inputs: Inputs; processId: ProcessId }>;

  /** Called when a node has finished processing, with the output values for the node. */
  nodeFinish: WithExecution<{ node: ChartNode; outputs: Outputs; processId: ProcessId }>;

  /** Called when a node has errored during processing. */
  nodeError: WithExecution<{ node: ChartNode; error: Error | string; processId: ProcessId }>;

  /** Called when a node has been excluded from processing. */
  nodeExcluded: WithExecution<{
    node: ChartNode;
    processId: ProcessId;
    inputs: Inputs;
    outputs: Outputs;
    reason: string;
  }>;

  /** Called when a user input node requires user input. Call the callback when finished, or call userInput() on the GraphProcessor with the results. */
  userInput: WithExecution<{
    node: ChartNode;
    inputStrings: string[];

    /** @deprecated use inputStrings instead */
    inputs: Inputs;

    callback: (values: StringArrayDataValue) => void;
    processId: ProcessId;

    renderingType: 'text' | 'markdown';
  }>;

  /** Called when a node has partially processed, with the current partial output values for the node. */
  partialOutput: WithExecution<{ node: ChartNode; outputs: Outputs; index: number; processId: ProcessId }>;

  /** Called when the outputs of a node have been cleared entirely. If processId is present, only the one process() should be cleared. */
  nodeOutputsCleared: WithExecution<{ node: ChartNode; processId?: ProcessId }>;

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
  globalSet: WithExecution<{ id: string; value: ScalarOrArrayDataValue; processId: ProcessId }>;

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

export type GraphProcessorConcurrency = {
  nodeConcurrency?: number;
  splitRunConcurrency?: number;
};

export type GraphProcessorRuntimeCache = {
  executionPlans?: WeakMap<NodeGraph, GraphExecutionPlan>;
  loadedProjects?: Record<ProjectId, Project>;
};

export type GraphProcessorExecutionPlanCacheMode = 'all' | 'subprocessors';

export type GraphProcessorScheduler = 'compatible' | 'fast-acyclic';

const DEFAULT_NODE_CONCURRENCY = 8;
export const DEFAULT_SPLIT_RUN_CONCURRENCY = 4;
const FAST_ACYCLIC_UNSUPPORTED_NODE_TYPES = new Set<string>([
  'loopController',
  'loopUntil',
  'raceInputs',
  'userInput',
  'waitForEvent',
]);

function normalizeConcurrencyValue(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function resolveGraphProcessorConcurrency(
  concurrency: GraphProcessorConcurrency | undefined,
): Required<GraphProcessorConcurrency> {
  return {
    nodeConcurrency: normalizeConcurrencyValue(concurrency?.nodeConcurrency, DEFAULT_NODE_CONCURRENCY),
    splitRunConcurrency: normalizeConcurrencyValue(concurrency?.splitRunConcurrency, DEFAULT_SPLIT_RUN_CONCURRENCY),
  };
}

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
  readonly #concurrency: Required<GraphProcessorConcurrency>;
  readonly #executionPlanCacheMode: GraphProcessorExecutionPlanCacheMode;
  readonly #runtimeCache: GraphProcessorRuntimeCache | undefined;
  readonly #cacheLoadedProjects: boolean;
  readonly #scheduler: GraphProcessorScheduler;
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
        parentGraphId: GraphId;
        index: number;
        processId: ProcessId;
      }
    | undefined;

  #rootRunId: RootRunId = undefined!;
  #graphRunId: GraphRunId = undefined!;
  #parentGraphRunId: GraphRunId | undefined = undefined;

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
  #processingQueue: InstanceType<typeof PQueue> = undefined!;
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
  #graphExecutionPlan: GraphExecutionPlan | undefined;

  #nodesNotInCycle: ChartNode[] = undefined!;

  #nodeAbortControllers = new Map<`${NodeId}-${ProcessId}`, AbortController>();

  #graphInputNodeValues: Record<string, DataValue> = {};

  /** User input nodes that are pending user input. */
  #pendingUserInputs: Record<
    NodeId,
    { resolve: (values: StringArrayDataValue) => void; reject: (error: unknown) => void }
  > = undefined!;
  #finishEmitted = false;
  #unsubscribeTokenizerError: (() => void) | undefined;

  get isRunning() {
    return this.#running;
  }

  constructor(
    project: Project,
    graphId: GraphId | undefined,
    registry: NodeRegistration<any, any>,
    includeTrace?: boolean,
    options?: {
      cacheLoadedProjects?: boolean;
      concurrency?: GraphProcessorConcurrency;
      executionPlanCacheMode?: GraphProcessorExecutionPlanCacheMode;
      runtimeCache?: GraphProcessorRuntimeCache;
      scheduler?: GraphProcessorScheduler;
    },
  ) {
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
    this.#concurrency = resolveGraphProcessorConcurrency(options?.concurrency);
    this.#executionPlanCacheMode = options?.executionPlanCacheMode ?? 'all';
    this.#runtimeCache = options?.runtimeCache;
    this.#cacheLoadedProjects = options?.cacheLoadedProjects ?? false;
    this.#scheduler = options?.scheduler ?? 'compatible';

    this.#emitter.bindMethods(this as unknown as Record<string, unknown>, ['on', 'off', 'once', 'onAny', 'offAny']);

    this.setExternalFunction('echo', async (value) => ({ type: 'any', value }) satisfies DataValue);

    this.#emitter.on('globalSet', ({ id, value }: ProcessEvents['globalSet']) => {
      emitDetached(this.#emitter, `globalSet:${id}`, value);
    });
  }

  #preprocessGraph() {
    const runtimeCache = this.#canUseRuntimeExecutionPlanCache() ? this.#runtimeCache : undefined;
    const shouldUseRuntimeCache = runtimeCache != null;
    const cachedPlan = runtimeCache?.executionPlans?.get(this.#graph);

    if (cachedPlan) {
      this.#applyPreprocessedGraph(cachedPlan, { recreateNodeInstances: true });
      return;
    }

    const preprocessedGraph = preprocessGraphState({
      graph: this.#graph,
      loadedProjects: this.#loadedProjects,
      project: this.#project,
      registry: this.#registry,
      warnOnInvalidGraph: this.warnOnInvalidGraph,
      buildExecutionPlan: shouldUseRuntimeCache,
    });

    if (shouldUseRuntimeCache && isGraphExecutionPlan(preprocessedGraph)) {
      runtimeCache.executionPlans ??= new WeakMap();
      runtimeCache.executionPlans.set(this.#graph, toReusableGraphExecutionPlan(preprocessedGraph));
    }

    this.#applyPreprocessedGraph(preprocessedGraph);
  }

  #canUseRuntimeExecutionPlanCache(): boolean {
    if (this.warnOnInvalidGraph || this.#runtimeCache == null) {
      return false;
    }

    if (this.#executionPlanCacheMode === 'subprocessors' && !this.#isSubProcessor) {
      return false;
    }

    if (!this.#cacheLoadedProjects && (this.#project.references?.length ?? 0) > 0) {
      return false;
    }

    return true;
  }

  #applyPreprocessedGraph(
    preprocessedGraph: GraphPreprocessedState | GraphExecutionPlan,
    options: { recreateNodeInstances?: boolean } = {},
  ): void {
    const nodeInstances =
      options.recreateNodeInstances || !('nodeInstances' in preprocessedGraph)
        ? this.#createNodeInstances(isGraphExecutionPlan(preprocessedGraph) ? preprocessedGraph.graphNodes : this.#graph.nodes)
        : preprocessedGraph.nodeInstances;

    Object.assign(this.#nodeInstances, nodeInstances);
    Object.assign(this.#nodesById, preprocessedGraph.nodesById);
    Object.assign(this.#connections, preprocessedGraph.connections);
    this.#definitions = preprocessedGraph.definitions;
    this.#scc = preprocessedGraph.stronglyConnectedComponents;
    this.#nodesNotInCycle = preprocessedGraph.nodesNotInCycle;
    this.#graphExecutionPlan = isGraphExecutionPlan(preprocessedGraph) ? preprocessedGraph : undefined;
  }

  #createNodeInstances(nodes: ChartNode[]): Record<NodeId, NodeImpl<ChartNode>> {
    return Object.fromEntries(nodes.map((node) => [node.id, this.#registry.createDynamicImpl(node)])) as Record<
      NodeId,
      NodeImpl<ChartNode>
    >;
  }

  #emitTraceEvent(eventData: string) {
    if (this.#includeTrace) {
      emitDetached(this.#emitter, 'trace', eventData);
    }
  }

  #buildExecutionMetadata(): GraphExecutionMetadata {
    return {
      rootRunId: this.#rootRunId,
      graphRunId: this.#graphRunId,
      graphId: this.#graph.metadata!.id!,
      parentGraphRunId: this.#parentGraphRunId,
      executor: this.#executor
        ? {
            nodeId: this.#executor.nodeId,
            parentGraphId: this.#executor.parentGraphId,
            processId: this.#executor.processId,
            splitIndex: this.#executor.index,
          }
        : undefined,
    };
  }

  #withExecution<T extends object>(
    data: T,
    execution: GraphExecutionMetadata = this.#buildExecutionMetadata(),
  ): T & {
    execution: GraphExecutionMetadata;
  } {
    return {
      ...data,
      execution,
    };
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

    this.#abortSuccessfully = successful;
    this.#abortError = error;
    this.#abortController.abort();

    emitDetached(this.#emitter, 'graphAbort', this.#withExecution({ successful, error, graph: this.#graph }));

    if (!this.#isSubProcessor) {
      emitDetached(this.#emitter, 'abort', { successful, error });
    }

    await this.#processingQueue.onIdle();
  }

  pause(): void {
    if (this.#isPaused === false) {
      this.#isPaused = true;
      emitDetached(this.#emitter, 'pause', void 0);
    }
  }

  resume(): void {
    if (this.#isPaused) {
      this.#isPaused = false;
      emitDetached(this.#emitter, 'resume', void 0);
    }
  }

  setSlowMode(slowMode: boolean): void {
    this.slowMode = slowMode;
  }

  async #waitUntilUnpaused(): Promise<void> {
    if (!this.#isPaused) {
      return;
    }

    if (this.#abortController.signal.aborted) {
      throw this.#getAbortError();
    }

    await new Promise<void>((resolve, reject) => {
      const abortListener = () => {
        cleanup();
        reject(this.#getAbortError());
      };

      const unsubscribeResume = this.#emitter.on('resume', () => {
        cleanup();
        resolve();
      });

      const cleanup = () => {
        this.#abortController.signal.removeEventListener('abort', abortListener);
        unsubscribeResume();
      };

      this.#abortController.signal.addEventListener('abort', abortListener, { once: true });
    });
  }

  #getAbortError(): Error {
    if (typeof this.#abortError === 'string') {
      return new Error(this.#abortError);
    }

    return this.#abortError ?? new Error('Processing aborted');
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
    this.#ensureGraphPreprocessed();

    const dependencyNodes = new Set<NodeId>();
    this.#collectDependencyNodesDeep(nodeId, dependencyNodes);

    return [...dependencyNodes];
  }

  #ensureGraphPreprocessed(): void {
    if (this.#definitions != null) {
      return;
    }

    this.#loadedProjects ??= {};
    this.#preprocessGraph();
  }

  #collectDependencyNodesDeep(nodeId: NodeId, dependencyNodes: Set<NodeId>): void {
    if (dependencyNodes.has(nodeId)) {
      return;
    }

    const node = this.#nodesById[nodeId];
    if (!node) {
      return;
    }

    dependencyNodes.add(nodeId);

    const connections = this.#graphExecutionPlan?.inputConnectionsByNode[nodeId] ?? this.#connections[nodeId] ?? [];

    for (const connection of connections) {
      if (connection.inputNodeId === nodeId) {
        this.#collectDependencyNodesDeep(connection.outputNodeId, dependencyNodes);
      }
    }
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
    this.#finishEmitted = false;

    if (!this.#hasPreloadedData) {
      this.#nodeResults = new Map();
      this.#visitedNodes = new Set();
    }

    this.#erroredNodes = new Map();
    this.#currentlyProcessing = new Set();
    this.#remainingNodes = new Set(this.#graph.nodes.map((n) => n.id));
    this.#pendingUserInputs = {};
    this.#processingQueue = new PQueue({ concurrency: this.#concurrency.nodeConcurrency });
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
    this.#loadedProjects =
      this.#cacheLoadedProjects && this.#runtimeCache?.loadedProjects ? { ...this.#runtimeCache.loadedProjects } : {};
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
    if (this.#running) {
      throw new Error('Cannot process graph while already processing');
    }

    try {
      this.#initializeGraphRun(context, inputs, contextValues);
      await this.#loadProjectReferences();
      this.#preprocessGraph();
      await this.#emitGraphStart();
      await this.#emitPreloadedNodeResults();
      await this.#waitUntilUnpaused();
      if (this.#canUseFastAcyclicScheduler()) {
        await this.#processFastAcyclicGraph();
      } else {
        await this.#queueStartNodes(getStartNodes(this.#executionState, this.#graph.nodes, this.runToNodeIds));
        await this.#processingQueue.onIdle();
        this.#markUnqueuedNodesIgnored();
      }
      await this.#throwIfGraphErrored();
      return await this.#finalizeGraphRun();
    } finally {
      this.#running = false;
      this.#cleanupTokenizerErrorListener();

      await this.#emitFinishIfNeeded();
    }
  }

  async #emitFinishIfNeeded(): Promise<void> {
    if (this.#isSubProcessor || this.#finishEmitted) {
      return;
    }

    this.#finishEmitted = true;
    await this.#emitter.emit('finish', undefined);
  }

  #initializeGraphRun(
    context: ProcessContext,
    inputs: Record<string, DataValue>,
    contextValues: Record<string, DataValue>,
  ): void {
    this.#initProcessState();

    this.#context = context;
    this.#graphInputs = inputs;
    this.#contextValues = contextValues;

    this.#rootRunId = this.#parent ? this.#parent.#rootRunId : (nanoid() as RootRunId);
    this.#graphRunId = nanoid() as GraphRunId;
    this.#parentGraphRunId = this.#parent ? this.#parent.#graphRunId : undefined;

    this.#cleanupTokenizerErrorListener();
    const unsubscribeTokenizerError = this.#context.tokenizer.on('error', (error) => {
      emitDetached(this.#emitter, 'error', { error });
    });
    this.#unsubscribeTokenizerError =
      typeof unsubscribeTokenizerError === 'function' ? unsubscribeTokenizerError : undefined;
  }

  #cleanupTokenizerErrorListener(): void {
    const unsubscribeTokenizerError = this.#unsubscribeTokenizerError;
    this.#unsubscribeTokenizerError = undefined;

    try {
      unsubscribeTokenizerError?.();
    } catch (err) {
      emitDetached(this.#emitter, 'error', { error: getError(err) });
    }
  }

  async #emitGraphStart(): Promise<void> {
    if (!this.#isSubProcessor) {
      await this.#emitter.emit(
        'start',
        this.#withExecution({
          contextValues: this.#contextValues,
          inputs: this.#graphInputs,
          project: this.#project,
          startGraph: this.#graph,
        }),
      );
    }

    await this.#emitter.emit('graphStart', this.#withExecution({ graph: this.#graph, inputs: this.#graphInputs }));
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

      await this.#emitter.emit(
        'nodeStart',
        this.#withExecution({
          node,
          inputs: {},
          processId: 'preload' as ProcessId,
        }),
      );

      await this.#emitter.emit(
        'nodeFinish',
        this.#withExecution({
          node,
          outputs: this.#nodeResults.get(node.id)!,
          processId: 'preload' as ProcessId,
        }),
      );
    }
  }

  async #queueStartNodes(startNodes: ChartNode[]): Promise<void> {
    for (const startNode of startNodes) {
      void this.#processingQueue.add(async () => {
        await this.#fetchNodeDataAndProcessNode(startNode);
      });
    }
  }

  #canUseFastAcyclicScheduler(): boolean {
    if (this.#scheduler !== 'fast-acyclic') {
      return false;
    }

    if (this.#hasPreloadedData || this.runToNodeIds || this.slowMode || this.#includeTrace) {
      return false;
    }

    if (this.#nodesNotInCycle.length !== this.#graph.nodes.length) {
      return false;
    }

    if (this.#graph.connections.some((connection) => connection.inputNodeId === connection.outputNodeId)) {
      return false;
    }

    return this.#graph.nodes.every((node) => {
      if (node.isSplitRun) {
        return false;
      }

      return !FAST_ACYCLIC_UNSUPPORTED_NODE_TYPES.has(node.type);
    });
  }

  async #processFastAcyclicGraph(): Promise<void> {
    const remainingInputsByNode = new Map<NodeId, number>();
    const readyNodes: ChartNode[] = [];
    const queuedNodeIds = new Set<NodeId>();

    for (const node of this.#graph.nodes) {
      const inputNodeIds = new Set<NodeId>();
      for (const inputNode of getInputNodesTo(this.#executionState, node)) {
        inputNodeIds.add(inputNode.id);
      }
      const inputCount = inputNodeIds.size;
      remainingInputsByNode.set(node.id, inputCount);
      if (inputCount === 0) {
        readyNodes.push(node);
        queuedNodeIds.add(node.id);
      }
    }

    await new Promise<void>((resolve, reject) => {
      let activeCount = 0;
      let settled = false;

      const queueReadyOutputs = (outputNodes: ChartNode[]) => {
        for (const outputNode of outputNodes) {
          const remainingInputs = (remainingInputsByNode.get(outputNode.id) ?? 0) - 1;
          remainingInputsByNode.set(outputNode.id, remainingInputs);

          if (remainingInputs <= 0 && !queuedNodeIds.has(outputNode.id)) {
            readyNodes.push(outputNode);
            queuedNodeIds.add(outputNode.id);
          }
        }
      };

      const settle = () => {
        if (settled) {
          return;
        }

        if (activeCount === 0 && readyNodes.length === 0) {
          settled = true;
          resolve();
        }
      };

      const pump = () => {
        if (settled) {
          return;
        }

        while (activeCount < this.#concurrency.nodeConcurrency && readyNodes.length > 0) {
          const node = readyNodes.shift()!;
          activeCount += 1;

          void this.#processNodeIfAllInputsAvailable(node, { queueOutputNodes: false })
            .then(queueReadyOutputs)
            .then(() => {
              activeCount -= 1;
              pump();
              settle();
            })
            .catch((error) => {
              if (!settled) {
                settled = true;
                reject(error);
              }
            });
        }

        settle();
      };

      pump();
    });
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
      return this.#getAbortError();
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
    await this.#emitter.emit('graphError', this.#withExecution({ graph: this.#graph, error }));

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

    await this.#emitter.emit('graphFinish', this.#withExecution({ graph: this.#graph, outputs: outputValues }));

    if (!this.#isSubProcessor) {
      await this.#emitter.emit('done', { results: outputValues });
      await this.#emitFinishIfNeeded();
    }

    return outputValues;
  }

  async #loadProjectReferences() {
    if ((this.#project.references?.length ?? 0) > 0) {
      if (this.#cacheLoadedProjects && this.#runtimeCache?.loadedProjects) {
        this.#loadedProjects = { ...this.#runtimeCache.loadedProjects };
        return;
      }

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

      if (this.#cacheLoadedProjects && this.#runtimeCache) {
        this.#runtimeCache.loadedProjects = { ...this.#loadedProjects };
      }
    }
  }

  /** Returns true if any input node has errored. Optionally emits a trace event. */
  #hasErroredInputNode(node: ChartNode, inputNodes: ChartNode[], trace = false): boolean {
    return hasErroredInputNode(
      this.#executionState,
      node,
      inputNodes,
      trace ? (message) => this.#emitTraceEvent(message) : undefined,
    );
  }

  /** Returns required inputs without connections. */
  #getMissingRequiredInputs(node: ChartNode): NodeInputDefinition[] {
    return getMissingRequiredInputs(this.#executionState, node);
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

    const inputNodes = getInputNodesTo(this.#executionState, node);

    if (this.#hasErroredInputNode(node, inputNodes)) {
      return;
    }

    this.#emitTraceEvent(`Node ${node.title} has input nodes: ${inputNodes.map((n) => n.title).join(', ')}`);

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

    void this.#processingQueue.addAll(
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
  async #processNodeIfAllInputsAvailable(
    node: ChartNode,
    options: { queueOutputNodes?: boolean } = {},
  ): Promise<ChartNode[]> {
    const { queueOutputNodes = true } = options;
    const builtInNode = node as BuiltInNodes;
    const inputNodes = getInputNodesTo(this.#executionState, node);
    if (this.#shouldSkipNodeProcessing(node, inputNodes)) {
      return [];
    }

    const attachedData = this.#getAttachedDataTo(node);
    if (this.#shouldSkipCompletedRaceNode(node, attachedData)) {
      return [];
    }

    const inputValues = this.#getInputValuesForNode(node);
    const loopExclusion = this.#excludedDueToControlFlow(
      node,
      inputValues,
      nanoid() as ProcessId,
      LOOP_NOT_BROKEN_SENTINEL,
      { queueOutputNodes },
    );
    if (loopExclusion) {
      this.#emitTraceEvent(`Node ${node.title} is excluded due to control flow`);
      return loopExclusion === true ? [] : loopExclusion;
    }

    const waitingForInputNode = getWaitingForInputNode(this.#executionState, node, inputNodes, inputValues);
    if (waitingForInputNode) {
      this.#emitTraceEvent(`Node ${node.title} is waiting for input node ${waitingForInputNode}`);
      return [];
    }

    const exclusion = this.#excludedDueToControlFlow(node, inputValues, nanoid() as ProcessId, undefined, {
      queueOutputNodes,
    });
    if (exclusion) {
      this.#emitTraceEvent(`Node ${node.title} is excluded due to control flow`);
      return exclusion === true ? [] : exclusion;
    }

    const missingRequiredInputs = this.#getMissingRequiredInputs(node);
    if (missingRequiredInputs.length > 0) {
      return this.#excludeNodeWithMissingRequiredInputs(node, inputValues, missingRequiredInputs, { queueOutputNodes });
    }

    if (this.#beginNodeProcessing(node, attachedData) === false) {
      return [];
    }

    const processId = await this.#processNode(node);

    if (this.slowMode) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    this.#emitTraceEvent(`Finished processing node ${node.title} (${node.id})`);
    this.#visitedNodes.add(node.id);
    this.#currentlyProcessing.delete(node.id);
    this.#remainingNodes.delete(node.id);

    const outputNodes = getOutputNodesFrom(this.#executionState, node);
    this.#handleLoopControllerPostProcess(node, attachedData);
    this.#handleCompletedRace(node);

    if (!this.#assignChildLoopInfo(node, builtInNode, attachedData, processId)) {
      return [];
    }

    this.#propagateAttachedDataToOutputNodes(node, attachedData, outputNodes.connectionsToNodes);
    if (queueOutputNodes) {
      this.#queueOutputNodes(node, outputNodes.nodes);
    }

    return outputNodes.nodes;
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

    return false;
  }

  #excludeNodeWithMissingRequiredInputs(
    node: ChartNode,
    inputValues: Inputs,
    missingRequiredInputs: NodeInputDefinition[],
    options: { queueOutputNodes?: boolean } = {},
  ): ChartNode[] {
    const exclusion = getMissingRequiredInputExclusion(node, missingRequiredInputs);
    const processId = nanoid() as ProcessId;

    this.#emitTraceEvent(exclusion.traceMessage);
    return this.#excludeNode(node, processId, inputValues, exclusion.reason, options);
  }

  #beginNodeProcessing(node: ChartNode, attachedData: AttachedNodeData): boolean {
    if (this.#shouldSkipCompletedRaceNode(node, attachedData)) {
      return false;
    }

    this.#currentlyProcessing.add(node.id);

    if (node.type === 'loopController') {
      this.#loopControllersSeen.add(node.id);
    }

    this.#registerNodeInActiveLoop(node, attachedData);

    return true;
  }

  #shouldSkipCompletedRaceNode(node: ChartNode, attachedData: AttachedNodeData): boolean {
    if (attachedData.races?.completed) {
      this.#emitTraceEvent(`Node ${node.title} is part of a race that was completed`);
      return true;
    }

    return false;
  }

  #registerNodeInActiveLoop(node: ChartNode, attachedData: AttachedNodeData): void {
    if (attachedData.loopInfo && attachedData.loopInfo.loopControllerId !== node.id) {
      attachedData.loopInfo.nodes.add(node.id);
    }
  }

  #handleLoopControllerPostProcess(node: ChartNode, attachedData: AttachedNodeData): void {
    if (node.type !== 'loopController') {
      return;
    }

    const loopControllerResults = this.#nodeResults.get(node.id)!;
    const breakValue = loopControllerResults['break' as PortId];
    const didBreak = didLoopControllerBreak(breakValue);

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
    void this.#processingQueue.addAll(
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

    const inputNodes = getInputNodesTo(this.#executionState, node);
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
    return processSplitRunNode(node, processId, {
      getInputValues: (n) => this.#getInputValuesForNode(n),
      isExcludedDueToControlFlow: (n, inputs, pid) => this.#excludedDueToControlFlow(n, inputs, pid) !== false,
      processNodeWithInputData: (n, inputs, idx, pid, partial) =>
        this.#processNodeWithInputData(n, inputs, idx, pid, partial),
      splitRunConcurrency: this.#concurrency.splitRunConcurrency,
      accumulateCost: (output) => this.#accumulateCost(output),
      setNodeResults: (nodeId, outputs) => this.#nodeResults.set(nodeId, outputs),
      markNodeVisited: (nodeId) => this.#visitedNodes.add(nodeId),
      nodeErrored: (n, err, pid) => this.#nodeErrored(n, err, pid),
      isAborted: () => this.#aborted,
      emit: (event, data) => {
        emitDetached(this.#emitter, event, this.#withExecution(data));
      },
    });
  }

  async #processNormalNode(node: ChartNode, processId: ProcessId) {
    const inputValues = this.#getInputValuesForNode(node);

    if (this.#excludedDueToControlFlow(node, inputValues, processId)) {
      return;
    }

    // Use awaited emit (not emitDetached) so that listeners can yield to the
    // macrotask queue, giving the browser a chance to repaint during execution.
    await this.#emitter.emit('nodeStart', this.#withExecution({ node, inputs: inputValues, processId }));

    try {
      const outputValues = await this.#processNodeWithInputData(
        node,
        inputValues,
        0,
        processId,
        (node, partialOutputs, index) => {
          emitDetached(
            this.#emitter,
            'partialOutput',
            this.#withExecution({ node, outputs: partialOutputs, index, processId }),
          );
        },
      );

      this.#nodeResults.set(node.id, outputValues);
      this.#visitedNodes.add(node.id);
      this.#accumulateCost(outputValues);
      await this.#emitter.emit('nodeFinish', this.#withExecution({ node, outputs: outputValues, processId }));
    } catch (error) {
      this.#nodeErrored(node, error, processId);
    }
  }

  #nodeErrored(node: ChartNode, e: unknown, processId: ProcessId) {
    const error = getError(e);
    emitDetached(this.#emitter, 'nodeError', this.#withExecution({ node, error, processId }));
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
    emitDetached(this.#emitter, `userEvent:${event}`, data);

    for (const subprocessor of this.#subprocessors) {
      subprocessor.raiseEvent(event, data);
    }
  }

  #newAbortController() {
    const controller = new AbortController();
    emitDetached(this.#emitter, 'newAbortController', controller);
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
    let results: Outputs;
    try {
      results = await instance.process(inputValues, context);
    } finally {
      this.#nodeAbortControllers.delete(`${node.id}-${processId}`);
      this.#abortController.signal.removeEventListener('abort', abortListener);
    }

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
        void this.abort(error === undefined, error);
      },
      attachedData: this.#getAttachedDataTo(node),
      codeRunner: this.#context.codeRunner ?? new IsomorphicCodeRunner(),
      context: this.#context,
      contextValues: this.#contextValues,
      createSubProcessor: (subGraphId, options = {}) =>
        this.#createSubProcessor(node, index, processId, subGraphId, options),
      execution: this.#buildExecutionMetadata(),
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
        emitDetached(this.#emitter, 'globalSet', this.#withExecution({ id, value, processId }));
      },
      tokenizer: this.#getTokenizer(),
      trace: (message) => {
        this.#emitTraceEvent(message);
      },
      waitEvent: async (event) => {
        return new Promise((resolve, reject) => {
          const abortListener = () => {
            reject(new Error('Process aborted'));
          };

          this.#emitter
            .once(`userEvent:${event}`)
            .then(resolve)
            .catch(reject)
            .finally(() => {
              nodeAbortController.signal.removeEventListener('abort', abortListener);
            });
          nodeAbortController.signal.addEventListener('abort', abortListener, { once: true });
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

    const parentExecution = this.#parent.#buildExecutionMetadata();

    emitDetached(this.#emitter, 'partialOutput', {
      index: this.#executor.index,
      node: executorNode,
      outputs: partialOutputs,
      processId: this.#executor.processId,
      execution: parentExecution,
    });
  }

  #createSubProcessor(
    node: ChartNode,
    index: number,
    processId: ProcessId,
    subGraphId: GraphId | undefined,
    { signal, project }: { signal?: AbortSignal; project?: Project } = {},
  ): GraphProcessor {
    const processor = new GraphProcessor(project ?? this.#project, subGraphId, this.#registry, this.#includeTrace, {
      cacheLoadedProjects: this.#cacheLoadedProjects,
      concurrency: this.#concurrency,
      executionPlanCacheMode: this.#executionPlanCacheMode,
      runtimeCache: this.#runtimeCache,
      scheduler: this.#scheduler,
    });
    processor.executor = this.executor;
    processor.#isSubProcessor = true;
    processor.#executionCache = this.#executionCache;
    processor.#externalFunctions = this.#externalFunctions;
    processor.#contextValues = this.#contextValues;
    processor.#parent = this;
    processor.#globals = this.#globals;
    processor.#executor = {
      nodeId: node.id,
      parentGraphId: this.#graph.metadata!.id!,
      index,
      processId,
    };

    wireSubprocessorEvents(processor, this.#emitter, {
      isPaused: () => this.#isPaused,
      pause: () => {
        void this.pause();
      },
      resume: () => {
        void this.resume();
      },
    });
    this.#subprocessors.add(processor);
    wireSubprocessorLifecycle(processor, {
      signal,
      parentAbortSignal: this.#abortController.signal,
      onParentPause: (listener) => {
        this.on('pause', listener);
        return () => {
          this.off('pause', listener);
        };
      },
      onParentResume: (listener) => {
        this.on('resume', listener);
        return () => {
          this.off('resume', listener);
        };
      },
    });

    return processor;
  }

  async #requestUserInput(
    node: ChartNode,
    inputStrings: string[],
    inputValues: Inputs,
    renderingType: 'text' | 'markdown',
    processId: ProcessId,
  ): Promise<StringArrayDataValue> {
    return await new Promise<StringArrayDataValue>((resolve, reject) => {
      const abortListener = () => {
        delete this.#pendingUserInputs[node.id];
        reject(new Error('Processing aborted'));
      };

      this.#pendingUserInputs[node.id] = {
        resolve,
        reject,
      };

      this.#abortController.signal.addEventListener('abort', abortListener, { once: true });

      emitDetached(
        this.#emitter,
        'userInput',
        this.#withExecution({
          node,
          inputStrings,
          inputs: inputValues,
          renderingType,
          callback: (results: StringArrayDataValue) => {
            this.#abortController.signal.removeEventListener('abort', abortListener);
            resolve(results);
            delete this.#pendingUserInputs[node.id];
          },
          processId,
        }),
      );
    });
  }

  #excludedDueToControlFlow(
    node: ChartNode,
    inputValues: Inputs,
    processId: ProcessId,
    typeOfExclusion?: ControlFlowExcludedDataValue['value'],
    options: { queueOutputNodes?: boolean } = {},
  ): false | true | ChartNode[] {
    const exclusion = getControlFlowExclusionDecision({ node, inputValues, typeOfExclusion });

    if (exclusion.action === 'continue') {
      return false;
    }

    if (exclusion.action === 'exclude') {
      this.#emitTraceEvent(exclusion.traceMessage);
      return this.#excludeNode(node, processId, inputValues, exclusion.reason, options);
    }

    return true;
  }

  #excludeNode(
    node: ChartNode,
    processId: ProcessId,
    inputValues: Inputs,
    reason: string,
    options: { queueOutputNodes?: boolean } = {},
  ): ChartNode[] {
    const { queueOutputNodes = true } = options;
    const attachedData = this.#getAttachedDataTo(node);
    this.#registerNodeInActiveLoop(node, attachedData);

    this.#visitedNodes.add(node.id);
    this.#markAsExcluded(node, processId, inputValues, reason);
    this.#currentlyProcessing.delete(node.id);
    this.#remainingNodes.delete(node.id);

    const outputNodes = getOutputNodesFrom(this.#executionState, node);
    this.#propagateAttachedDataToOutputNodes(node, attachedData, outputNodes.connectionsToNodes);
    if (queueOutputNodes) {
      this.#queueOutputNodes(node, outputNodes.nodes);
    }

    return outputNodes.nodes;
  }

  #markAsExcluded(node: ChartNode, processId: ProcessId, inputValues: Inputs, reason: string) {
    const outputs = createExcludedNodeOutputs(node, this.#definitions[node.id]!.outputs);

    this.#nodeResults.set(node.id, outputs);

    emitDetached(
      this.#emitter,
      'nodeExcluded',
      this.#withExecution({
        node,
        processId,
        inputs: inputValues,
        outputs,
        reason,
      }),
    );
  }

  #getInputValuesForNode(node: ChartNode): Inputs {
    const connections = this.#connections[node.id];
    return this.#definitions[node.id]!.inputs.reduce(
      (values, input) => {
        const connection =
          this.#graphExecutionPlan?.inputConnectionByNodeAndPort[node.id]?.[input.id] ??
          connections?.find((conn) => conn.inputId === input.id && conn.inputNodeId === node.id);
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

  get #executionState(): ExecutionState {
    return {
      connections: this.#connections,
      definitions: this.#definitions,
      erroredNodes: this.#erroredNodes,
      executionPlan: this.#graphExecutionPlan,
      loopControllersSeen: this.#loopControllersSeen,
      nodesById: this.#nodesById,
      stronglyConnectedComponents: this.#scc,
      visitedNodes: this.#visitedNodes,
    };
  }
}
