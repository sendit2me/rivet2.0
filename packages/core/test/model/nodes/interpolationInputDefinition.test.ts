import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExpressionNodeImpl,
  ExtractObjectPathNodeImpl,
  GptFunctionNodeImpl,
  JSFilterNodeImpl,
  JSMapNodeImpl,
  ObjectNodeImpl,
  PromptNodeImpl,
  TextNodeImpl,
  ToTreeNodeImpl,
  createInterpolationInputDefinition,
  getInterpolationInputDefinitionData,
  isInterpolationInputDefinition,
  type ChartNode,
  type NodeInputDefinition,
  type PortId,
} from '../../../src/index.js';
import { ThreadMessageNodeImpl } from '../../../src/plugins/openai/nodes/ThreadMessageNode.js';

function createNode<T extends ChartNode>(node: T, data: Partial<T['data']>): T {
  return {
    ...node,
    data: {
      ...node.data,
      ...data,
    },
  };
}

function getInterpolationPorts(inputDefinitions: NodeInputDefinition[]) {
  return inputDefinitions.filter(isInterpolationInputDefinition).map((definition) => ({
    id: definition.id,
    title: definition.title,
    interpolationName: (definition.data as { interpolationName: string }).interpolationName,
  }));
}

test('identifies only input definitions created by the interpolation helper', () => {
  const interpolationInput = createInterpolationInputDefinition({
    interpolationName: 'name',
    dataType: 'string',
  });
  const ordinaryInput: NodeInputDefinition = {
    id: 'name' as PortId,
    title: 'name',
    dataType: 'string',
  };
  const unrelatedDataInput: NodeInputDefinition = {
    id: 'other' as PortId,
    title: 'other',
    dataType: 'string',
    data: {
      kind: 'other',
      interpolationName: 'other',
    },
  };

  assert.equal(isInterpolationInputDefinition(interpolationInput), true);
  assert.deepEqual(getInterpolationInputDefinitionData(interpolationInput), {
    kind: 'interpolation-input',
    interpolationName: 'name',
  });
  assert.equal(isInterpolationInputDefinition(ordinaryInput), false);
  assert.equal(isInterpolationInputDefinition(unrelatedDataInput), false);
});

test('marks Text interpolation inputs without marking fixed ports', () => {
  const node = new TextNodeImpl(createNode(TextNodeImpl.create(), { text: '{{foo}}' }));

  assert.deepEqual(getInterpolationPorts(node.getInputDefinitions()), [
    {
      id: 'foo',
      title: 'foo',
      interpolationName: 'foo',
    },
  ]);
});

test('marks Prompt interpolation inputs without marking manual toggle ports', () => {
  const node = new PromptNodeImpl(
    createNode(PromptNodeImpl.create(), {
      promptText: '{{message}}',
      useTypeInput: true,
    }),
  );
  const inputDefinitions = node.getInputDefinitions();

  assert.equal(
    isInterpolationInputDefinition(inputDefinitions.find((definition) => definition.id === 'type')!),
    false,
  );
  assert.deepEqual(getInterpolationPorts(inputDefinitions), [
    {
      id: 'message',
      title: 'message',
      interpolationName: 'message',
    },
  ]);
});

test('marks Object interpolation inputs', () => {
  const node = new ObjectNodeImpl(
    createNode(ObjectNodeImpl.create(), {
      jsonTemplate: '{"value":"{{value}}"}',
    }),
  );

  assert.deepEqual(getInterpolationPorts(node.getInputDefinitions()), [
    {
      id: 'value',
      title: 'value',
      interpolationName: 'value',
    },
  ]);
});

test('marks Tool schema interpolation inputs with prefixed port ids', () => {
  const node = new GptFunctionNodeImpl(
    createNode(GptFunctionNodeImpl.create(), {
      schema: '{"type":"object","properties":{"foo":{"default":"{{foo}}"}}}',
      useSchemaInput: false,
    }),
  );

  assert.deepEqual(getInterpolationPorts(node.getInputDefinitions()), [
    {
      id: 'input-foo',
      title: 'foo',
      interpolationName: 'foo',
    },
  ]);
});

