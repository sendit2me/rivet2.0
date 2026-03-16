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
import { emitDetached } from '../utils/emitDetached.js';

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
          emitDetached(emitter, 'start', {
            project,
            contextValues: data.contextValues,
            inputs: data.inputs,
            startGraph: getGraph(data.startGraph),
          });
          setContextValues(data.contextValues);
          setGraphInputs(data.inputs);
        })
        .with({ type: 'abort' }, ({ data }) => {
          emitDetached(emitter, 'abort', data);
        })
        .with({ type: 'pause' }, () => {})
        .with({ type: 'resume' }, () => {})
        .with({ type: 'done' }, ({ data }) => {
          emitDetached(emitter, 'done', data);
          setGraphOutputs(data.results);
          setRunning(false);
        })
        .with({ type: 'error' }, ({ data }) => {
          emitDetached(emitter, 'error', data);
        })
        .with({ type: 'globalSet' }, ({ data }) => {
          emitDetached(emitter, 'globalSet', data);
        })
        .with({ type: 'trace' }, ({ data }) => {
          emitDetached(emitter, 'trace', data);
        })
        .with({ type: 'graphStart' }, ({ data }) => {
          emitDetached(emitter, 'graphStart', {
            graph: getGraph(data.graphId),
            inputs: data.inputs,
          });
        })
        .with({ type: 'graphFinish' }, ({ data }) => {
          emitDetached(emitter, 'graphFinish', {
            graph: getGraph(data.graphId),
            outputs: data.outputs,
          });
        })
        .with({ type: 'graphError' }, ({ data }) => {
          emitDetached(emitter, 'graphError', {
            graph: getGraph(data.graphId),
            error: data.error,
          });
        })
        .with({ type: 'graphAbort' }, ({ data }) => {
          emitDetached(emitter, 'graphAbort', {
            graph: getGraph(data.graphId),
            error: data.error,
            successful: data.successful,
          });
        })
        .with({ type: 'nodeStart' }, async ({ data }) => {
          const node = getNode(data.nodeId);

          emitDetached(emitter, 'nodeStart', {
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

          emitDetached(emitter, 'nodeFinish', {
            node,
            outputs: data.outputs,
            processId: data.processId as ProcessId,
          });

          nodeResults.set(data.nodeId, data.outputs as Outputs);
          visitedNodes.add(data.nodeId);
        })
        .with({ type: 'nodeError' }, ({ data }) => {
          emitDetached(emitter, 'nodeError', {
            node: getNode(data.nodeId),
            error: data.error,
            processId: data.processId as ProcessId,
          });

          erroredNodes.set(data.nodeId, data.error);
          visitedNodes.add(data.nodeId);
        })
        .with({ type: 'nodeExcluded' }, ({ data }) => {
          emitDetached(emitter, 'nodeExcluded', {
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
          emitDetached(emitter, 'userInput', {
            callback: undefined as unknown as (values: StringArrayDataValue) => void,
            inputStrings: data.inputStrings,
            inputs: data.inputs,
            node: getNode(data.nodeId) as UserInputNode,
            processId: data.processId as ProcessId,
            renderingType: data.renderingType,
          });
        })
        .with({ type: P.string.startsWith('globalSet:') }, ({ type, data }) => {
          emitDetached(emitter, type, data);
        })
        .with({ type: P.string.startsWith('userEvent:') }, ({ type, data }) => {
          emitDetached(emitter, type, data);
        })
        .with({ type: 'newAbortController' }, () => {})
        .with({ type: 'finish' }, () => {
          emitDetached(emitter, 'finish', undefined);
        })
        .with(P.nullish, () => {})
        .exhaustive();
    }
  } catch (error) {
    emitDetached(emitter, 'error', { error: getError(error) });
  } finally {
    setRunning(false);
  }

  return graphOutputs;
}
