import Emittery from 'emittery';
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import type { GraphId, NodeGraph } from '../../src/model/NodeGraph.js';
import type { GraphProcessor, ProcessEvents } from '../../src/model/GraphProcessor.js';
import { replayExecutionRecording } from '../../src/model/RecordingPlayer.js';
import type { GraphExecutionMetadata, GraphRunId, ProcessId, RootRunId } from '../../src/model/ProcessContext.js';
import { ExecutionRecorder } from '../../src/recording/ExecutionRecorder.js';
import type { ChartNode, NodeId, PortId } from '../../src/model/NodeBase.js';
import { text } from 'node:stream/consumers';
import { Readable } from 'node:stream';

const userInputPort = 'user-input-a' as PortId;
const nodeId = 'node-id' as NodeId;
const processId = 'process-id' as ProcessId;

const node = {
  id: nodeId,
  type: 'test',
} as ChartNode;

const execution: GraphExecutionMetadata = {
  graphId: 'graph-id' as GraphId,
  graphRunId: 'graph-run-id' as GraphRunId,
  rootRunId: 'root-run-id' as RootRunId,
};

const graph: NodeGraph = {
  metadata: { id: 'graph-id' as GraphId },
  nodes: [node],
  connections: [],
};

async function addEvents(recorder: ExecutionRecorder, options: { includeIntermediateEvents?: boolean } = {}) {
  const { includeIntermediateEvents = false } = options;
  const emitter = new Emittery<ProcessEvents>();
  recorder.record(emitter as unknown as GraphProcessor);
  await emitter.emit('graphStart', {
    graph,
    inputs: { [userInputPort]: { type: 'string', value: 'asdf' } },
    execution,
  });

  await emitter.emit('nodeStart', {
    node,
    inputs: { [userInputPort]: { type: 'string', value: 'asdf' } },
    processId,
    execution,
  });

  if (includeIntermediateEvents) {
    await emitter.emit('partialOutput', {
      node,
      outputs: { output: { type: 'string', value: 'partial' } },
      index: 0,
      processId,
      execution,
    });

    await emitter.emit('nodeOutputsCleared', {
      node,
      processId,
      execution,
    });

    await emitter.emit('graphFinish', {
      graph,
      outputs: { output: { type: 'string', value: 'final' } },
      execution,
    });
  }

  await emitter.emit('done', {
    results: {
      output: { type: 'string', value: 'output' },
    },
  });
}

void describe('ExecutionRecorder', () => {
  void it('should serialize an instance of ExecutionRecorder', async () => {
    // Simulate storage in string form
    const recordingToString = (recorder: ExecutionRecorder) => recorder.serialize();
    const recordingStreamToString = async (recorder: ExecutionRecorder) =>
      text(Readable.fromWeb(recorder.serializeStream() as any)); // cast needed due to incompatible Readable version types

    const stringToRecording = ExecutionRecorder.deserializeFromString;
    const streamToRecording = (str: string) =>
      ExecutionRecorder.deserializeFromStream(Readable.toWeb(Readable.from([str]))); // ReadableStream.from is only added in Node v20.6.0

    // Test each pair of string/stream serializer and deserializer
    for (const [serialize, deserialize] of [
      [recordingToString, stringToRecording],
      [recordingToString, streamToRecording],
      [recordingStreamToString, stringToRecording],
      [recordingStreamToString, streamToRecording],
    ] as const) {
      const recorder = new ExecutionRecorder();
      await addEvents(recorder);

      const originalEvents = recorder.events;
      assert.notEqual(originalEvents.length, 0);
      const serialized = await serialize(recorder);
      const deserialized = await deserialize(serialized);
      assert.deepEqual(deserialized.events, originalEvents);
    }
  });

  void it('persists execution metadata and replays partialOutput/nodeOutputsCleared with parity', async () => {
    const recorder = new ExecutionRecorder({ includePartialOutputs: true });
    await addEvents(recorder, { includeIntermediateEvents: true });

    const partialOutputEvent = recorder.events.find((event) => event.type === 'partialOutput');
    const nodeOutputsClearedEvent = recorder.events.find((event) => event.type === 'nodeOutputsCleared');

    assert.equal(partialOutputEvent?.data.execution?.graphRunId, execution.graphRunId);
    assert.equal(nodeOutputsClearedEvent?.data.execution?.rootRunId, execution.rootRunId);

    const replayEmitter = new Emittery<ProcessEvents>();
    const replayedEvents: Array<{ type: string; execution?: GraphExecutionMetadata; processId?: ProcessId; index?: number }> = [];

    replayEmitter.on('graphStart', (data: ProcessEvents['graphStart']) => {
      replayedEvents.push({ type: 'graphStart', execution: data.execution });
    });
    replayEmitter.on('partialOutput', (data: ProcessEvents['partialOutput']) => {
      replayedEvents.push({ type: 'partialOutput', execution: data.execution, index: data.index, processId: data.processId });
    });
    replayEmitter.on('nodeOutputsCleared', (data: ProcessEvents['nodeOutputsCleared']) => {
      replayedEvents.push({ type: 'nodeOutputsCleared', execution: data.execution, processId: data.processId });
    });
    replayEmitter.on('graphFinish', (data: ProcessEvents['graphFinish']) => {
      replayedEvents.push({ type: 'graphFinish', execution: data.execution });
    });

    await replayExecutionRecording({
      emitter: replayEmitter,
      erroredNodes: new Map(),
      graphInputs: {},
      graphOutputs: {},
      isAborted: () => false,
      nodeResults: new Map(),
      project: {
        metadata: { id: 'project-id', title: 'Project', description: '', mainGraphId: graph.metadata!.id! },
        graphs: { [graph.metadata!.id!]: graph },
      } as any,
      recorder,
      recordingPlaybackChatLatency: 0,
      setContextValues: () => {},
      setGraphInputs: () => {},
      setGraphOutputs: () => {},
      setRunning: () => {},
      visitedNodes: new Set(),
      waitUntilUnpaused: async () => {},
    });

    assert.deepEqual(
      replayedEvents.map((event) => ({
        ...event,
        execution: event.execution
          ? {
              graphId: event.execution.graphId,
              graphRunId: event.execution.graphRunId,
              rootRunId: event.execution.rootRunId,
            }
          : undefined,
      })),
      [
        { type: 'graphStart', execution: execution },
        { type: 'partialOutput', execution: execution, index: 0, processId },
        { type: 'nodeOutputsCleared', execution: execution, processId },
        { type: 'graphFinish', execution: execution },
      ],
    );
  });
});
