import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type ChartNode,
  type DataValue,
  type GraphId,
  type NodeGraph,
  type NodeId,
  type PortId,
  type ProcessId,
  type Project,
} from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs, RunDataByNodeId } from '../state/dataFlow.js';
import {
  getChatViewerChatNodes,
  getChatViewerGraphEntries,
  getChatViewerNodeGraphNameMap,
  getChatViewerNodeProcesses,
  getChatViewerProcessRows,
  getChatViewerPromptValue,
  getChatViewerResponseValue,
  hasChatViewerRows,
} from './chatViewerData.js';

const responsePort = 'response' as PortId;
const promptPort = 'prompt' as PortId;

const dataRefs: DataRefReader = {
  get: () => undefined,
};

test('Chat Viewer indexes the current graph instead of a stale saved graph copy', () => {
  const graphId = 'graph-1' as GraphId;
  const staleSavedGraph = createGraph(graphId, 'Saved graph', []);
  const currentGraph = createGraph(graphId, 'Live graph', [createNode('chat-1', 'chat')]);

  const entries = getChatViewerGraphEntries({ [graphId]: staleSavedGraph } as Project['graphs'], currentGraph);
  const chatNodes = getChatViewerChatNodes(entries);
  const graphNames = getChatViewerNodeGraphNameMap(entries);

  assert.deepEqual(
    chatNodes.map((node) => node.id),
    ['chat-1'],
  );
  assert.equal(graphNames['chat-1' as NodeId], 'Live graph');
});

test('Chat Viewer includes a live unsaved chat graph with run data', () => {
  const currentGraph = createGraph('graph-1' as GraphId, 'Unsaved live graph', [createNode('chat-1', 'chat')]);
  const runData = createRunData({
    'chat-1': [
      {
        processId: 'process-1',
        data: createSuccessfulChatRun('Hello'),
      },
    ],
  });

  const entries = getChatViewerGraphEntries({}, currentGraph);
  const processes = getChatViewerNodeProcesses(getChatViewerChatNodes(entries), runData);
  const rows = getChatViewerProcessRows(processes);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.node.id, 'chat-1');
  assert.deepEqual(getChatViewerResponseValue(rows[0]!.process.data, rows[0]!.index), inlineStored('string', 'Hello'));
  assert.equal(hasChatViewerRows({}, currentGraph, runData), true);
});

test('Chat Viewer includes LLM Chat nodes', () => {
  const currentGraph = createGraph('graph-1' as GraphId, 'LLM graph', [createNode('llm-chat-1', 'llmChatV2')]);
  const runData = createRunData({
    'llm-chat-1': [
      {
        processId: 'process-1',
        data: createSuccessfulChatRun('LLM response'),
      },
    ],
  });

  const entries = getChatViewerGraphEntries({}, currentGraph);
  const chatNodes = getChatViewerChatNodes(entries);
  const rows = getChatViewerProcessRows(getChatViewerNodeProcesses(chatNodes, runData));

  assert.deepEqual(
    chatNodes.map((node) => node.type),
    ['llmChatV2'],
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(
    getChatViewerResponseValue(rows[0]!.process.data, rows[0]!.index),
    inlineStored('string', 'LLM response'),
  );
});

test('Chat Viewer expands split chat outputs in split order', () => {
  const runData = createRunData({
    'chat-1': [
      {
        processId: 'process-1',
        data: {
          status: { type: 'ok' },
          splitOutputData: {
            2: { [responsePort]: inlineStored('string', 'third') },
            0: { [responsePort]: inlineStored('string', 'first') },
          },
        },
      },
    ],
  });

  const processes = getChatViewerNodeProcesses([createNode('chat-1', 'chat')], runData);
  const rows = getChatViewerProcessRows(processes);

  assert.deepEqual(
    rows.map((row) => row.index),
    [0, 2],
  );
});

test('Chat Viewer keeps ref-backed response rows renderable', () => {
  const runData = createRunData({
    'chat-1': [
      {
        processId: 'process-1',
        data: {
          status: { type: 'ok' },
          outputData: {
            [responsePort]: {
              type: 'string',
              storage: 'ref',
              refId: 'response-ref',
              preview: {
                kind: 'text',
                excerpt: 'Large response',
                totalChars: 5000,
                lineCount: 1,
              },
            },
          },
        },
      },
    ],
  });

  const processes = getChatViewerNodeProcesses([createNode('chat-1', 'chat')], runData);
  const rows = getChatViewerProcessRows(processes);

  assert.equal(rows.length, 1);
  assert.equal(getChatViewerResponseValue(rows[0]!.process.data, rows[0]!.index)?.storage, 'ref');
});

test('Chat Viewer does not produce blank rows for completed chat runs without a response', () => {
  const currentGraph = createGraph('graph-1' as GraphId, 'Chat graph', [createNode('chat-1', 'chat')]);
  const runData = createRunData({
    'chat-1': [
      {
        processId: 'process-1',
        data: {
          status: { type: 'ok' },
          outputData: {},
        },
      },
    ],
  });

  const processes = getChatViewerNodeProcesses([createNode('chat-1', 'chat')], runData);
  const rows = getChatViewerProcessRows(processes);

  assert.equal(rows.length, 0);
  assert.equal(hasChatViewerRows({}, currentGraph, runData), false);
});

test('Chat Viewer shows one error row when split outputs have no response', () => {
  const runData = createRunData({
    'chat-1': [
      {
        processId: 'process-1',
        data: {
          status: { type: 'error', error: 'Chat failed' },
          splitOutputData: {
            0: {},
            1: {},
          },
        },
      },
    ],
  });

  const processes = getChatViewerNodeProcesses([createNode('chat-1', 'chat')], runData);
  const rows = getChatViewerProcessRows(processes);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.index, -1);
});

test('Chat Viewer restores the matching prompt item for split runs', () => {
  const runData = createSuccessfulChatRun('Hello');
  runData.inputData = {
    [promptPort]: inlineStored('string[]', ['first prompt', 'second prompt']),
  };

  const prompt = getChatViewerPromptValue(runData, 1, dataRefs);

  assert.deepEqual(prompt, {
    type: 'string',
    value: 'second prompt',
  });
});

function createGraph(id: GraphId, name: string, nodes: ChartNode[]): NodeGraph {
  return {
    metadata: {
      id,
      name,
      description: '',
    },
    nodes,
    connections: [],
  };
}

function createNode(id: string, type: string): ChartNode {
  return {
    id: id as NodeId,
    type,
    title: id,
    data: {},
    visualData: {
      x: 0,
      y: 0,
      width: 300,
    },
  } as ChartNode;
}

function createRunData(
  runs: Record<string, Array<{ processId: string; data: NodeRunDataWithRefs }>>,
): RunDataByNodeId {
  return Object.fromEntries(
    Object.entries(runs).map(([nodeId, nodeRuns]) => [
      nodeId as NodeId,
      nodeRuns.map((run) => ({
        processId: run.processId as ProcessId,
        data: run.data,
      })),
    ]),
  );
}

function createSuccessfulChatRun(response: string): NodeRunDataWithRefs {
  return {
    status: { type: 'ok' },
    outputData: {
      [responsePort]: inlineStored('string', response),
    },
  };
}

function inlineStored<T extends DataValue['type']>(type: T, value: Extract<DataValue, { type: T }>['value']) {
  return {
    type,
    storage: 'inline' as const,
    value,
  };
}
