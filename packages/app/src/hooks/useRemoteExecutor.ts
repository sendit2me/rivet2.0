import {
  type NodeId,
  type RemoteRunRequestId,
  type StringArrayDataValue,
  type GraphId,
} from '@ironclad/rivet-core';
import { useCurrentExecution } from './useCurrentExecution';
import { graphState } from '../state/graph';
import { defaultExecutorState, settingsState } from '../state/settings';
import { useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { useRemoteDebugger } from './useRemoteDebugger';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri';
import { loadedProjectState, projectContextState, projectDataState, projectState } from '../state/savedGraphs';
import { useStableCallback } from './useStableCallback';
import { toast } from 'react-toastify';
import { trivetState } from '../state/trivet';
import { runTrivet } from '@ironclad/trivet';
import { produce } from 'immer';
import { userInputModalQuestionsState } from '../state/userInput';
import { lastRunDataByNodeState } from '../state/dataFlow';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { setUserInputSubmitHandler } from '../state/actions/userInputActions';
import { INTERNAL_EXECUTOR_URL } from './executorSession';
import { useEffect, useRef } from 'react';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';
import {
  createProcessEventDispatcher,
  getContextValues,
  getDependencyNodesForRunFrom,
  getDependentDataForNodeForPreload,
  selectTestSuitesToRun,
} from './remoteExecutorHelpers.js';
import { handleError } from '../utils/errorHandling.js';

export function useRemoteExecutor() {
  const executorSession = useExecutorSessionRuntime();
  const activeGraphRequestIdRef = useRef<RemoteRunRequestId | null>(null);
  const projectNodeRegistry = useProjectNodeRegistry();
  const project = useAtomValue(projectState);
  const projectData = useAtomValue(projectDataState);

  const projectContext = useAtomValue(projectContextState(project.metadata.id));

  const currentExecution = useCurrentExecution();
  const graph = useAtomValue(graphState);
  const savedSettings = useAtomValue(settingsState);
  const [{ testSuites }, setTrivetState] = useAtom(trivetState);
  const setUserInputQuestions = useSetAtom(userInputModalQuestionsState);
  const selectedExecutor = useAtomValue(defaultExecutorState);
  const lastRunData = useAtomValue(lastRunDataByNodeState);
  const loadedProject = useAtomValue(loadedProjectState);

  const remoteDebugger = useRemoteDebugger({
    onDisconnect: () => {
      activeGraphRequestIdRef.current = null;
      currentExecution.onStop();

      // If we're using the node executor, disconnecting means reconnecting to the internal executor
      if (selectedExecutor === 'nodejs') {
        remoteDebugger.connect(INTERNAL_EXECUTOR_URL);
      }
    },
  });

  const eventDispatcher = createProcessEventDispatcher(currentExecution);

  useEffect(() => {
    return executorSession.subscribeMessages((message, data, requestId) => {
      const shouldDispatchExecutionEvent = requestId == null || requestId === activeGraphRequestIdRef.current;

      switch (message) {
        case 'nodeStart':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.nodeStart(data);
          }
          break;
        case 'nodeFinish':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.nodeFinish(data);
          }
          break;
        case 'nodeError':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.nodeError(data);
          }
          break;
        case 'userInput':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.userInput(data);
          }
          break;
        case 'start':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.start(data);
          }
          break;
        case 'done':
          executorSession.resolvePendingGraphExecution(requestId, (data as { results: unknown }).results as any);
          if (requestId === activeGraphRequestIdRef.current) {
            activeGraphRequestIdRef.current = null;
          }
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.done(data);
          }
          break;
        case 'abort':
          executorSession.rejectPendingGraphExecution(requestId, new Error('graph execution aborted'));
          if (requestId === activeGraphRequestIdRef.current) {
            activeGraphRequestIdRef.current = null;
          }
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.abort(data);
          }
          break;
        case 'graphAbort':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.graphAbort(data);
          }
          break;
        case 'partialOutput':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.partialOutput(data);
          }
          break;
        case 'graphStart':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.graphStart(data);
          }
          break;
        case 'graphFinish':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.graphFinish(data);
          }
          break;
        case 'nodeOutputsCleared':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.nodeOutputsCleared(data);
          }
          break;
        case 'trace':
          if (shouldDispatchExecutionEvent) {
            console.log(`remote: ${data}`);
          }
          break;
        case 'pause':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.pause();
          }
          break;
        case 'resume':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.resume();
          }
          break;
        case 'error':
          executorSession.rejectPendingGraphExecution(requestId, (data as { error: Error }).error);
          if (requestId === activeGraphRequestIdRef.current) {
            activeGraphRequestIdRef.current = null;
          }
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.error(data);
          }
          break;
        case 'nodeExcluded':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.nodeExcluded(data);
          }
          break;
      }
    });
  }, [eventDispatcher, executorSession]);

  const tryRunGraph = async (options: { to?: NodeId[]; from?: NodeId; graphId?: GraphId } = {}) => {
    if (!executorSession.isReady()) {
      return;
    }

    setUserInputSubmitHandler((nodeId: NodeId, answers: StringArrayDataValue) => {
      remoteDebugger.send('user-input', { nodeId, answers });
      setUserInputQuestions((q) =>
        produce(q, (draft) => {
          delete draft[nodeId];
        }),
      );
    });

    const graphToRun = options.graphId ?? graph.metadata!.id!;

    try {
      if (remoteDebugger.sessionState.remoteUploadAllowed) {
        remoteDebugger.send('set-dynamic-data', {
          project: {
            ...project,
            graphs: {
              ...project.graphs,
              [graph.metadata!.id!]: graph,
            },
          },
          settings: await fillMissingSettingsFromEnvironmentVariables(
            savedSettings,
            projectNodeRegistry.getPlugins(),
          ),
        });

        for (const [id, dataValue] of Object.entries(projectData ?? {})) {
          remoteDebugger.sendRaw(`set-static-data:${id}:${dataValue}`);
        }
      }

      const contextValues = getContextValues(projectContext);
      const requestId = executorSession.createRemoteExecutionRequest();
      activeGraphRequestIdRef.current = requestId;

      if (options.from) {
        const dependencyNodes = getDependencyNodesForRunFrom(project, graph.metadata!.id!, options.from, projectNodeRegistry);
        const preloadData = getDependentDataForNodeForPreload(dependencyNodes, lastRunData);

        remoteDebugger.send('preload', { nodeData: preloadData });
      }

      remoteDebugger.send('run', {
        requestId,
        graphId: graphToRun,
        runToNodeIds: options.to,
        contextValues,
        runFromNodeId: options.from,
        projectPath: loadedProject.path,
      });
    } catch (e) {
      handleError(e, 'Failed to start remote graph run');
    }
    return;
  };

  const tryRunTests = useStableCallback(
    async (options: { testSuiteIds?: string[]; testCaseIds?: string[]; iterationCount?: number } = {}) => {
      toast.info(
        (options.iterationCount ?? 1) > 1 ? `Running Tests (${options.iterationCount!} iterations)` : 'Running Tests',
      );
      console.log('trying to run tests');
      currentExecution.onTrivetStart();

      setTrivetState((s) => ({
        ...s,
        runningTests: true,
        recentTestResults: undefined,
      }));
      const testSuitesToRun = selectTestSuitesToRun(testSuites, options);
      try {
        const result = await runTrivet({
          project,
          iterationCount: options.iterationCount,
          testSuites: testSuitesToRun,
          onUpdate: (results) => {
            setTrivetState((s) => ({
              ...s,
              recentTestResults: results,
            }));
          },
          runGraph: async (project, graphId, inputs) => {
            if (remoteDebugger.sessionState.remoteUploadAllowed) {
              remoteDebugger.send('set-dynamic-data', {
                project: {
                  ...project,
                  graphs: {
                    ...project.graphs,
                    [graph.metadata!.id!]: graph,
                  },
                },
                settings: await fillMissingSettingsFromEnvironmentVariables(
                  savedSettings,
                  projectNodeRegistry.getPlugins(),
                ),
              });
            }

            const { requestId, promise: pendingResults } = executorSession.createPendingGraphExecution();

            const contextValues = getContextValues(projectContext);

            remoteDebugger.send('run', { requestId, graphId, inputs, contextValues, projectPath: loadedProject.path });

            const results = await pendingResults;
            return results;
          },
        });
        setTrivetState((s) => ({
          ...s,
          recentTestResults: result,
          runningTests: false,
        }));
        toast.info(
          `Ran tests: ${result.testSuiteResults.length} tests, ${
            result.testSuiteResults.filter((t) => t.passing).length
          } passing`,
        );
        console.log(result);
      } catch (e) {
        setTrivetState((s) => ({
          ...s,
          runningTests: false,
        }));
        handleError(e, 'Failed to run remote tests');
      }
    },
  );

  function tryAbortGraph() {
    console.log('Aborting via remote debugger');
    remoteDebugger.send('abort', undefined);
  }

  function tryPauseGraph() {
    console.log('Pausing via remote debugger');
    remoteDebugger.send('pause', undefined);
  }

  function tryResumeGraph() {
    console.log('Resuming via remote debugger');
    remoteDebugger.send('resume', undefined);
  }

  return {
    remoteDebugger,
    tryRunGraph,
    tryAbortGraph,
    tryPauseGraph,
    tryResumeGraph,
    active: remoteDebugger.sessionState.status === 'ready',
    tryRunTests,
  };
}
