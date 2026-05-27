import {
  GraphProcessor,
  type NodeId,
  type StringArrayDataValue,
  type DataValue,
  coerceTypeOptional,
  ExecutionRecorder,
  createFrozenNodeOutputResolver,
  type GraphOutputs,
  type GraphId,
  type ProcessEvents,
  GptTokenizerTokenizer,
  logRuntimeDebug,
  logRuntimeError,
  logRuntimeInfo,
} from '@valerypopoff/rivet2-core';
import { produce } from 'immer';
import { useRef } from 'react';
import { toast } from 'react-toastify';
import { TauriNativeApi } from '../model/native/TauriNativeApi';
import { useStableCallback } from './useStableCallback';
import { useSaveCurrentGraph } from './useSaveCurrentGraph';
import { useCurrentExecution } from './useCurrentExecution';
import { userInputModalQuestionsState } from '../state/userInput';
import { loadedProjectState, projectContextState, projectDataState, projectState } from '../state/savedGraphs';
import { recordExecutionsState, settingsState, showNodeRunDurationsState } from '../state/settings';
import { graphState } from '../state/graph';
import { lastRecordingState, loadedRecordingState } from '../state/execution';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri';
import { getLLMChatV2CustomProviderApiKeyEnvVarNames } from '../utils/chatV2CustomProviderEnv';
import { trivetState } from '../state/trivet';
import { runTrivet } from '@valerypopoff/trivet';
import { frozenNodeOutputsState, lastRunDataByNodeState } from '../state/dataFlow';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { TauriProjectReferenceLoader } from '../model/TauriProjectReferenceLoader';
import {
  useAudioProvider,
  useDatasetProvider,
  useEnvironmentProvider,
  usePathPolicyProvider,
} from '../providers/ProvidersContext';
import { setUserInputSubmitHandler } from '../state/actions/userInputActions';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';
import { handleError } from '../utils/errorHandling.js';
import { getDependentDataForNodeForPreload, getEditorRunFromPlan, getEditorRunToPlan } from './remoteExecutorHelpers.js';
import { pluginsState } from '../state/plugins.js';
import { withDerivedProjectPluginSpecs } from '../utils/pluginUsage.js';
import { getProjectContextValues } from '../utils/projectContextValues.js';
import { cloneFrozenNodeOutputsForExecutor } from '../utils/frozenNodeOutputs.js';

/**
 * Yield to the macrotask queue so the browser can repaint.
 *
 * In browser execution mode, GraphProcessor runs in the same thread.  Emittery
 * defers all listeners to microtasks (`await resolvedPromise`), and PQueue
 * chains node processing as further microtasks.  React 18 batches state updates
 * and only commits + paints at macrotask boundaries, so intermediate states
 * (e.g. "running" indicators) are invisible without explicit yields.
 *
 * In contrast, Node execution mode delivers events as separate WebSocket
 * messages (macrotasks), giving the browser natural repaint opportunities.
 *
 * `MessageChannel` posts a macrotask with near-zero latency (unlike
 * `setTimeout(0)` which has a >=4 ms minimum).  By returning a Promise that
 * resolves on the next macrotask, any `await yieldToMacrotask()` inside an
 * Emittery listener pauses the GraphProcessor (which `await`s the `emit()`
 * call), lets React flush and the browser repaint, then resumes processing.
 */
function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(undefined);
  });
}

