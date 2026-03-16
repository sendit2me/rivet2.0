import {
  GraphProcessor,
  type DataValue,
  globalRivetNodeRegistry,
  type GraphId,
  type NodeId,
  type Outputs,
  type ProcessEvents,
  type Project,
} from '@ironclad/rivet-core';
import { entries } from '../../../core/src/utils/typeSafety.js';
import type { InputsOrOutputsWithRefs, RunDataByNodeId } from '../state/dataFlow.js';
import type { ProjectContext } from '../state/savedGraphs.js';
import { restoreDataValueFromHistory } from '../utils/executionDataTransforms.js';
import { getGlobalDataRef } from '../utils/globals/globalDataRefs.js';

const dataRefs = {
  get: getGlobalDataRef,
};

export function getContextValues(projectContext: ProjectContext): Record<string, DataValue> {
  return entries(projectContext).reduce(
    (acc, [id, value]) => ({
      ...acc,
      [id]: value.value,
    }),
    {} as Record<string, DataValue>,
  );
}

export function getDependentDataForNodeForPreload(dependencyNodes: NodeId[], previousRunData: RunDataByNodeId) {
  const preloadData: Record<NodeId, Outputs> = {};

  for (const dependencyNode of dependencyNodes) {
    const dependencyNodeData = previousRunData[dependencyNode as keyof RunDataByNodeId];

    if (!dependencyNodeData) {
      throw new Error(`Node ${dependencyNode} was not found in the previous run data, cannot continue preloading data`);
    }

    const firstExecution = dependencyNodeData[0] as (typeof dependencyNodeData)[number] | undefined;

    if (!firstExecution?.data.outputData) {
      throw new Error(
        `Node ${dependencyNode} has no output data in the previous run data, cannot continue preloading data`,
      );
    }

    const outputData = firstExecution.data.outputData as InputsOrOutputsWithRefs;

    const outputDataWithoutRefs = Object.fromEntries(
      Object.entries(outputData).map(([portId, dataValueWithRefs]) => [portId, restoreDataValueFromHistory(dataValueWithRefs, dataRefs)]),
    ) as Outputs;

    preloadData[dependencyNode] = outputDataWithoutRefs;
  }

  return preloadData;
}

export function getDependencyNodesForRunFrom(project: Project, graphId: GraphId, from: NodeId): NodeId[] {
  const processor = new GraphProcessor(project, graphId, globalRivetNodeRegistry, true);
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
