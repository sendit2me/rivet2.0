import { P, match } from 'ts-pattern';
import { getError } from '../utils/errors.js';
import type { ExecutionRecorder } from '../recording/ExecutionRecorder.js';
import type { DataValue, StringArrayDataValue } from './DataValue.js';
import type { ProcessId } from './ProcessContext.js';
import type { GraphId } from './NodeGraph.js';
import type { ChartNode, NodeId, PortId } from './NodeBase.js';
import type { ProcessEvents } from './GraphProcessor.js';
import type Emittery from 'emittery';
import type { Project } from './Project.js';
import type { UserInputNode } from './nodes/UserInputNode.js';

type Outputs = Record<PortId, DataValue | undefined>;
type GraphOutputs = Record<string, DataValue>;
type GraphInputs = Record<string, DataValue>;

export async function replayExecutionRecording(options: {
  emitter: Emittery<ProcessEvents>;
  erroredNodes: Map<NodeId, Error | string>;
  graphInputs: GraphInputs;
  graphOutputs: GraphOutputs;
  project: Project;
  recorder: ExecutionRecorder;
  recordingPlaybackChatLatency: number;
  setContextValues: (contextValues: Record<string, DataValue>) => void;
  setGraphInputs: (inputs: GraphInputs) => void;
  setGraphOutputs: (outputs: GraphOutputs) => void;
  setRunning: (running: boolean) => void;
  visitedNodes: Set<NodeId>;
  waitUntilUnpaused: () => Promise<void>;
  nodeResults: Map<NodeId, Outputs>;
  isAborted: () => boolean;
}): Promise<GraphOutputs> {
  const {
    emitter,
    erroredNodes,
    graphOutputs,
    project,
    recorder,
    recordingPlaybackChatLatency,
    setContextValues,
    setGraphInputs,
    setGraphOutputs,
    setRunning,
    visitedNodes,
    waitUntilUnpaused,
    nodeResults,
    isAborted,
  } = options;

  const nodesByIdAllGraphs: Record<NodeId, ChartNode> = {};
  for (const graph of Object.values(project.graphs)) {
    for (const node of graph.nodes) {
      nodesByIdAllGraphs[node.id] = node;
    }
  }

  const getGraph = (graphId: GraphId) => {
    const graph = project.graphs[graphId];
    if (!graph) {
      throw new Error(`Mismatch between project and recording: graph ${graphId} not found in project`);
    }
    return graph;
  };

  const getNode = (nodeId: NodeId) => {
    const node = nodesByIdAllGraphs[nodeId];
    if (!node) {
      throw new Error(`Mismatch between project and recording: node ${nodeId} not found in any graph in project`);
    }
    return node;
  };

  try {
    for (const event of recorder.events) {
      if (isAborted()) {
        break;
      }

      await waitUntilUnpaused();

      await match(event)
        .with({ type: 'start' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('start', {
            project,
            contextValues: data.contextValues,
            inputs: data.inputs,
            startGraph: getGraph(data.startGraph),
          });
          setContextValues(data.contextValues);
          setGraphInputs(data.inputs);
        })
        .with({ type: 'abort' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('abort', data);
        })
        .with({ type: 'pause' }, () => {})
        .with({ type: 'resume' }, () => {})
        .with({ type: 'done' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('done', data);
          setGraphOutputs(data.results);
          setRunning(false);
        })
        .with({ type: 'error' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('error', data);
        })
        .with({ type: 'globalSet' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('globalSet', data);
        })
        .with({ type: 'trace' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('trace', data);
        })
        .with({ type: 'graphStart' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('graphStart', {
            graph: getGraph(data.graphId),
            inputs: data.inputs,
          });
        })
        .with({ type: 'graphFinish' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('graphFinish', {
            graph: getGraph(data.graphId),
            outputs: data.outputs,
          });
        })
        .with({ type: 'graphError' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('graphError', {
            graph: getGraph(data.graphId),
            error: data.error,
          });
        })
        .with({ type: 'graphAbort' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('graphAbort', {
            graph: getGraph(data.graphId),
            error: data.error,
            successful: data.successful,
          });
        })
        .with({ type: 'nodeStart' }, async ({ data }) => {
          const node = getNode(data.nodeId);

          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('nodeStart', {
            node,
            inputs: data.inputs,
            processId: data.processId as ProcessId,
          });

          if (node.type === 'chat') {
            await new Promise((resolve) => setTimeout(resolve, recordingPlaybackChatLatency));
          }
        })
        .with({ type: 'nodeFinish' }, ({ data }) => {
          const node = getNode(data.nodeId);

          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('nodeFinish', {
            node,
            outputs: data.outputs,
            processId: data.processId as ProcessId,
          });

          nodeResults.set(data.nodeId, data.outputs as Outputs);
          visitedNodes.add(data.nodeId);
        })
        .with({ type: 'nodeError' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('nodeError', {
            node: getNode(data.nodeId),
            error: data.error,
            processId: data.processId as ProcessId,
          });

          erroredNodes.set(data.nodeId, data.error);
          visitedNodes.add(data.nodeId);
        })
        .with({ type: 'nodeExcluded' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('nodeExcluded', {
            node: getNode(data.nodeId),
            processId: data.processId as ProcessId,
            inputs: data.inputs,
            outputs: data.outputs,
            reason: data.reason,
          });

          visitedNodes.add(data.nodeId);
        })
        .with({ type: 'nodeOutputsCleared' }, () => {})
        .with({ type: 'partialOutput' }, () => {})
        .with({ type: 'userInput' }, ({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('userInput', {
            callback: undefined as unknown as (values: StringArrayDataValue) => void,
            inputStrings: data.inputStrings,
            inputs: data.inputs,
            node: getNode(data.nodeId) as UserInputNode,
            processId: data.processId as ProcessId,
            renderingType: data.renderingType,
          });
        })
        .with({ type: P.string.startsWith('globalSet:') }, ({ type, data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit(type, data);
        })
        .with({ type: P.string.startsWith('userEvent:') }, ({ type, data }) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit(type, data);
        })
        .with({ type: 'newAbortController' }, () => {})
        .with({ type: 'finish' }, () => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          emitter.emit('finish', undefined);
        })
        .with(P.nullish, () => {})
        .exhaustive();
    }
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    emitter.emit('error', { error: getError(error) });
  } finally {
    setRunning(false);
  }

  return graphOutputs;
}
