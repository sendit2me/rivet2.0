import {
  extractInterpolationVariables,
  looseDataValuesToDataValues,
  type ChartNode,
  type DataValue,
  type GraphId,
  type NodeGraph,
  type Project,
  type RunGraphOptions,
} from '@valerypopoff/rivet2-core';

import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { NodeGraphRunner, NodeGraphRunnerRunOptions } from './api.js';

export type NodeNativeRuntimeDecision = {
  fallbackReason?: string;
  nativeBackend?: string;
  nativeEligible: boolean;
  nativeUsed: boolean;
  requested: boolean;
};

export type NativeRuntimeRunOptions = {
  abortSignal?: AbortSignal;
  context: Record<string, DataValue>;
  inputs: Record<string, DataValue>;
};

export type NativeRuntimeGraphRunner = {
  dispose?: () => void;
  run: (options: NativeRuntimeRunOptions) => Promise<Record<string, DataValue>>;
};

export type NativeRuntimeCreateResult =
  | {
      backend?: string;
      runner: NativeRuntimeGraphRunner;
      supported: true;
    }
  | {
      reason: string;
      supported: false;
    };

export type NativeRuntimeModule = {
  createNativeGraphRunner: (request: NativeRuntimeCreateRequest) => Promise<NativeRuntimeCreateResult>;
};

export type NativeRuntimeCreateRequest = {
  graphId: string;
  graphs: NativeGraphIr[];
};

export type NativeGraphIr = {
  connections: Array<{
    inputId: string;
    inputNodeId: string;
    outputId: string;
    outputNodeId: string;
  }>;
  graphId: string;
  nodes: NativeNodeIr[];
};

export type NativeNodeIr =
  | {
      dataType: string;
      defaultValue?: unknown;
      id: string;
      inputId: string;
      type: 'graphInput';
    }
  | {
      id: string;
      normalizeLineEndings: boolean;
      template: string;
      type: 'text';
    }
  | {
      flatten: boolean;
      id: string;
      joinString: string;
      type: 'join';
    }
  | {
      dataType: string;
      id: string;
      outputId: string;
      type: 'graphOutput';
    }
  | {
      graphId: string;
      id: string;
      inputData?: Record<string, DataValue>;
      type: 'subGraph';
    };

type NativeRuntimeModuleLoader = () => Promise<NativeRuntimeModule>;

const DEFAULT_NATIVE_RUNTIME_MODULE = '@valerypopoff/rivet2-native-runtime';

type NativeFastGraphRunnerOptions = Omit<RunGraphOptions, 'abortSignal' | 'context' | 'inputs'>;

const UNSUPPORTED_NATIVE_RUNTIME_OPTION_KEYS = [
  'audioProvider',
  'captureNodeTimings',
  'codeRunner',
  'concurrency',
  'datasetProvider',
  'editorExecutionCache',
  'externalFunctions',
  'getChatNodeEndpoint',
  'includeTrace',
  'mcpProvider',
  'nativeApi',
  'onAbort',
  'onDone',
  'onGraphAbort',
  'onGraphError',
  'onGraphFinish',
  'onGraphStart',
  'onNodeError',
  'onNodeExcluded',
  'onNodeFinish',
  'onNodeOutputsCleared',
  'onNodeStart',
  'onPartialOutput',
  'onStart',
  'onTrace',
  'onUserEvent',
  'onUserInput',
  'projectPath',
  'projectReferenceLoader',
  'registry',
  'tokenizer',
] as const satisfies readonly (keyof NativeFastGraphRunnerOptions)[];

const SUPPORTED_NATIVE_TEXT_PROCESSORS = new Set(['lowercase', 'trim', 'truncate', 'uppercase']);

let nativeRuntimeModuleLoaderForTesting: NativeRuntimeModuleLoader | undefined;

export function setNativeRuntimeModuleLoaderForTesting(loader: NativeRuntimeModuleLoader | undefined): void {
  nativeRuntimeModuleLoaderForTesting = loader;
}