test('marks Expression interpolation inputs', () => {
  const node = new ExpressionNodeImpl(
    createNode(ExpressionNodeImpl.create(), {
      expression: '{{left}} + {{right}}',
    }),
  );

  assert.deepEqual(getInterpolationPorts(node.getInputDefinitions()), [
    {
      id: 'left',
      title: 'left',
      interpolationName: 'left',
    },
    {
      id: 'right',
      title: 'right',
      interpolationName: 'right',
    },
  ]);
});

test('marks JS Filter and JS Map interpolation inputs but not fixed array inputs', () => {
  const filterNode = new JSFilterNodeImpl(
    createNode(JSFilterNodeImpl.create(), {
      callbackBody: 'return item > {{min}};',
    }),
  );
  const mapNode = new JSMapNodeImpl(
    createNode(JSMapNodeImpl.create(), {
      callbackBody: 'return item * {{factor}};',
    }),
  );

  assert.equal(
    isInterpolationInputDefinition(
      filterNode.getInputDefinitions().find((definition) => definition.id === 'array')!,
    ),
    false,
  );
  assert.deepEqual(getInterpolationPorts(filterNode.getInputDefinitions()), [
    {
      id: 'min',
      title: 'min',
      interpolationName: 'min',
    },
  ]);
  assert.deepEqual(getInterpolationPorts(mapNode.getInputDefinitions()), [
    {
      id: 'factor',
      title: 'factor',
      interpolationName: 'factor',
    },
  ]);
});

test('marks Extract Object Path stored-path interpolation inputs only when path input is off', () => {
  const storedPathNode = new ExtractObjectPathNodeImpl(
    createNode(ExtractObjectPathNodeImpl.create(), {
      path: '$.items[{{index}}]',
      usePathInput: false,
    }),
  );
  const pathInputNode = new ExtractObjectPathNodeImpl(
    createNode(ExtractObjectPathNodeImpl.create(), {
      path: '$.items[{{index}}]',
      usePathInput: true,
    }),
  );

  assert.equal(
    isInterpolationInputDefinition(
      storedPathNode.getInputDefinitions().find((definition) => definition.id === 'object')!,
    ),
    false,
  );
  assert.deepEqual(getInterpolationPorts(storedPathNode.getInputDefinitions()), [
    {
      id: 'index',
      title: 'index',
      interpolationName: 'index',
    },
  ]);
  assert.deepEqual(getInterpolationPorts(pathInputNode.getInputDefinitions()), []);
  assert.equal(
    isInterpolationInputDefinition(
      pathInputNode.getInputDefinitions().find((definition) => definition.id === 'path')!,
    ),
    false,
  );
});

test('marks Thread Message interpolation inputs without marking toggle ports', () => {
  const data = {
    ...ThreadMessageNodeImpl.create().data,
    text: '{{message}}',
    useFileIdsInput: true,
    useMetadataInput: true,
  };
  const inputDefinitions = ThreadMessageNodeImpl.getInputDefinitions(data, [], {} as any, {} as any);

  assert.equal(
    isInterpolationInputDefinition(inputDefinitions.find((definition) => definition.id === 'fileIds')!),
    false,
  );
  assert.equal(
    isInterpolationInputDefinition(inputDefinitions.find((definition) => definition.id === 'metadata')!),
    false,
  );
  assert.deepEqual(getInterpolationPorts(inputDefinitions), [
    {
      id: 'message',
      title: 'message',
      interpolationName: 'message',
    },
  ]);
});

test('does not mark To Tree row-format interpolation as connectable ports', () => {
  const node = new ToTreeNodeImpl(createNode(ToTreeNodeImpl.create(), { format: '{{path}} - {{label}}' }));

  assert.deepEqual(
    node.getInputDefinitions().map((definition) => ({
      id: definition.id,
      isInterpolation: isInterpolationInputDefinition(definition),
    })),
    [
      {
        id: 'objects',
        isInterpolation: false,
      },
    ],
  );
});
