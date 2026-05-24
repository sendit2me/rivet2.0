import { it, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  DidRunNodeImpl,
  GraphProcessor,
  globalRivetNodeRegistry,
  type Inputs,
  type NodeConnection,
  type PortId,
} from '../../../src/index.js';
import { testProcessContext } from '../../testUtils';

const createNode = () => new DidRunNodeImpl(DidRunNodeImpl.create());

function makeProject(graph: any) {
  return {
    metadata: {
      id: 'project-1',
      title: 'Project',
      description: '',
      mainGraphId: graph.metadata.id,
    },
    graphs: {
      [graph.metadata.id]: graph,
    },
    plugins: [],
  } as any;
}

describe('DidRunNodeImpl', () => {
  it('can create node', () => {
    const node = DidRunNodeImpl.create();

    assert.strictEqual(node.type, 'didRun');
    assert.strictEqual(node.title, 'Did Run');
    assert.strictEqual(node.visualData.width, 167);
  });

  it('has dynamic input definitions based on connections', () => {
    const node = createNode();
    const connections = [
      { inputNodeId: node.id, inputId: 'input1' as PortId } as NodeConnection,
      { inputNodeId: node.id, inputId: 'input3' as PortId } as NodeConnection,
    ];

    const inputDefinitions = node.getInputDefinitions(connections);

    assert.deepStrictEqual(
      inputDefinitions.map((input) => input.id),
      ['input1', 'input2', 'input3', 'input4'],
    );
  });

  it('keeps the explanation in settings instead of the node body', () => {
    const node = createNode();
    const editors = node.getEditors();

    assert.strictEqual(node.getBody(), undefined);
    assert.strictEqual(editors.length, 1);
    assert.strictEqual(editors[0]?.type, 'info');
    assert.match(editors[0]?.helperMessage as string, /connected inputs/i);
    assert.match(editors[0]?.helperMessage as string, /true/i);
  });

  it('outputs true when invoked with any dynamic input entry', async () => {
    const node = createNode();
    const result = await node.process({
      input1: { type: 'boolean', value: false },
      input2: { type: 'number', value: 0 },
      input3: { type: 'string', value: '' },
      input4: { type: 'any', value: null },
      input5: { type: 'any', value: undefined },
      input6: undefined,
    } as Inputs);

    assert.deepStrictEqual(result['ran' as PortId], { type: 'boolean', value: true });
  });

  it('adapts a falsy value into a true If condition when the upstream node ran', async () => {
    const graph = {
      metadata: {
        id: 'did-run-falsy-graph',
        name: 'Did Run Falsy Graph',
        description: '',
      },
      nodes: [
        {
          id: 'falsy-source',
          type: 'boolean',
          title: 'Bool',
          data: { value: false },
          visualData: { x: 0, y: 0, width: 130 },
        },
        {
          id: 'did-run-node',
          type: 'didRun',
          title: 'Did Run',
          data: {},
          visualData: { x: 200, y: 0, width: 150 },
        },
        {
          id: 'true-value',
          type: 'boolean',
          title: 'Bool',
          data: { value: true },
          visualData: { x: 200, y: 160, width: 130 },
        },
        {
          id: 'if-node',
          type: 'if',
          title: 'If',
          data: { unconnectedControlFlowExcluded: true },
          visualData: { x: 400, y: 0, width: 125 },
        },
        {
          id: 'output-node',
          type: 'graphOutput',
          title: 'Graph Output',
          data: { id: 'result', dataType: 'boolean' },
          visualData: { x: 600, y: 0, width: 300 },
        },
      ],
      connections: [
        {
          outputNodeId: 'falsy-source',
          outputId: 'value',
          inputNodeId: 'did-run-node',
          inputId: 'input1',
        },
        {
          outputNodeId: 'did-run-node',
          outputId: 'ran',
          inputNodeId: 'if-node',
          inputId: 'if',
        },
        {
          outputNodeId: 'true-value',
          outputId: 'value',
          inputNodeId: 'if-node',
          inputId: 'value',
        },
        {
          outputNodeId: 'if-node',
          outputId: 'output',
          inputNodeId: 'output-node',
          inputId: 'value',
        },
      ],
    };
    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id as any, globalRivetNodeRegistry);
    const outputs = await processor.processGraph(testProcessContext());

    assert.deepStrictEqual(outputs.result, { type: 'boolean', value: true });
  });

  it('stays Not ran when a connected upstream branch did not run', async () => {
    const graph = {
      metadata: {
        id: 'did-run-excluded-graph',
        name: 'Did Run Excluded Graph',
        description: '',
      },
      nodes: [
        {
          id: 'false-condition',
          type: 'boolean',
          title: 'Bool',
          data: { value: false },
          visualData: { x: 0, y: 0, width: 130 },
        },
        {
          id: 'source-value',
          type: 'boolean',
          title: 'Bool',
          data: { value: true },
          visualData: { x: 0, y: 160, width: 130 },
        },
        {
          id: 'upstream-if-node',
          type: 'if',
          title: 'If',
          data: { unconnectedControlFlowExcluded: true },
          visualData: { x: 200, y: 0, width: 125 },
        },
        {
          id: 'did-run-node',
          type: 'didRun',
          title: 'Did Run',
          data: {},
          visualData: { x: 400, y: 0, width: 150 },
        },
        {
          id: 'output-node',
          type: 'graphOutput',
          title: 'Graph Output',
          data: { id: 'result', dataType: 'boolean' },
          visualData: { x: 600, y: 0, width: 300 },
        },
      ],
      connections: [
        {
          outputNodeId: 'false-condition',
          outputId: 'value',
          inputNodeId: 'upstream-if-node',
          inputId: 'if',
        },
        {
          outputNodeId: 'source-value',
          outputId: 'value',
          inputNodeId: 'upstream-if-node',
          inputId: 'value',
        },
        {
          outputNodeId: 'upstream-if-node',
          outputId: 'output',
          inputNodeId: 'did-run-node',
          inputId: 'input1',
        },
        {
          outputNodeId: 'did-run-node',
          outputId: 'ran',
          inputNodeId: 'output-node',
          inputId: 'value',
        },
      ],
    };
    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id as any, globalRivetNodeRegistry);
    const outputs = await processor.processGraph(testProcessContext());

    assert.deepStrictEqual(outputs.result, { type: 'control-flow-excluded', value: undefined });
  });

  it('outputs Not ran when no inputs are connected', async () => {
    const node = createNode();
    const result = await node.process({});

    assert.deepStrictEqual(result['ran' as PortId], { type: 'control-flow-excluded', value: undefined });
  });
});
