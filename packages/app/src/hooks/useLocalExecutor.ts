import {
  GraphProcessor,
  type NodeId,
  type StringArrayDataValue,
  type DataValue,
  coerceTypeOptional,
  ExecutionRecorder,
  type GraphOutputs,
  type GraphId,
  type ProcessEvents,
  GptTokenizerTokenizer,
} from '@ironclad/rivet-core';
import { produce } from 'immer';
import { useRef } from 'react';
import { toast } from 'react-toastify';
import { TauriNativeApi } from '../model/native/TauriNativeApi';
import { useStableCallback } from './useStableCallback';
import { useSaveCurrentGraph } from './useSaveCurrentGraph';
import { useCurrentExecution } from './useCurrentExecution';
import { userInputModalQuestionsState } from '../state/userInput';
import { loadedProjectState, projectContextState, projectDataState, projectState } from '../state/savedGraphs';
import { recordExecutionsState, settingsState } from '../state/settings';
import { graphState } from '../state/graph';
import { lastRecordingState, loadedRecordingState } from '../state/execution';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri';
import { trivetState } from '../state/trivet';
import { runTrivet } from '@ironclad/trivet';
import { entries } from '../utils/typeSafety';
import { lastRunDataByNodeState } from '../state/dataFlow';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { TauriProjectReferenceLoader } from '../model/TauriProjectReferenceLoader';
import { useAudioProvider, useDatasetProvider } from '../providers/ProvidersContext';
import { setUserInputSubmitHandler } from '../state/actions/userInputActions';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';
import { handleError } from '../utils/errorHandling.js';
import { getDependentDataForNodeForPreload } from './remoteExecutorHelpers.js';

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
 * `setTimeout(0)` which has a ≥4 ms minimum).  By returning a Promise that
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
  const projectData = useAtomValue(projectDataState);
  const projectContext = useAtomValue(projectContextState(project.metadata.id));
  const lastRunData = useAtomValue(lastRunDataByNodeState);
  const loadedProject = useAtomValue(loadedProjectState);

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
    processor.on('trace', (log) => console.log(log));
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
        saveGraph();

        const graphToRun = options.graphId ?? graph.metadata!.id!;

        if (currentProcessor.current?.isRunning) {
          return;
        }

        const tempProject = {
          ...project,
          // Include the just-saved version of the currently selected graph, because saveGraph won't update the `project` until next render
          graphs: {
            ...project.graphs,
            [graph.metadata!.id!]: graph,
          },
          data: projectData,
        };

        const recorder = new ExecutionRecorder();
        const processor = new GraphProcessor(tempProject, graphToRun, projectNodeRegistry, true);
        processor.executor = 'browser';
        processor.recordingPlaybackChatLatency = savedSettings.recordingPlaybackLatency ?? 1000;

        if (options.to) {
          processor.runToNodeIds = options.to;
        }

        if (options.from) {
          const dependencyNodes = processor.getDependencyNodesDeep(options.from);
          const preloadData = getDependentDataForNodeForPreload(dependencyNodes, lastRunData);
          for (const [nodeId, outputs] of Object.entries(preloadData)) {
            processor.preloadNodeData(nodeId as NodeId, outputs);
          }
          processor.runFromNodeId = options.from;
        }

        if (recordExecutions) {
          recorder.record(processor);
        }

        attachGraphEvents(processor);

        let results: GraphOutputs;

        if (loadedRecording) {
          results = await processor.replayRecording(loadedRecording.recorder);
        } else {
          const contextValues = entries(projectContext).reduce(
            (acc, [key, value]) => ({
              ...acc,
              [key]: value.value,
            }),
            {} as Record<string, DataValue>,
          );

          results = await processor.processGraph(
            {
              settings: await fillMissingSettingsFromEnvironmentVariables(
                savedSettings,
                projectNodeRegistry.getPlugins(),
              ),
              nativeApi: new TauriNativeApi(),
              datasetProvider,
              audioProvider,
              tokenizer: new GptTokenizerTokenizer(),
              projectPath: loadedProject.path ?? undefined,
              projectReferenceLoader: new TauriProjectReferenceLoader(),
            },
            {},
            contextValues,
          );
        }

        if (recordExecutions) {
          setLastRecordingState(recorder.serialize());
        }
      } catch (e) {
        console.log(e);
      }
    },
  );

  const tryRunTests = useStableCallback(
    async (options: { testSuiteIds?: string[]; testCaseIds?: string[]; iterationCount?: number } = {}) => {
      toast.info(
        (options.iterationCount ?? 1) > 1 ? `Running Tests (${options.iterationCount!} iterations)` : 'Running Tests',
      );
      console.log(`trying to run tests`);
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
            const processor = new GraphProcessor(project, graphId, projectNodeRegistry, true);
            processor.executor = 'browser';
            attachGraphEvents(processor);
            return processor.processGraph(
              {
                settings: await fillMissingSettingsFromEnvironmentVariables(
                  savedSettings,
                  projectNodeRegistry.getPlugins(),
                ),
                nativeApi: new TauriNativeApi(),
                datasetProvider,
                audioProvider,
                tokenizer: new GptTokenizerTokenizer(),
              },
              inputs,
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
        console.log(result);
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