export function useLocalExecutor() {
  const audioProvider = useAudioProvider();
  const datasetProvider = useDatasetProvider();
  const environmentProvider = useEnvironmentProvider();
  const pathPolicy = usePathPolicyProvider();
  const projectNodeRegistry = useProjectNodeRegistry();
  const project = useAtomValue(projectState);
  const graph = useAtomValue(graphState);
  const currentProcessor = useRef<GraphProcessor | null>(null);
  const saveGraph = useSaveCurrentGraph();
  const currentExecution = useCurrentExecution();
  const setUserInputQuestions = useSetAtom(userInputModalQuestionsState);
  const savedSettings = useAtomValue(settingsState);
  const loadedRecording = useAtomValue(loadedRecordingState);
  const setLastRecordingState = useSetAtom(lastRecordingState);
  const [{ testSuites }, setTrivetState] = useAtom(trivetState);
  const recordExecutions = useAtomValue(recordExecutionsState);
  const showNodeRunDurations = useAtomValue(showNodeRunDurationsState);
  const projectData = useAtomValue(projectDataState);
  const projectContext = useAtomValue(projectContextState(project.metadata.id));
  const lastRunData = useAtomValue(lastRunDataByNodeState);
  const frozenNodeOutputs = useAtomValue(frozenNodeOutputsState);
  const loadedProject = useAtomValue(loadedProjectState);
  const pluginStates = useAtomValue(pluginsState);
  const editorExecutionCachesByProjectId = useRef(new Map<string, Map<string, unknown>>());

  function getEditorExecutionCache(projectId: string) {
    let cache = editorExecutionCachesByProjectId.current.get(projectId);

    if (!cache) {
      cache = new Map<string, unknown>();
      editorExecutionCachesByProjectId.current.set(projectId, cache);
    }

    return cache;
  }

  function attachGraphEvents(processor: GraphProcessor) {
    // nodeStart and nodeFinish use awaited emit in GraphProcessor, so returning
    // a Promise here pauses the processor until the macrotask yield completes,
    // giving the browser a chance to repaint with updated React state.
    processor.on('nodeStart', async (data: ProcessEvents['nodeStart']) => {
      currentExecution.onNodeStart(data);
      await yieldToMacrotask();
    });
    processor.on('nodeFinish', async (data: ProcessEvents['nodeFinish']) => {
      currentExecution.onNodeFinish(data);
      await yieldToMacrotask();
    });
    processor.on('nodeError', currentExecution.onNodeError);

    setUserInputSubmitHandler((nodeId: NodeId, answers: StringArrayDataValue) => {
      processor.userInput(nodeId, answers);
      setUserInputQuestions((q) =>
        produce(q, (draft) => {
          delete draft[nodeId];
        }),
      );
    });

    processor.on('userInput', currentExecution.onUserInput);
    // start and graphStart are already awaited by GraphProcessor, so yielding
    // here also creates a macrotask boundary before node processing begins.
    processor.on('start', async (data: ProcessEvents['start']) => {
      currentExecution.onStart(data);
      await yieldToMacrotask();
    });
    processor.on('done', currentExecution.onDone);
    processor.on('abort', currentExecution.onAbort);
    processor.on('graphAbort', currentExecution.onGraphAbort);
    processor.on('graphError', currentExecution.onGraphError);
    processor.on('partialOutput', currentExecution.onPartialOutput);
    processor.on('graphStart', async (data: ProcessEvents['graphStart']) => {
      currentExecution.onGraphStart(data);
      await yieldToMacrotask();
    });
    processor.on('graphFinish', currentExecution.onGraphFinish);
    processor.on('nodeOutputsCleared', currentExecution.onNodeOutputsCleared);
    processor.on('trace', (trace) => logRuntimeDebug('Local graph trace', { trace }));
    processor.on('pause', currentExecution.onPause);
    processor.on('resume', currentExecution.onResume);
    processor.on('error', currentExecution.onError);
    processor.on('nodeExcluded', currentExecution.onNodeExcluded);

    processor.onUserEvent('toast', (data: DataValue | undefined) => {
      const stringData = coerceTypeOptional(data, 'string');
      toast(stringData ?? 'Toast called, but no message was provided');
    });

    currentProcessor.current = processor;
  }

  const tryRunGraph = useStableCallback(
    async (
      options: {
        graphId?: GraphId;
        to?: NodeId[];
        from?: NodeId;
      } = {},
    ) => {
      try {
        const savedGraph = saveGraph() ?? graph;

        const graphToRun = options.graphId ?? graph.metadata!.id!;

        if (currentProcessor.current?.isRunning) {
          return;
        }

        const tempProject = withDerivedProjectPluginSpecs(
          {
            ...project,
            // Include the just-saved version of the currently selected graph, because saveGraph won't update the `project` until next render
            graphs: {
              ...project.graphs,
              [savedGraph.metadata!.id!]: savedGraph,
            },
            data: projectData,
          },
          {
            appPluginStates: pluginStates,
            currentGraph: savedGraph,
            registry: projectNodeRegistry,
          },
        );

        const recorder = new ExecutionRecorder();
        const processor = new GraphProcessor(tempProject, graphToRun, projectNodeRegistry, true, {
          captureNodeTimings: showNodeRunDurations,
        });
        processor.executor = 'browser';
        processor.recordingPlaybackChatLatency = savedSettings.recordingPlaybackLatency ?? 1000;

        if (options.from) {
          const runFromPlan = getEditorRunFromPlan(tempProject, graphToRun, options.from, projectNodeRegistry);
          processor.runToNodeIds = runFromPlan.runToNodeIds;
          const preloadData = getDependentDataForNodeForPreload(
            runFromPlan.preloadNodeIds,
            lastRunData,
            loadedRecording ? undefined : { frozenNodeOutputs, graphId: graphToRun },
          );
          for (const [nodeId, outputs] of Object.entries(preloadData)) {
            processor.preloadNodeData(nodeId as NodeId, outputs);
          }
          currentExecution.preserveNodeRunDataForNextStart(runFromPlan.preserveNodeIds);
          currentExecution.suppressPreloadedNodeEventsForCurrentRun(runFromPlan.preloadNodeIds);
        } else if (options.to) {
          const runToPlan = getEditorRunToPlan(
            tempProject,
            graphToRun,
            options.to,
            projectNodeRegistry,
            loadedRecording ? undefined : { frozenNodeOutputs },
          );
          processor.runToNodeIds = runToPlan.runToNodeIds;
          currentExecution.preserveNodeRunDataForNextStart(runToPlan.preserveNodeIds);
        }

        if (recordExecutions) {
          recorder.record(processor);
        }

        attachGraphEvents(processor);

        let results: GraphOutputs;

        if (loadedRecording) {
          results = await processor.replayRecording(loadedRecording.recorder);
        } else {
          processor.setFrozenNodeOutputResolver(
            createFrozenNodeOutputResolver(cloneFrozenNodeOutputsForExecutor(frozenNodeOutputs)),
          );
          const contextValues = getProjectContextValues(projectContext);

          results = await processor.processGraph(
            {
              settings: await fillMissingSettingsFromEnvironmentVariables(
                savedSettings,
                projectNodeRegistry.getPlugins(),
                {
                  environmentProvider,
                  extraEnvVarNames: getLLMChatV2CustomProviderApiKeyEnvVarNames(tempProject),
                },
              ),
              nativeApi: new TauriNativeApi(),
              datasetProvider,
              audioProvider,
              tokenizer: new GptTokenizerTokenizer(),
              projectPath: loadedProject.path ?? undefined,
              projectReferenceLoader: new TauriProjectReferenceLoader(pathPolicy),
              editorExecutionCache: getEditorExecutionCache(tempProject.metadata.id),
            },
            {},
            contextValues,
          );
        }

        if (recordExecutions) {
          setLastRecordingState(recorder.serialize());
        }
      } catch (e) {
        currentExecution.clearNodeRunDataPreservationForNextStart();
        if (options.from) {
          handleError(e, 'Failed to start local run from here');
          return;
        }

        logRuntimeError('Local graph run failed.', e);
      }
    },
  );

  const tryRunTests = useStableCallback(
    async (options: { testSuiteIds?: string[]; testCaseIds?: string[]; iterationCount?: number } = {}) => {
      toast.info(
        (options.iterationCount ?? 1) > 1 ? `Running Tests (${options.iterationCount!} iterations)` : 'Running Tests',
      );
      logRuntimeInfo('Running local Trivet tests', {
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
      const testSuitesToRun = options.testSuiteIds
        ? testSuites
            .filter((t) => options.testSuiteIds!.includes(t.id))
            .map((t) => ({
              ...t,
              testCases: options.testCaseIds
                ? t.testCases.filter((tc) => options.testCaseIds?.includes(tc.id))
                : t.testCases,
            }))
        : testSuites;
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
            const processor = new GraphProcessor(project, graphId, projectNodeRegistry, true, {
              captureNodeTimings: showNodeRunDurations,
            });
            processor.executor = 'browser';
            attachGraphEvents(processor);
            const contextValues = getProjectContextValues(projectContext);
            return processor.processGraph(
              {
                settings: await fillMissingSettingsFromEnvironmentVariables(
                  savedSettings,
                  projectNodeRegistry.getPlugins(),
                  {
                    environmentProvider,
                    extraEnvVarNames: getLLMChatV2CustomProviderApiKeyEnvVarNames(project),
                  },
                ),
                nativeApi: new TauriNativeApi(),
                datasetProvider,
                audioProvider,
                tokenizer: new GptTokenizerTokenizer(),
              },
              inputs,
              contextValues,
            );
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
        logRuntimeInfo('Finished local Trivet tests', {
          testSuiteCount: result.testSuiteResults.length,
          passingTestSuiteCount: result.testSuiteResults.filter((testSuite) => testSuite.passing).length,
          iterationCount: result.iterationCount,
        });
      } catch (e) {
        setTrivetState((s) => ({
          ...s,
          runningTests: false,
        }));
        handleError(e, 'Failed to run local tests');
      }
    },
  );

  function tryAbortGraph() {
    currentProcessor.current?.abort();
  }

  function tryPauseGraph() {
    currentProcessor.current?.pause();
  }

  function tryResumeGraph() {
    currentProcessor.current?.resume();
  }

  return {
    tryRunGraph,
    tryAbortGraph,
    tryPauseGraph,
    tryResumeGraph,
    tryRunTests,
  };
}