export function createNativeFastGraphRunner(
  project: Project,
  options: NativeFastGraphRunnerOptions,
  createFallbackRunner: () => NodeGraphRunner,
): NodeGraphRunner {
  let fallbackRunner: NodeGraphRunner | undefined;
  const nativeRequest = buildNativeRuntimeRequest(project, options);
  let nativeRunnerPromise: Promise<NativeRuntimeGraphRunner | undefined> | undefined;
  let disposed = false;
  let nativeBackend: string | undefined;
  let decision: NodeNativeRuntimeDecision = nativeRequest.supported
    ? {
        nativeEligible: true,
        nativeUsed: false,
        requested: true,
      }
    : {
        fallbackReason: nativeRequest.reason,
        nativeEligible: false,
        nativeUsed: false,
        requested: true,
      };

  const getFallbackRunner = (): NodeGraphRunner => {
    if (disposed) {
      throw new Error('Cannot run a disposed graph runner.');
    }

    fallbackRunner ??= createFallbackRunner();
    return fallbackRunner;
  };

  const getNativeRunner = async (): Promise<NativeRuntimeGraphRunner | undefined> => {
    if (disposed) {
      throw new Error('Cannot run a disposed graph runner.');
    }

    if (!nativeRequest.supported) {
      return undefined;
    }

    nativeRunnerPromise ??= (async () => {
      let nativeModule: NativeRuntimeModule;
      try {
        nativeModule = await loadNativeRuntimeModule();
      } catch (error) {
        decision = {
          fallbackReason: `module-load-failed:${getErrorMessage(error)}`,
          nativeEligible: true,
          nativeUsed: false,
          requested: true,
        };
        return undefined;
      }

      if (disposed) {
        return undefined;
      }

      try {
        const createResult = await nativeModule.createNativeGraphRunner(nativeRequest.request);
        if (!createResult.supported) {
          decision = {
            fallbackReason: `module-unsupported:${createResult.reason}`,
            nativeEligible: true,
            nativeUsed: false,
            requested: true,
          };
          return undefined;
        }

        if (disposed) {
          createResult.runner.dispose?.();
          return undefined;
        }

        nativeBackend = createResult.backend;
        return createResult.runner;
      } catch (error) {
        decision = {
          fallbackReason: `module-create-failed:${getErrorMessage(error)}`,
          nativeEligible: true,
          nativeUsed: false,
          requested: true,
        };
        return undefined;
      }
    })();

    return nativeRunnerPromise;
  };

  return {
    dispose() {
      disposed = true;
      fallbackRunner?.dispose();
      void nativeRunnerPromise?.then((nativeRunner) => nativeRunner?.dispose?.());
    },
    getNativeRuntimeDecision() {
      return decision;
    },
    async run(runOptions: NodeGraphRunnerRunOptions = {}) {
      if (runOptions.abortSignal != null) {
        decision = {
          fallbackReason: 'unsupported-run-option:abortSignal',
          nativeEligible: nativeRequest.supported,
          nativeUsed: false,
          requested: true,
        };
        return getFallbackRunner().run(runOptions);
      }

      const nativeRunner = await getNativeRunner();
      if (disposed) {
        throw new Error('Cannot run a disposed graph runner.');
      }

      if (!nativeRunner) {
        decision = {
          ...decision,
          nativeUsed: false,
        };
        return getFallbackRunner().run(runOptions);
      }

      try {
        const outputs = withDefaultCostOutput(
          normalizeNativeOutputDataValues(
            await nativeRunner.run({
              abortSignal: runOptions.abortSignal,
              context: looseDataValuesToDataValues(runOptions.context ?? {}),
              inputs: looseDataValuesToDataValues(runOptions.inputs ?? {}),
            }),
          ),
        );
        decision = {
          nativeEligible: true,
          nativeUsed: true,
          requested: true,
          ...(nativeBackend ? { nativeBackend } : {}),
        };
        return outputs;
      } catch (error) {
        decision = {
          fallbackReason: `module-run-failed:${getErrorMessage(error)}`,
          nativeEligible: true,
          nativeUsed: false,
          requested: true,
        };
        throw error;
      }
    },
  };
}

async function loadNativeRuntimeModule(): Promise<NativeRuntimeModule> {
  if (nativeRuntimeModuleLoaderForTesting) {
    return nativeRuntimeModuleLoaderForTesting();
  }

  const moduleName = process.env.RIVET_NATIVE_RUNTIME_MODULE ?? DEFAULT_NATIVE_RUNTIME_MODULE;
  const nativeModule = (await import(resolveNativeRuntimeModuleSpecifier(moduleName))) as Partial<NativeRuntimeModule>;

  if (typeof nativeModule.createNativeGraphRunner !== 'function') {
    throw new Error(`Native runtime module ${moduleName} does not export createNativeGraphRunner.`);
  }

  return nativeModule as NativeRuntimeModule;
}

function resolveNativeRuntimeModuleSpecifier(moduleName: string): string {
  if (moduleName.startsWith('file:')) {
    return moduleName;
  }

  if (isNativeRuntimeModulePath(moduleName)) {
    return pathToFileURL(resolve(moduleName)).href;
  }

  return moduleName;
}

