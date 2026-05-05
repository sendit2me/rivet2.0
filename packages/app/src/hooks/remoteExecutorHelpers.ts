import {
  GraphProcessor,
  type GraphId,
  type NodeId,
  type NodeRegistration,
  type Outputs,
  type ProcessEvents,
  type Project,
} from '@valerypopoff/rivet2-core';
import type { RunDataByNodeId } from '../state/dataFlow.js';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import { restoreStoredPortMap } from '../utils/executionDataReaders.js';
import { getGlobalDataRef } from '../utils/globals/globalDataRefs.js';

const dataRefs: DataRefReader = {
  get: getGlobalDataRef,
};

export function getDependentDataForNodeForPreload(dependencyNodes: NodeId[], previousRunData: RunDataByNodeId) {
  const preloadData: Record<NodeId, Outputs> = {};

  for (const dependencyNode of dependencyNodes) {
    const dependencyNodeData = previousRunData[dependencyNode];

    if (!dependencyNodeData) {
      throw new Error(`Node ${dependencyNode} was not found in the previous run data, cannot continue preloading data`);
    }

    const firstExecution = dependencyNodeData[0];

    if (!firstExecution?.data.outputData) {
      throw new Error(
        `Node ${dependencyNode} has no output data in the previous run data, cannot continue preloading data`,
      );
    }

    const outputData = firstExecution.data.outputData;
    let outputDataWithoutRefs: Outputs | undefined;

    try {
      outputDataWithoutRefs = restoreStoredPortMap(outputData, dataRefs);
    } catch (error) {
      throw new Error(
        `Node ${dependencyNode} output data was cleared from execution memory and cannot be preloaded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!outputDataWithoutRefs) {
      throw new Error(
        `Node ${dependencyNode} output data could not be restored from execution memory, cannot continue preloading data`,
      );
    }

    preloadData[dependencyNode] = outputDataWithoutRefs;
  }

  return preloadData;
}

export function getDependencyNodesForRunFrom(
  project: Project,
  graphId: GraphId,
  from: NodeId,
  projectNodeRegistry: NodeRegistration<any, any>,
): NodeId[] {
  const processor = new GraphProcessor(project, graphId, projectNodeRegistry, true);
  return processor.getDependencyNodesDeep(from);
}

export function selectTestSuitesToRun<T extends { id: string; testCases: { id: string }[] }>(
  testSuites: T[],
  options: { testSuiteIds?: string[]; testCaseIds?: string[] },
): T[] {
  return options.testSuiteIds
    ? testSuites
        .filter((testSuite) => options.testSuiteIds!.includes(testSuite.id))
        .map((testSuite) => ({
          ...testSuite,
          testCases: options.testCaseIds
            ? testSuite.testCases.filter((testCase) => options.testCaseIds?.includes(testCase.id))
            : testSuite.testCases,
        }))
    : testSuites;
}

export function createProcessEventDispatcher(currentExecution: {
  onAbort: (event: ProcessEvents['abort']) => void;
  onDone: (event: ProcessEvents['done']) => void;
  onError: (event: ProcessEvents['error']) => void;
  onGraphAbort: (event: ProcessEvents['graphAbort']) => void;
  onGraphError: (event: ProcessEvents['graphError']) => void;
  onGraphFinish: (event: ProcessEvents['graphFinish']) => void;
  onGraphStart: (event: ProcessEvents['graphStart']) => void;
  onNodeError: (event: ProcessEvents['nodeError']) => void;
  onNodeExcluded: (event: ProcessEvents['nodeExcluded']) => void;
  onNodeFinish: (event: ProcessEvents['nodeFinish']) => void;
  onNodeOutputsCleared: (event: ProcessEvents['nodeOutputsCleared']) => void;
  onNodeStart: (event: ProcessEvents['nodeStart']) => void;
  onPartialOutput: (event: ProcessEvents['partialOutput']) => void;
  onPause: () => void;
  onResume: () => void;
  onStart: (event: ProcessEvents['start']) => void;
  onUserInput: (event: ProcessEvents['userInput']) => void;
}) {
  return {
    nodeStart: (data: unknown) => currentExecution.onNodeStart(data as ProcessEvents['nodeStart']),
    nodeFinish: (data: unknown) => currentExecution.onNodeFinish(data as ProcessEvents['nodeFinish']),
    nodeError: (data: unknown) => currentExecution.onNodeError(data as ProcessEvents['nodeError']),
    userInput: (data: unknown) => currentExecution.onUserInput(data as ProcessEvents['userInput']),
    start: (data: unknown) => currentExecution.onStart(data as ProcessEvents['start']),
    done: (data: unknown) => currentExecution.onDone(data as ProcessEvents['done']),
    abort: (data: unknown) => currentExecution.onAbort(data as ProcessEvents['abort']),
    graphAbort: (data: unknown) => currentExecution.onGraphAbort(data as ProcessEvents['graphAbort']),
    graphError: (data: unknown) => currentExecution.onGraphError(data as ProcessEvents['graphError']),
    partialOutput: (data: unknown) => currentExecution.onPartialOutput(data as ProcessEvents['partialOutput']),
    graphStart: (data: unknown) => currentExecution.onGraphStart(data as ProcessEvents['graphStart']),
    graphFinish: (data: unknown) => currentExecution.onGraphFinish(data as ProcessEvents['graphFinish']),
    nodeOutputsCleared: (data: unknown) => currentExecution.onNodeOutputsCleared(data as ProcessEvents['nodeOutputsCleared']),
    pause: () => currentExecution.onPause(),
    resume: () => currentExecution.onResume(),
    error: (data: unknown) => currentExecution.onError(data as ProcessEvents['error']),
    nodeExcluded: (data: unknown) => currentExecution.onNodeExcluded(data as ProcessEvents['nodeExcluded']),
  } as const;
}
