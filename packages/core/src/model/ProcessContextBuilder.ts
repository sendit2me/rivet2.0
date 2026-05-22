import type { DataValue, ScalarOrArrayDataValue, StringArrayDataValue } from './DataValue.js';
import type { GraphExecutionMetadata, InternalProcessContext, ProcessId } from './ProcessContext.js';
import type { ChartNode } from './NodeBase.js';
import type { GraphId } from './NodeGraph.js';
import type { Project } from './Project.js';
import type { AttachedNodeData, ExternalFunction, Outputs } from './GraphProcessor.js';

export type NodeProcessContextBase = Omit<
  InternalProcessContext,
  | 'attachedData'
  | 'createSubProcessor'
  | 'execution'
  | 'externalFunctions'
  | 'getPluginConfig'
  | 'node'
  | 'onPartialOutputs'
  | 'processId'
  | 'requestUserInput'
  | 'setGlobal'
  | 'signal'
  | 'waitEvent'
>;

export function buildNodeProcessContext(options: {
  base: NodeProcessContextBase;
  attachedData: AttachedNodeData;
  createSubProcessor: (
    subGraphId: GraphId | undefined,
    options?: { signal?: AbortSignal; project?: Project },
  ) => unknown;
  execution: GraphExecutionMetadata;
  externalFunctions: Record<string, ExternalFunction>;
  getPluginConfig: (name: string) => string | undefined;
  node: ChartNode;
  nodeAbortController: AbortController;
  onPartialOutputs: (partialOutputs: Outputs) => void;
  processId: ProcessId;
  requestUserInput: (inputStrings: string[], renderingType: 'text' | 'markdown') => Promise<StringArrayDataValue>;
  setGlobal: (id: string, value: ScalarOrArrayDataValue) => void;
  waitEvent: (event: string) => Promise<DataValue | undefined>;
}): InternalProcessContext {
  const {
    attachedData,
    base,
    createSubProcessor,
    execution,
    externalFunctions,
    getPluginConfig,
    node,
    nodeAbortController,
    onPartialOutputs,
    processId,
    requestUserInput,
    setGlobal,
    waitEvent,
  } = options;

  return {
    ...base,
    node,
    attachedData,
    waitEvent,
    externalFunctions: { ...externalFunctions },
    onPartialOutputs,
    signal: nodeAbortController.signal,
    processId,
    setGlobal,
    createSubProcessor: createSubProcessor as InternalProcessContext['createSubProcessor'],
    getPluginConfig,
    requestUserInput,
    execution,
  };
}