function isNativeRuntimeModulePath(moduleName: string): boolean {
  return (
    moduleName.startsWith('.') ||
    moduleName.startsWith('/') ||
    isAbsolute(moduleName) ||
    /^[a-zA-Z]:[\\/]/.test(moduleName)
  );
}

type NativeRuntimeRequestResult =
  | {
      request: NativeRuntimeCreateRequest;
      supported: true;
    }
  | {
      reason: string;
      supported: false;
    };

function buildNativeRuntimeRequest(project: Project, options: NativeFastGraphRunnerOptions): NativeRuntimeRequestResult {
  const unsupportedOption = getUnsupportedNativeRuntimeOption(options);
  if (unsupportedOption) {
    return unsupported(`unsupported-option:${unsupportedOption}`);
  }

  if (project.plugins && project.plugins.length > 0) {
    return unsupported('project-has-plugins');
  }

  const graph = getGraph(project, options.graph);
  if (!graph?.metadata?.id) {
    return unsupported('graph-not-found');
  }

  const graphs = new Map<string, NativeGraphIr>();
  const result = buildNativeGraphIr(project, graph.metadata.id, graphs, new Set());
  if (!result.supported) {
    return result;
  }

  return {
    request: {
      graphId: graph.metadata.id,
      graphs: [...graphs.values()],
    },
    supported: true,
  };
}

function getUnsupportedNativeRuntimeOption(options: NativeFastGraphRunnerOptions): string | undefined {
  return UNSUPPORTED_NATIVE_RUNTIME_OPTION_KEYS.find((key) => {
    const value = options[key];
    if (value == null) {
      return false;
    }

    if (key === 'captureNodeTimings' || key === 'includeTrace') {
      return value === true;
    }

    return true;
  });
}

function buildNativeGraphIr(
  project: Project,
  graphId: GraphId,
  graphs: Map<string, NativeGraphIr>,
  activeGraphIds: Set<string>,
): NativeRuntimeRequestResult {
  if (graphs.has(graphId)) {
    return { request: { graphId, graphs: [...graphs.values()] }, supported: true };
  }

  if (activeGraphIds.has(graphId)) {
    return unsupported(`recursive-graph:${graphId}`);
  }

  const graph = project.graphs[graphId];
  if (!graph) {
    return unsupported(`missing-graph:${graphId}`);
  }

  activeGraphIds.add(graphId);
  try {
    const nodes: NativeNodeIr[] = [];
    for (const node of graph.nodes) {
      const nativeNode = buildNativeNodeIr(node);
      if (!nativeNode.supported) {
        return nativeNode;
      }

      if (nativeNode.node.type === 'subGraph') {
        const subgraphResult = buildNativeGraphIr(project, nativeNode.node.graphId as GraphId, graphs, activeGraphIds);
        if (!subgraphResult.supported) {
          return subgraphResult;
        }
      }

      nodes.push(nativeNode.node);
    }

    if (hasCycle(graph)) {
      return unsupported(`cyclic-graph:${graphId}`);
    }

    const unsupportedConnection = getUnsupportedNativeConnection(graph, nodes, graphs);
    if (unsupportedConnection) {
      return unsupported(unsupportedConnection);
    }

    graphs.set(graphId, {
      connections: graph.connections.map((connection) => ({
        inputId: connection.inputId,
        inputNodeId: connection.inputNodeId,
        outputId: connection.outputId,
        outputNodeId: connection.outputNodeId,
      })),
      graphId,
      nodes,
    });

    return { request: { graphId, graphs: [...graphs.values()] }, supported: true };
  } finally {
    activeGraphIds.delete(graphId);
  }
}

function getUnsupportedNativeConnection(
  graph: NodeGraph,
  nodes: NativeNodeIr[],
  graphs: Map<string, NativeGraphIr>,
): string | undefined {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  for (const connection of graph.connections) {
    const outputNode = nodesById.get(connection.outputNodeId);
    if (!outputNode) {
      return `unsupported-connection-output-node:${connection.outputNodeId}`;
    }

    const inputNode = nodesById.get(connection.inputNodeId);
    if (!inputNode) {
      return `unsupported-connection-input-node:${connection.inputNodeId}`;
    }

    if (!isSupportedNativeOutputPort(outputNode, connection.outputId, graphs)) {
      return `unsupported-connection-output-port:${outputNode.id}:${connection.outputId}`;
    }

    if (!isSupportedNativeInputPort(inputNode, connection.inputId, graphs)) {
      return `unsupported-connection-input-port:${inputNode.id}:${connection.inputId}`;
    }
  }

  return undefined;
}

