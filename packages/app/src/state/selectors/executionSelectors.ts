import type { GraphRunRecord, GraphRunSelection, ProcessDataForNode, NodeRunDataWithRefs, PageValue } from '../dataFlow.js';
import type { GraphRunId } from '@valerypopoff/rivet2-core';
import type { DefaultExecutor } from '../settings.js';
import type { ExecutorSessionState } from '../../hooks/executorSession.js';
import type { GraphViewContext, GraphViewKey } from '../../domain/graphEditing/navigationActions.js';

export type ExecutorProductState =
  | { type: 'browser-ready' }
  | { type: 'external-debugger-connecting' }
  | { type: 'external-debugger-idle' }
  | { type: 'external-debugger-ready' }
  | { type: 'internal-node-ready' }
  | { type: 'internal-node-reconnecting' }
  | { type: 'internal-node-starting' }
  | { type: 'recording-playback-ready' };

export type RemoteDebuggerBannerState = {
  isPending: boolean;
  label: string;
};

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

      if (currentGraphView.parent) {
        const executor = graphRun.executor;
        if (
          !executor ||
          executor.nodeId !== currentGraphView.parent.parentNodeId ||
          executor.parentGraphId !== currentGraphView.parent.parentGraphId
        ) {
          continue;
        }
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
    interrupted: status === 'interrupted',
    running: status === 'running',
    'not-ran': status === 'notRan',
  };
}

export function getActionBarExecutionState(options: {
  graphPaused: boolean;
  graphRunning: boolean;
  hasLoadedRecording?: boolean;
  recordingPlaybackStarting?: boolean;
  selectedExecutor: DefaultExecutor;
  session: ExecutorSessionState;
}) {
  const {
    graphPaused,
    graphRunning,
    hasLoadedRecording = false,
    recordingPlaybackStarting: recordingPlaybackStartingInput = false,
    selectedExecutor,
    session,
  } = options;
  const executorProductState = getExecutorProductState({ hasLoadedRecording, selectedExecutor, session });
  const recordingPlaybackStarting = hasLoadedRecording && recordingPlaybackStartingInput && !graphRunning;
  const canRun = isRunnableExecutorProductState(executorProductState) && !recordingPlaybackStarting;
  const isActuallyRemoteDebugging = isExternalDebuggerProductState(executorProductState);
  const showRunButton = !isActuallyRemoteDebugging && (selectedExecutor === 'nodejs' || canRun || recordingPlaybackStarting);
  const remoteDebuggerBanner = getRemoteDebuggerBannerState(executorProductState);
  const showRemoteDebuggerBanner = remoteDebuggerBanner != null;
  const executorLoading =
    !graphRunning &&
    (executorProductState.type === 'internal-node-reconnecting' ||
      executorProductState.type === 'internal-node-starting');
  const runButtonLoading = executorLoading || recordingPlaybackStarting;

  return {
    canRun,
    executorLoading,
    executorProductState,
    graphPaused,
    graphRunning,
    isActuallyRemoteDebugging,
    remoteDebuggerBanner,
    runButtonLoading,
    showRunButton,
    showRemoteDebuggerBanner,
  };
}

export function getExecutorProductState(options: {
  hasLoadedRecording?: boolean;
  selectedExecutor: DefaultExecutor;
  session: Pick<ExecutorSessionState, 'capabilities' | 'status' | 'target'>;
}): ExecutorProductState {
  const { hasLoadedRecording = false, selectedExecutor, session } = options;

  if (session.target?.type === 'external-debugger') {
    if (session.status === 'ready' && session.capabilities.canSendRun) {
      return { type: 'external-debugger-ready' };
    }

    if (session.status === 'idle') {
      return { type: 'external-debugger-idle' };
    }

    return { type: 'external-debugger-connecting' };
  }

  if (hasLoadedRecording) {
    return { type: 'recording-playback-ready' };
  }

  if (selectedExecutor === 'nodejs') {
    if (session.target?.type === 'internal-desktop' || session.target?.type === 'internal-hosted') {
      if (session.status === 'ready' && session.capabilities.canSendRun) {
        return { type: 'internal-node-ready' };
      }

      if (session.status === 'reconnecting') {
        return { type: 'internal-node-reconnecting' };
      }
    }

    return { type: 'internal-node-starting' };
  }

  return { type: 'browser-ready' };
}

export function isExternalDebuggerProductState(state: ExecutorProductState) {
  return state.type === 'external-debugger-connecting' || state.type === 'external-debugger-ready';
}

export function isRunnableExecutorProductState(state: ExecutorProductState) {
  return (
    state.type === 'browser-ready' ||
    state.type === 'external-debugger-ready' ||
    state.type === 'internal-node-ready' ||
    state.type === 'recording-playback-ready'
  );
}

export function getRemoteDebuggerBannerState(state: ExecutorProductState): RemoteDebuggerBannerState | null {
  switch (state.type) {
    case 'external-debugger-ready':
      return {
        isPending: false,
        label: 'Stop Remote Debugger',
      };
    case 'external-debugger-connecting':
      return {
        isPending: true,
        label: 'Remote Debugger (Connecting...)',
      };
    default:
      return null;
  }
}

export function canRunGraphFromEditor(options: {
  hasLoadedRecording?: boolean;
  selectedExecutor: DefaultExecutor;
  session: Pick<ExecutorSessionState, 'capabilities' | 'status' | 'target'>;
}) {
  const executorProductState = getExecutorProductState({
    hasLoadedRecording: options.hasLoadedRecording,
    selectedExecutor: options.selectedExecutor,
    session: options.session,
  });

  return !isExternalDebuggerProductState(executorProductState);
}

export function shouldUseRemoteExecutor(options: {
  hasLoadedRecording?: boolean;
  selectedExecutor: DefaultExecutor;
  session: Pick<ExecutorSessionState, 'capabilities' | 'status' | 'target'>;
}) {
  if (options.hasLoadedRecording) {
    return false;
  }

  const executorProductState = getExecutorProductState({
    selectedExecutor: options.selectedExecutor,
    session: options.session,
  });

  return options.selectedExecutor === 'nodejs' || executorProductState.type === 'external-debugger-ready';
}
