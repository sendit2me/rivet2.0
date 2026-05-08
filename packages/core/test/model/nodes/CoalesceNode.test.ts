import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  CoalesceNodeImpl,
  type CoalesceNode,
  type Inputs,
  type NodeConnection,
  type PortId,
} from '../../../src/index.js';

function createNode(data: Partial<CoalesceNode['data']> = {}) {
  const node = CoalesceNodeImpl.create();

  return new CoalesceNodeImpl({
    ...node,
    data: {
      ...node.data,
      ...data,
    },
  });
}

describe('CoalesceNode', () => {
  it('exposes null and undefined ignore toggles', () => {
    const node = createNode();

    assert.deepStrictEqual(
      node.getEditors().map(({ type, label, dataKey }) => ({ type, label, dataKey })),
      [
        { type: 'toggle', label: "Ignore 'null'", dataKey: 'ignoreNull' },
        { type: 'toggle', label: "Ignore 'undefined'", dataKey: 'ignoreUndefined' },
      ],
    );
  });

  it('shows active ignore settings in the node body', () => {
    assert.equal(createNode().getBody(), undefined);
    assert.equal(createNode({ ignoreNull: true }).getBody(), "Ignore 'null'");
    assert.equal(createNode({ ignoreUndefined: true }).getBody(), "Ignore 'undefined'");
    assert.equal(
      createNode({ ignoreNull: true, ignoreUndefined: true }).getBody(),
      "Ignore 'null'\nIgnore 'undefined'",
    );
  });

  it('keeps null and undefined as valid values by default', async () => {
    const node = createNode();

    const nullResult = await node.process({
      input1: { type: 'any', value: null },
      input2: { type: 'string', value: 'fallback' },
    } as Inputs);

    assert.deepStrictEqual(nullResult['output' as PortId], { type: 'any', value: null });

    const undefinedResult = await node.process({
      input1: { type: 'any', value: undefined },
      input2: { type: 'string', value: 'fallback' },
    } as Inputs);

    assert.deepStrictEqual(undefinedResult['output' as PortId], { type: 'any', value: undefined });
  });

  it('uses the conditional port only to gate whether coalesce itself ran', async () => {
    const node = createNode();

    const ranResult = await node.process({
      conditional: { type: 'boolean', value: false },
      input1: { type: 'string', value: 'value' },
    } as Inputs);

    assert.deepStrictEqual(ranResult['output' as PortId], { type: 'string', value: 'value' });

    const excludedResult = await node.process({
      conditional: { type: 'control-flow-excluded', value: undefined },
      input1: { type: 'string', value: 'value' },
    } as Inputs);

    assert.deepStrictEqual(excludedResult['output' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('checks dynamic inputs by input number instead of object-key count', async () => {
    const node = createNode();

    const result = await node.process({
      input2: { type: 'string', value: 'fallback' },
      input3extra: { type: 'string', value: 'ignored' },
    } as Inputs);

    assert.deepStrictEqual(result['output' as PortId], { type: 'string', value: 'fallback' });
  });

  it('ignores malformed dynamic input ids when building input definitions', () => {
    const chartNode = CoalesceNodeImpl.create();
    const node = new CoalesceNodeImpl(chartNode);

    const inputDefinitions = node.getInputDefinitions([
      { inputNodeId: chartNode.id, inputId: 'input0' as PortId } as NodeConnection,
      { inputNodeId: chartNode.id, inputId: 'input2' as PortId } as NodeConnection,
      { inputNodeId: chartNode.id, inputId: 'input3extra' as PortId } as NodeConnection,
      { inputNodeId: chartNode.id, inputId: `input${'9'.repeat(100)}` as PortId } as NodeConnection,
    ]);

    assert.deepStrictEqual(
      inputDefinitions.map((input) => input.id),
      ['conditional', 'input1', 'input2', 'input3'],
    );
  });

  it('skips null values when Ignore null is enabled', async () => {
    const node = createNode({ ignoreNull: true });

    const result = await node.process({
      input1: { type: 'any', value: null },
      input2: { type: 'string', value: 'fallback' },
    } as Inputs);

    assert.deepStrictEqual(result['output' as PortId], { type: 'string', value: 'fallback' });
  });

  it('skips undefined values when Ignore undefined is enabled', async () => {
    const node = createNode({ ignoreUndefined: true });

    const result = await node.process({
      input1: { type: 'any', value: undefined },
      input2: { type: 'string', value: 'fallback' },
    } as Inputs);

    assert.deepStrictEqual(result['output' as PortId], { type: 'string', value: 'fallback' });
  });

  it('returns control-flow-excluded when every input is skipped or excluded', async () => {
    const node = createNode({ ignoreNull: true, ignoreUndefined: true });

    const result = await node.process({
      input1: { type: 'any', value: null },
      input2: { type: 'any', value: undefined },
      input3: { type: 'control-flow-excluded', value: undefined },
    } as Inputs);

    assert.deepStrictEqual(result['output' as PortId], { type: 'control-flow-excluded', value: undefined });
  });
});
