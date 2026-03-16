import type { ProcessDataForNode, NodeRunDataWithRefs, PageValue } from '../dataFlow.js';
import type { DefaultExecutor } from '../settings.js';
import type { ExecutorSessionState } from '../../hooks/executorSession.js';

export function getSelectedProcessData(
  processData: ProcessDataForNode[] | undefined,
  selectedPage: PageValue,
): ProcessDataForNode | undefined {
  if (!processData?.length) {
    return undefined;
  }

  if (processData.length === 1) {
    return processData[0];
  }

  return processData[selectedPage === 'latest' ? processData.length - 1 : selectedPage];
}

export function getSelectedProcessRun(
  processData: ProcessDataForNode[] | undefined,
  selectedPage: PageValue,
): NodeRunDataWithRefs | undefined {
  return getSelectedProcessData(processData, selectedPage)?.data;
}

export function getNodeExecutionStatus(runData: NodeRunDataWithRefs | undefined) {
  return runData?.status?.type;
}

export function getNodeExecutionClassFlags(runData: NodeRunDataWithRefs | undefined) {
  const status = getNodeExecutionStatus(runData);

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