function isSupportedNativeInputPort(
  node: NativeNodeIr,
  portId: string,
  graphs: Map<string, NativeGraphIr>,
): boolean {
  switch (node.type) {
    case 'graphInput':
      return false;
    case 'text':
      return extractInterpolationVariables(node.template).includes(portId);
    case 'join':
      return /^input[1-9]\d*$/.test(portId);
    case 'graphOutput':
      return portId === 'value';
    case 'subGraph':
      return getNativeGraphInputIds(graphs.get(node.graphId)).has(portId);
  }
}

function isSupportedNativeOutputPort(
  node: NativeNodeIr,
  portId: string,
  graphs: Map<string, NativeGraphIr>,
): boolean {
  switch (node.type) {
    case 'graphInput':
      return portId === 'data';
    case 'text':
    case 'join':
      return portId === 'output';
    case 'graphOutput':
      return portId === 'valueOutput';
    case 'subGraph':
      return getNativeGraphOutputIds(graphs.get(node.graphId)).has(portId);
  }
}

function getNativeGraphInputIds(graph: NativeGraphIr | undefined): Set<string> {
  return new Set(graph?.nodes.flatMap((node) => (node.type === 'graphInput' ? [node.inputId] : [])) ?? []);
}

function getNativeGraphOutputIds(graph: NativeGraphIr | undefined): Set<string> {
  return new Set(graph?.nodes.flatMap((node) => (node.type === 'graphOutput' ? [node.outputId] : [])) ?? []);
}

type NativeNodeResult =
  | {
      node: NativeNodeIr;
      supported: true;
    }
  | {
      reason: string;
      supported: false;
    };

function buildNativeNodeIr(node: ChartNode): NativeNodeResult {
  if (node.disabled) {
    return unsupportedNode(node, 'disabled');
  }

  if (node.isConditional) {
    return unsupportedNode(node, 'conditional');
  }

  if (node.isSplitRun) {
    return unsupportedNode(node, 'split-run');
  }

  switch (node.type) {
    case 'graphInput': {
      const data = node.data as { dataType?: unknown; defaultValue?: unknown; id?: unknown; useDefaultValueInput?: unknown };
      if (data.useDefaultValueInput) {
        return unsupportedNode(node, 'graph-input-default-port');
      }

      if (typeof data.id !== 'string' || typeof data.dataType !== 'string') {
        return unsupportedNode(node, 'invalid-graph-input-data');
      }

      if (!isSupportedNativeDataType(data.dataType)) {
        return unsupportedNode(node, `unsupported-data-type:${data.dataType}`);
      }

      return {
        node: {
          dataType: data.dataType,
          defaultValue: data.defaultValue,
          id: node.id,
          inputId: data.id,
          type: 'graphInput',
        },
        supported: true,
      };
    }

    case 'text': {
      const data = node.data as { normalizeLineEndings?: unknown; text?: unknown };
      if (typeof data.text !== 'string') {
        return unsupportedNode(node, 'invalid-text-data');
      }

      const unsupportedTextProcessing = getUnsupportedNativeTextProcessing(data.text);
      if (unsupportedTextProcessing) {
        return unsupportedNode(node, unsupportedTextProcessing);
      }

      return {
        node: {
          id: node.id,
          normalizeLineEndings: data.normalizeLineEndings !== false,
          template: data.text,
          type: 'text',
        },
        supported: true,
      };
    }

    case 'join': {
      const data = node.data as { flatten?: unknown; joinString?: unknown; useJoinStringInput?: unknown };
      if (data.useJoinStringInput) {
        return unsupportedNode(node, 'join-string-input');
      }

      if (typeof data.joinString !== 'string') {
        return unsupportedNode(node, 'invalid-join-data');
      }

      return {
        node: {
          flatten: data.flatten !== false,
          id: node.id,
          joinString: data.joinString,
          type: 'join',
        },
        supported: true,
      };
    }

    case 'graphOutput': {
      const data = node.data as { dataType?: unknown; id?: unknown };
      if (typeof data.id !== 'string' || typeof data.dataType !== 'string') {
        return unsupportedNode(node, 'invalid-graph-output-data');
      }

      if (!isSupportedNativeDataType(data.dataType)) {
        return unsupportedNode(node, `unsupported-data-type:${data.dataType}`);
      }

      return {
        node: {
          dataType: data.dataType,
          id: node.id,
          outputId: data.id,
          type: 'graphOutput',
        },
        supported: true,
      };
    }

    case 'subGraph': {
      const data = node.data as {
        graphId?: unknown;
        inputData?: unknown;
        useAsGraphPartialOutput?: unknown;
        useErrorOutput?: unknown;
      };
      if (data.useErrorOutput || data.useAsGraphPartialOutput) {
        return unsupportedNode(node, 'subgraph-event-output');
      }

      if (typeof data.graphId !== 'string') {
        return unsupportedNode(node, 'invalid-subgraph-data');
      }

      return {
        node: {
          graphId: data.graphId,
          id: node.id,
          inputData: isDataValueMap(data.inputData) ? data.inputData : undefined,
          type: 'subGraph',
        },
        supported: true,
      };
    }

    default:
      return unsupportedNode(node, `unsupported-node:${node.type}`);
  }
}

