import type { DataValue, ScalarOrArrayDataValue, StringArrayDataValue } from './DataValue.js';
import type { GraphExecutionMetadata, InternalProcessContext, ProcessContext, ProcessId } from './ProcessContext.js';
import type { ChartNode } from './NodeBase.js';
import type { GraphId } from './NodeGraph.js';
import type { Project, ProjectId } from './Project.js';
import type { AttachedNodeData, ExternalFunction, Outputs } from './GraphProcessor.js';
import type { Tokenizer } from '../integrations/Tokenizer.js';
import type { CodeRunner } from '../integrations/CodeRunner.js';
import type { GraphBoundary } from './GraphBoundaryCache.js';

export function buildNodeProcessContext(options: {
  attachedData: AttachedNodeData;
  codeRunner: CodeRunner;
  context: ProcessContext;
  contextValues: Record<string, DataValue>;
  createSubProcessor: (
    subGraphId: GraphId | undefined,
    options?: { signal?: AbortSignal; project?: Project },
  ) => unknown;
  execution: GraphExecutionMetadata;
  executionCache: Map<string, unknown>;
  executor: 'nodejs' | 'browser';
  externalFunctions: Record<string, ExternalFunction>;
  getGlobal: (id: string) => ScalarOrArrayDataValue | undefined;
  getGraphBoundary: (project: Project, graphId: GraphId | undefined) => GraphBoundary | undefined;
  getPluginConfig: (name: string) => string | undefined;
  graphInputNodeValues: Record<string, DataValue>;
  graphInputs: Record<string, DataValue>;
  graphOutputs: Record<string, DataValue>;
  loadedProjects: Record<ProjectId, Project>;
  node: ChartNode;
  nodeAbortController: AbortController;
  onPartialOutputs: (partialOutputs: Outputs) => void;
  processId: ProcessId;
  project: Project;
  raiseEvent: (event: string, data: DataValue | undefined) => void;
  requestUserInput: (inputStrings: string[], renderingType: 'text' | 'markdown') => Promise<StringArrayDataValue>;
  setGlobal: (id: string, value: ScalarOrArrayDataValue) => void;
  tokenizer: Tokenizer;
  trace: (message: string) => void;
  waitEvent: (event: string) => Promise<DataValue | undefined>;
  waitForGlobal: (id: string) => Promise<ScalarOrArrayDataValue>;
  abortGraph: (error?: Error | string) => void;
}): InternalProcessContext {
  const {
    attachedData,
    codeRunner,
    context,
    contextValues,
    createSubProcessor,
    execution,
    executionCache,
    executor,
    externalFunctions,
    getGlobal,
    getGraphBoundary,
    getPluginConfig,
    graphInputNodeValues,
    graphInputs,
    graphOutputs,
    loadedProjects,
    node,
    nodeAbortController,
    onPartialOutputs,
    processId,
    project,
    raiseEvent,
    requestUserInput,
    setGlobal,
    tokenizer,
    trace,
    waitEvent,
    waitForGlobal,
    abortGraph,
  } = options;

  return {
    ...context,
    node,
    tokenizer,
    executor,
    project,
    executionCache,
    graphInputs,
    graphOutputs,
    attachedData,
    codeRunner,
    referencedProjects: loadedProjects,
    waitEvent,
    raiseEvent,
    contextValues,
    externalFunctions: { ...externalFunctions },
    onPartialOutputs,
    signal: nodeAbortController.signal,
    processId,
    getGlobal,
    getGraphBoundary,
    setGlobal,
    waitForGlobal,
    createSubProcessor: createSubProcessor as InternalProcessContext['createSubProcessor'],
    trace,
    abortGraph,
    getPluginConfig,
    requestUserInput,
    graphInputNodeValues,
    execution,
  };
}
