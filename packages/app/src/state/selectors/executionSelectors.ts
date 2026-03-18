import type { GraphRunRecord, GraphRunSelection, ProcessDataForNode, NodeRunDataWithRefs, PageValue } from '../dataFlow.js';
import type { GraphRunId } from '@ironclad/rivet-core';
import type { DefaultExecutor } from '../settings.js';
import type { ExecutorSessionState } from '../../hooks/executorSession.js';
import type { GraphViewContext, GraphViewKey } from '../../domain/graphEditing/navigationActions.js';

export function getGraphRunsForView(options: {
  currentGraphView?: GraphViewContext;
  graphRunHistoryByView: Record<GraphViewKey, GraphRunRecord[]>;
}): GraphRunRecord[] {
  const { currentGraphView, graphRunHistoryByView } = options;
  if (!currentGraphView) {
    return [];
  }

  const directMatches = (graphRunHistoryByView[currentGraphView.key] ?? []).filter(
    (graphRun) => graphRun.graphId === currentGraphView.graphId,
  );

  // When viewing a root context with direct matches, no broader search needed.
  // But when viewing a graph as root that was only executed as a subgraph (no direct matches),
  // or when viewing an explicit subgraph context, do a broader search by graphId.
  if (!currentGraphView.parent && directMatches.length > 0) {
    return directMatches;
  }

  const runsById = new Map<GraphRunId, GraphRunRecord>();
  for (const graphRun of directMatches) {
    runsById.set(graphRun.graphRunId, graphRun);
  }

  for (const graphRuns of Object.values(graphRunHistoryByView)) {
    for (const graphRun of graphRuns) {
      if (graphRun.graphId !== currentGraphView.graphId) {
        continue;
      }

      if (currentGraphView.parent && graphRun.executor?.nodeId && graphRun.executor.nodeId !== currentGraphView.parent.parentNodeId) {
        continue;
      }

      runsById.set(graphRun.graphRunId, graphRun);
    }
  }

  return [...runsById.values()].sort((left, right) => {
    const leftTime = left.startedAt ?? left.finishedAt ?? 0;
    const rightTime = right.startedAt ?? right.finishedAt ?? 0;
    return leftTime - rightTime;
  });
}

export function getGraphSelectionOptions(options: {
  currentGraphView?: GraphViewContext;
  graphRunHistoryByView: Record<GraphViewKey, GraphRunRecord[]>;
  selectedGraphRunByView: Record<GraphViewKey, GraphRunSelection>;
}): {
  graphRuns?: GraphRunRecord[];
  selectedGraphRun?: GraphRunSelection;
} {
  const { currentGraphView, graphRunHistoryByView, selectedGraphRunByView } = options;

  return {
    graphRuns: currentGraphView ? getGraphRunsForView({ currentGraphView, graphRunHistoryByView }) : undefined,
    selectedGraphRun: currentGraphView ? selectedGraphRunByView[currentGraphView.key] : undefined,
  };
}

export function getSelectedGraphRunId(
  graphRuns: GraphRunRecord[] | undefined,
  selectedGraphRun: GraphRunSelection | undefined,
): GraphRunId | undefined {
  if (!graphRuns?.length) {
    return undefined;
  }

  if (selectedGraphRun == null || selectedGraphRun === 'latest') {
    return graphRuns[graphRuns.length - 1]?.graphRunId;
  }

  return graphRuns.some((graphRun) => graphRun.graphRunId === selectedGraphRun)
    ? selectedGraphRun
    : graphRuns[graphRuns.length - 1]?.graphRunId;
}

export function filterProcessDataForSelection(options: {
  graphRuns?: GraphRunRecord[];
  processData?: ProcessDataForNode[];
  selectedGraphRun?: GraphRunSelection;
}): ProcessDataForNode[] | undefined {
  const { graphRuns, processData, selectedGraphRun } = options;
  if (!processData?.length) {
    return undefined;
  }

  const selectedGraphRunId = getSelectedGraphRunId(graphRuns, selectedGraphRun);
  if (!selectedGraphRunId) {
    return processData;
  }

  const graphRunFiltered = processData.filter(
    (process) => process.graphRunId == null || process.graphRunId === selectedGraphRunId,
  );
  return graphRunFiltered.length > 0 ? graphRunFiltered : processData;
}

export function getSelectedProcessData(
  processData: ProcessDataForNode[] | undefined,
  selectedPage: PageValue,
  options?: {
    graphRuns?: GraphRunRecord[];
    selectedGraphRun?: GraphRunSelection;
  },
): ProcessDataForNode | undefined {
  const filteredProcessData = filterProcessDataForSelection({
    graphRuns: options?.graphRuns,
    processData,
    selectedGraphRun: options?.selectedGraphRun,
  });

  if (!filteredProcessData?.length) {
    return undefined;
  }

  if (filteredProcessData.length === 1) {
    return filteredProcessData[0];
  }

  return filteredProcessData[selectedPage === 'latest' ? filteredProcessData.length - 1 : selectedPage];
}

export function getSelectedProcessRun(
  processData: ProcessDataForNode[] | undefined,
  selectedPage: PageValue,
  options?: Parameters<typeof getSelectedProcessData>[2],
): NodeRunDataWithRefs | undefined {
  return getSelectedProcessData(processData, selectedPage, options)?.data;
}

export function getNodeExecutionClassFlags(runData: NodeRunDataWithRefs | undefined) {
  const status = runData?.status?.type;

  return {
    success: status === 'ok',
    error: status === 'error',
    running: status === 'running',
    'not-ran': status === 'notRan',
  };
}

export function getActionBarExecutionState(options: {
  graphPaused: boolean;
  graphRunning: boolean;
  selectedExecutor: DefaultExecutor;
  session: ExecutorSessionState;
}) {
  const { graphPaused, graphRunning, selectedExecutor, session } = options;
  const canRun = session.status === 'ready' || selectedExecutor === 'browser';
  const isActuallyRemoteDebugging = session.status !== 'idle' && !session.isInternalExecutor;
  const showRemoteDebuggerBanner = isActuallyRemoteDebugging || (!session.isInternalExecutor && session.reconnecting);

  return {
    canRun,
    graphPaused,
    graphRunning,
    isActuallyRemoteDebugging,
    showRemoteDebuggerBanner,
  };
}

export function shouldUseRemoteExecutor(options: {
  selectedExecutor: DefaultExecutor;
  session: Pick<ExecutorSessionState, 'status'>;
}) {
  return options.selectedExecutor === 'nodejs' || options.session.status === 'ready';
}