function isSupportedNativeDataType(dataType: string): boolean {
  return dataType === 'string' || dataType === 'number' || dataType === 'boolean' || dataType === 'any';
}

function getUnsupportedNativeTextProcessing(template: string): string | undefined {
  for (const rawInner of getInterpolationTokenInnerTexts(template)) {
    const processingInstructions = rawInner
      .split('|')
      .slice(1)
      .map((instruction) => instruction.trim())
      .filter(Boolean);

    for (const instruction of processingInstructions) {
      const [name, parameter] = instruction.split(/\s+/);
      if (!name || !SUPPORTED_NATIVE_TEXT_PROCESSORS.has(name)) {
        return `unsupported-text-processing:${name || '<empty>'}`;
      }

      if (name === 'truncate' && parameter != null && !/^(?:0|[1-9]\d*)$/.test(parameter)) {
        return 'unsupported-text-processing:truncate';
      }
    }
  }

  return undefined;
}

function getInterpolationTokenInnerTexts(template: string): string[] {
  const protectedTemplate = template.replace(/\{\{\{([^}]+?)\}\}\}/g, '');
  const tokenInnerTexts: string[] = [];
  let searchIndex = 0;

  while (searchIndex < protectedTemplate.length) {
    const openIndex = protectedTemplate.indexOf('{{', searchIndex);
    if (openIndex === -1) {
      break;
    }

    const closeIndex = protectedTemplate.indexOf('}}', openIndex + 2);
    if (closeIndex === -1) {
      break;
    }

    const nestedOpenIndex = protectedTemplate.indexOf('{{', openIndex + 2);
    if (nestedOpenIndex !== -1 && nestedOpenIndex < closeIndex) {
      searchIndex = nestedOpenIndex;
      continue;
    }

    tokenInnerTexts.push(protectedTemplate.slice(openIndex + 2, closeIndex));
    searchIndex = closeIndex + 2;
  }

  return tokenInnerTexts;
}

function isDataValueMap(value: unknown): value is Record<string, DataValue> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isDataValue);
}

function isDataValue(value: unknown): value is DataValue {
  return (
    value != null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function getGraph(project: Project, graphNameOrId: string | undefined): NodeGraph | undefined {
  if (graphNameOrId) {
    return (
      project.graphs[graphNameOrId as GraphId] ??
      Object.values(project.graphs).find((candidate) => candidate.metadata?.name === graphNameOrId)
    );
  }

  return project.metadata.mainGraphId ? project.graphs[project.metadata.mainGraphId] : undefined;
}

function hasCycle(graph: NodeGraph): boolean {
  const outgoing = new Map<string, string[]>();
  for (const connection of graph.connections) {
    const targets = outgoing.get(connection.outputNodeId) ?? [];
    targets.push(connection.inputNodeId);
    outgoing.set(connection.outputNodeId, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  return graph.nodes.some((node) => visit(node.id));
}

function unsupported(reason: string): NativeRuntimeRequestResult {
  return { reason, supported: false };
}

function unsupportedNode(node: ChartNode, reason: string): NativeNodeResult {
  return { reason: `${reason}:${node.id}`, supported: false };
}

function withDefaultCostOutput(outputs: Record<string, DataValue>): Record<string, DataValue> {
  return outputs.cost == null
    ? {
        ...outputs,
        cost: { type: 'number', value: 0 },
      }
    : outputs;
}

function normalizeNativeOutputDataValues(outputs: Record<string, DataValue>): Record<string, DataValue> {
  return Object.fromEntries(
    Object.entries(outputs).map(([key, value]) => [key, normalizeNativeOutputDataValue(value)]),
  ) as Record<string, DataValue>;
}

function normalizeNativeOutputDataValue(value: DataValue): DataValue {
  if (value != null && typeof value === 'object' && 'type' in value && !('value' in value)) {
    return Object.assign({}, value, { value: undefined }) as DataValue;
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
