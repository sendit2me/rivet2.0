import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartNode, NodeGraph, NodeId, PortId } from '@ironclad/rivet-core';

import { getStaticInputApiKey } from './chatV2ModelCatalogInputKey.js';

const llmNodeId = 'llm' as NodeId;

function createGraph(nodes: ChartNode[], connections: NodeGraph['connections']): NodeGraph {
  return {
    nodes,
    connections,
  };
}

function createLlmNode(): ChartNode {
  return {
    id: llmNodeId,
    type: 'llmChatV2',
    title: 'LLM Chat',
    data: {},
    visualData: { x: 0, y: 0 },
  };
}

function createTextNode(id: string, text: string): ChartNode {
  return {
    id: id as NodeId,
    type: 'text',
    title: 'Text',
    data: { text, normalizeLineEndings: true },
    visualData: { x: 0, y: 0 },
  };
}

test('resolves the LLM API key input from a connected Text node without a prior run', () => {
  const graph = createGraph(
    [createLlmNode(), createTextNode('key', 'sk-input-key')],
    [
      {
        outputNodeId: 'key' as NodeId,
        outputId: 'output' as PortId,
        inputNodeId: llmNodeId,
        inputId: 'apiKey' as PortId,
      },
    ],
  );

  assert.equal(getStaticInputApiKey({ graph, nodeId: llmNodeId }), 'sk-input-key');
});

test('resolves the LLM API key input through static Text interpolation and passthrough nodes', () => {
  const graph = createGraph(
    [
      createLlmNode(),
      createTextNode('prefix', 'sk'),
      createTextNode('key', '{{prefix}}-interpolated-key'),
      {
        id: 'passthrough' as NodeId,
        type: 'passthrough',
        title: 'Passthrough',
        data: {},
        visualData: { x: 0, y: 0 },
      },
    ],
    [
      {
        outputNodeId: 'prefix' as NodeId,
        outputId: 'output' as PortId,
        inputNodeId: 'key' as NodeId,
        inputId: 'prefix' as PortId,
      },
      {
        outputNodeId: 'key' as NodeId,
        outputId: 'output' as PortId,
        inputNodeId: 'passthrough' as NodeId,
        inputId: 'input1' as PortId,
      },
      {
        outputNodeId: 'passthrough' as NodeId,
        outputId: 'output1' as PortId,
        inputNodeId: llmNodeId,
        inputId: 'apiKey' as PortId,
      },
    ],
  );

  assert.equal(getStaticInputApiKey({ graph, nodeId: llmNodeId }), 'sk-interpolated-key');
});

test('resolves the LLM API key input from a Graph Input default value', () => {
  const graph = createGraph(
    [
      createLlmNode(),
      {
        id: 'graph-input' as NodeId,
        type: 'graphInput',
        title: 'Graph Input',
        data: { dataType: 'string', defaultValue: 'sk-default-key', useDefaultValueInput: false },
        visualData: { x: 0, y: 0 },
      },
    ],
    [
      {
        outputNodeId: 'graph-input' as NodeId,
        outputId: 'data' as PortId,
        inputNodeId: llmNodeId,
        inputId: 'apiKey' as PortId,
      },
    ],
  );

  assert.equal(getStaticInputApiKey({ graph, nodeId: llmNodeId }), 'sk-default-key');
});

test('returns undefined for dynamic API key input sources', () => {
  const graph = createGraph(
    [
      createLlmNode(),
      {
        id: 'code' as NodeId,
        type: 'code',
        title: 'Code',
        data: {},
        visualData: { x: 0, y: 0 },
      },
    ],
    [
      {
        outputNodeId: 'code' as NodeId,
        outputId: 'output' as PortId,
        inputNodeId: llmNodeId,
        inputId: 'apiKey' as PortId,
      },
    ],
  );

  assert.equal(getStaticInputApiKey({ graph, nodeId: llmNodeId }), undefined);
});

test('returns undefined for cyclic static API key sources', () => {
  const graph = createGraph(
    [createLlmNode(), createTextNode('key-a', '{{b}}'), createTextNode('key-b', '{{a}}')],
    [
      {
        outputNodeId: 'key-a' as NodeId,
        outputId: 'output' as PortId,
        inputNodeId: llmNodeId,
        inputId: 'apiKey' as PortId,
      },
      {
        outputNodeId: 'key-b' as NodeId,
        outputId: 'output' as PortId,
        inputNodeId: 'key-a' as NodeId,
        inputId: 'b' as PortId,
      },
      {
        outputNodeId: 'key-a' as NodeId,
        outputId: 'output' as PortId,
        inputNodeId: 'key-b' as NodeId,
        inputId: 'a' as PortId,
      },
    ],
  );

  assert.equal(getStaticInputApiKey({ graph, nodeId: llmNodeId }), undefined);
});
