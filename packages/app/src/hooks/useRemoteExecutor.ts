import {
  logRuntimeDebug,
  logRuntimeInfo,
  type CodeConsoleMessage,
  type NodeId,
  type RemoteRunRequestId,
  type StringArrayDataValue,
  type GraphId,
} from '@rivet2/rivet-core';
import { useCurrentExecution } from './useCurrentExecution';
import { graphState } from '../state/graph';
import { settingsState } from '../state/settings';
import { useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { useRemoteDebugger } from './useRemoteDebugger';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri';
import { loadedProjectState, projectContextState, projectDataState, projectState } from '../state/savedGraphs';
import { useStableCallback } from './useStableCallback';
import { toast } from 'react-toastify';
import { trivetState } from '../state/trivet';
import { runTrivet } from '@rivet2/trivet';
import { produce } from 'immer';
import { userInputModalQuestionsState } from '../state/userInput';
import { lastRunDataByNodeState } from '../state/dataFlow';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { setUserInputSubmitHandler } from '../state/actions/userInputActions';
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
import { getLLMChatV2CustomProviderApiKeyEnvVarNames } from '../utils/chatV2CustomProviderEnv.js';
import { useEnvironmentProvider } from '../providers/ProvidersContext.js';
import { pluginsState } from '../state/plugins.js';
import { withDerivedProjectPluginSpecs } from '../utils/pluginUsage.js';

export function useRemoteExecutor() {
  const executorSession = useExecutorSessionRuntime();
  const environmentProvider = useEnvironmentProvider();
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
  const lastRunData = useAtomValue(lastRunDataByNodeState);
  const loadedProject = useAtomValue(loadedProjectState);
  const pluginStates = useAtomValue(pluginsState);

  const remoteDebugger = useRemoteDebugger({
    onDisconnect: () => {
      activeGraphRequestIdRef.current = null;
      currentExecution.onStop();
    },
  });

  const eventDispatcher = createProcessEventDispatcher(currentExecution);

  useEffect(() => {
    return executorSession.subscribeMessages((message, data, requestId) => {
      const shouldDispatchExecutionEvent = requestId == null || requestId === activeGraphRequestIdRef.current;

      switch (message) {
        case 'codeConsole':
          if (shouldDispatchExecutionEvent) {
            logCodeConsoleMessage(data as CodeConsoleMessage);
          }
          break;
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
        case 'graphError':
          if (shouldDispatchExecutionEvent) {
            eventDispatcher.graphError(data);
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
            logRuntimeDebug('Remote graph trace', { trace: data });
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
      logRuntimeDebug('Remote graph run skipped because executor session is not ready.', {
        status: executorSession.getRuntimeState().status,
      });
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
      const projectWithCurrentGraph = withDerivedProjectPluginSpecs(
        {
          ...project,
          graphs: {
            ...project.graphs,
            [graph.metadata!.id!]: graph,
          },
        },
        {
          appPluginStates: pluginStates,
          currentGraph: graph,
          registry: projectNodeRegistry,
        },
      );

      if (remoteDebugger.sessionState.remoteUploadAllowed) {
        const projectToUpload = projectWithCurrentGraph;

        remoteDebugger.send('set-dynamic-data', {
          project: projectToUpload,
          settings: await fillMissingSettingsFromEnvironmentVariables(savedSettings, projectNodeRegistry.getPlugins(), {
            environmentProvider,
            extraEnvVarNames: getLLMChatV2CustomProviderApiKeyEnvVarNames(projectToUpload),
          }),
        });

        for (const [id, dataValue] of Object.entries(projectData ?? {})) {
          remoteDebugger.sendRaw(`set-static-data:${id}:${dataValue}`);
        }
      }

      const contextValues = getContextValues(projectContext);
      const requestId = executorSession.createRemoteExecutionRequest();
      activeGraphRequestIdRef.current = requestId;

      if (options.from) {
        const dependencyNodes = getDependencyNodesForRunFrom(
          projectWithCurrentGraph,
          graph.metadata!.id!,
          options.from,
          projectNodeRegistry,
        );
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
        useEditorCache: true,
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
      logRuntimeInfo('Running remote Trivet tests', {
        selectedTestSuiteCount: options.testSuiteIds?.length,
        selectedTestCaseCount: options.testCaseIds?.length,
        iterationCount: options.iterationCount ?? 1,
      });
      currentExecution.onTrivetStart();

      setTrivetState((s) => ({
        ...s,
        runningTests: true,
        recentTestResults: undefined,
      }));
      const testSuitesToRun = selectTestSuitesToRun(testSuites, options);
      try {
        const projectForTests = withDerivedProjectPluginSpecs(
          {
            ...project,
            graphs: {
              ...project.graphs,
              [graph.metadata!.id!]: graph,
            },
          },
          {
            appPluginStates: pluginStates,
            currentGraph: graph,
            registry: projectNodeRegistry,
          },
        );

        const result = await runTrivet({
          project: projectForTests,
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
              const projectToUpload = withDerivedProjectPluginSpecs(
                {
                  ...project,
                  graphs: {
                    ...project.graphs,
                    [graph.metadata!.id!]: graph,
                  },
                },
                {
                  appPluginStates: pluginStates,
                  currentGraph: graph,
                  registry: projectNodeRegistry,
                },
              );

              remoteDebugger.send('set-dynamic-data', {
                project: projectToUpload,
                settings: await fillMissingSettingsFromEnvironmentVariables(
                  savedSettings,
                  projectNodeRegistry.getPlugins(),
                  {
                    environmentProvider,
                    extraEnvVarNames: getLLMChatV2CustomProviderApiKeyEnvVarNames(projectToUpload),
                  },
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
        logRuntimeInfo('Finished remote Trivet tests', {
          testSuiteCount: result.testSuiteResults.length,
          passingTestSuiteCount: result.testSuiteResults.filter((testSuite) => testSuite.passing).length,
          iterationCount: result.iterationCount,
        });
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
    logRuntimeInfo('Aborting via remote debugger');
    remoteDebugger.send('abort', undefined);
  }

  function tryPauseGraph() {
    logRuntimeInfo('Pausing via remote debugger');
    remoteDebugger.send('pause', undefined);
  }

  function tryResumeGraph() {
    logRuntimeInfo('Resuming via remote debugger');
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

function logCodeConsoleMessage(message: CodeConsoleMessage) {
  switch (message.level) {
    case 'debug':
      console.debug(...message.args);
      break;
    case 'error':
      console.error(...message.args);
      break;
    case 'info':
      console.info(...message.args);
      break;
    case 'warn':
      console.warn(...message.args);
      break;
    case 'log':
    default:
      console.log(...message.args);
      break;
  }
}
