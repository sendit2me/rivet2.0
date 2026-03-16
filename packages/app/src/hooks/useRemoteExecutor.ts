import {
  type NodeId,
  type StringArrayDataValue,
  globalRivetNodeRegistry,
  type GraphId,
} from '@ironclad/rivet-core';
import { useCurrentExecution } from './useCurrentExecution';
import { graphState } from '../state/graph';
import { defaultExecutorState, settingsState } from '../state/settings';
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
import {
  INTERNAL_EXECUTOR_URL,
  createPendingGraphExecution,
  isExecutorSessionReady,
  rejectPendingGraphExecution,
  resolvePendingGraphExecution,
  subscribeExecutorSessionMessages,
} from './executorSession';
import { useEffect } from 'react';
import {
  createProcessEventDispatcher,
  getContextValues,
  getDependencyNodesForRunFrom,
  getDependentDataForNodeForPreload,
  selectTestSuitesToRun,
} from './remoteExecutorHelpers.js';

export function useRemoteExecutor() {
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
      currentExecution.onStop();

      // If we're using the node executor, disconnecting means reconnecting to the internal executor
      if (selectedExecutor === 'nodejs') {
        remoteDebugger.connect(INTERNAL_EXECUTOR_URL);
      }
    },
  });

  const eventDispatcher = createProcessEventDispatcher(currentExecution);

  useEffect(() => {
    return subscribeExecutorSessionMessages((message, data) => {
      switch (message) {
        case 'nodeStart':
          eventDispatcher.nodeStart(data);
          break;
        case 'nodeFinish':
          eventDispatcher.nodeFinish(data);
          break;
        case 'nodeError':
          eventDispatcher.nodeError(data);
          break;
        case 'userInput':
          eventDispatcher.userInput(data);
          break;
        case 'start':
          eventDispatcher.start(data);
          break;
        case 'done':
          resolvePendingGraphExecution((data as { results: unknown }).results as any);
          eventDispatcher.done(data);
          break;
        case 'abort':
          rejectPendingGraphExecution(new Error('graph execution aborted'));
          eventDispatcher.abort(data);
          break;
        case 'graphAbort':
          eventDispatcher.graphAbort(data);
          break;
        case 'partialOutput':
          eventDispatcher.partialOutput(data);
          break;
        case 'graphStart':
          eventDispatcher.graphStart(data);
          break;
        case 'graphFinish':
          eventDispatcher.graphFinish(data);
          break;
        case 'nodeOutputsCleared':
          eventDispatcher.nodeOutputsCleared(data);
          break;
        case 'trace':
          console.log(`remote: ${data}`);
          break;
        case 'pause':
          eventDispatcher.pause();
          break;
        case 'resume':
          eventDispatcher.resume();
          break;
        case 'error':
          rejectPendingGraphExecution((data as { error: Error }).error);
          eventDispatcher.error(data);
          break;
        case 'nodeExcluded':
          eventDispatcher.nodeExcluded(data);
          break;
      }
    });
  }, [eventDispatcher]);

  const tryRunGraph = async (options: { to?: NodeId[]; from?: NodeId; graphId?: GraphId } = {}) => {
    if (!isExecutorSessionReady()) {
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
            globalRivetNodeRegistry.getPlugins(),
          ),
        });

        for (const [id, dataValue] of Object.entries(projectData ?? {})) {
          remoteDebugger.sendRaw(`set-static-data:${id}:${dataValue}`);
        }
      }

      const contextValues = getContextValues(projectContext);

      if (options.from) {
        const dependencyNodes = getDependencyNodesForRunFrom(project, graph.metadata!.id!, options.from);
        const preloadData = getDependentDataForNodeForPreload(dependencyNodes, lastRunData);

        remoteDebugger.send('preload', { nodeData: preloadData });
      }

      remoteDebugger.send('run', {
        graphId: graphToRun,
        runToNodeIds: options.to,
        contextValues,
        runFromNodeId: options.from,
        projectPath: loadedProject.path,
      });
    } catch (e) {
      console.error(e);
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
                  globalRivetNodeRegistry.getPlugins(),
                ),
              });
            }

            const pendingResults = createPendingGraphExecution();

            const contextValues = getContextValues(projectContext);

            remoteDebugger.send('run', { graphId, inputs, contextValues, projectPath: loadedProject.path });

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
        console.log(e);
        setTrivetState((s) => ({
          ...s,
          runningTests: false,
        }));
        toast.error('Error running tests');
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
