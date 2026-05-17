import {
  GraphProcessor,
  type GraphId,
  type NodeId,
  type NodeRegistration,
  type Outputs,
  type ProcessEvents,
  type Project,
} from '@valerypopoff/rivet2-core';
import type { ProcessDataForNode, RunDataByNodeId } from '../state/dataFlow.js';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import { hasStoredPortMapValues, restoreStoredPortMap } from '../utils/executionDataReaders.js';
import { hasUnavailableStoredRefs } from '../utils/executionDataStorage.js';
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

    const latestExecutionWithOutput = findLatestExecutionWithOutput(dependencyNodeData);

    const outputData = latestExecutionWithOutput?.data.outputData;
    if (!hasStoredPortMapValues(outputData)) {
      throw new Error(
        `Node ${dependencyNode} has no output data in the previous run data, cannot continue preloading data`,
      );
    }

    let outputDataWithoutRefs: Outputs | undefined;

    try {
      outputDataWithoutRefs = restoreStoredPortMap(outputData, dataRefs);
    } catch (error) {
      throw new Error(
        `Node ${dependencyNode} output data was cleared from execution memory and cannot be preloaded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!outputDataWithoutRefs || Object.keys(outputDataWithoutRefs).length === 0) {
      throw new Error(
        `Node ${dependencyNode} output data could not be restored from execution memory, cannot continue preloading data`,
      );
    }

    preloadData[dependencyNode] = outputDataWithoutRefs;
  }

  return preloadData;
}

export type EditorRunFromPlan = {
  nodesToRun: NodeId[];
  preserveNodeIds: NodeId[];
  preloadNodeIds: NodeId[];
  runToNodeIds: NodeId[];
};

export function getEditorRunFromPlan(
  project: Project,
  graphId: GraphId,
  from: NodeId,
  projectNodeRegistry: NodeRegistration<any, any>,
): EditorRunFromPlan {
  const graph = project.graphs[graphId];
  if (!graph) {
    throw new Error(`Graph ${graphId} was not found, cannot plan run-from execution`);
  }

  if (!graph.nodes.some((node) => node.id === from)) {
    throw new Error(`Node ${from} was not found in graph ${graphId}, cannot plan run-from execution`);
  }

  const processor = new GraphProcessor(project, graphId, projectNodeRegistry, true);
  const graphNodeIds = graph.nodes.map((node) => node.id);
  const dependenciesByNodeId = new Map<NodeId, Set<NodeId>>();

  for (const node of graph.nodes) {
    dependenciesByNodeId.set(node.id, new Set(processor.getDependencyNodesDeep(node.id)));
  }

  const nodesToRunSet = new Set<NodeId>([from]);
  for (const nodeId of graphNodeIds) {
    if (dependenciesByNodeId.get(nodeId)?.has(from)) {
      nodesToRunSet.add(nodeId);
    }
  }
  const nodesToRun = graphNodeIds.filter((nodeId) => nodesToRunSet.has(nodeId));

  const preloadNodeSet = new Set<NodeId>();
  for (const connection of graph.connections) {
    if (
      nodesToRunSet.has(connection.inputNodeId) &&
      !nodesToRunSet.has(connection.outputNodeId) &&
      dependenciesByNodeId.get(connection.inputNodeId)?.has(connection.outputNodeId)
    ) {
      preloadNodeSet.add(connection.outputNodeId);
    }
  }

  const runToNodeSet = new Set<NodeId>();
  for (const nodeId of nodesToRun) {
    const hasDownstreamNodeInRun = nodesToRun.some(
      (candidateNodeId) => candidateNodeId !== nodeId && dependenciesByNodeId.get(candidateNodeId)?.has(nodeId),
    );

    if (!hasDownstreamNodeInRun) {
      runToNodeSet.add(nodeId);
    }
  }

  if (runToNodeSet.size === 0) {
    runToNodeSet.add(from);
  }

  return {
    nodesToRun,
    preserveNodeIds: graphNodeIds.filter((nodeId) => !nodesToRunSet.has(nodeId)),
    preloadNodeIds: graphNodeIds.filter((nodeId) => preloadNodeSet.has(nodeId)),
    runToNodeIds: graphNodeIds.filter((nodeId) => runToNodeSet.has(nodeId)),
  };
}

export function canPreloadEditorRunFromPlan(plan: EditorRunFromPlan, previousRunData: RunDataByNodeId): boolean {
  return getUnavailablePreloadNodeIds(plan.preloadNodeIds, previousRunData).length === 0;
}

export function getUnavailablePreloadNodeIds(preloadNodeIds: NodeId[], previousRunData: RunDataByNodeId): NodeId[] {
  return preloadNodeIds.filter((nodeId) => {
    const latestExecutionWithOutput = findLatestExecutionWithOutput(previousRunData[nodeId]);
    const outputData = latestExecutionWithOutput?.data.outputData;

    return !hasStoredPortMapValues(outputData) || hasUnavailableStoredRefs(outputData, dataRefs);
  });
}

function findLatestExecutionWithOutput(executions: ProcessDataForNode[] | undefined) {
  if (!executions) {
    return undefined;
  }

  for (let index = executions.length - 1; index >= 0; index--) {
    if (hasStoredPortMapValues(executions[index]?.data.outputData)) {
      return executions[index];
    }
  }

  return undefined;
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
    nodeOutputsCleared: (data: unknown) =>
      currentExecution.onNodeOutputsCleared(data as ProcessEvents['nodeOutputsCleared']),
    pause: () => currentExecution.onPause(),
    resume: () => currentExecution.onResume(),
    error: (data: unknown) => currentExecution.onError(data as ProcessEvents['error']),
    nodeExcluded: (data: unknown) => currentExecution.onNodeExcluded(data as ProcessEvents['nodeExcluded']),
  } as const;
}
