import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { GetGlobalNodeImpl, type Inputs, type InternalProcessContext } from '../../../src/index.js';

describe('GetGlobalNode', () => {
  it('waits by default instead of returning an on-demand function', () => {
    const node = GetGlobalNodeImpl.create();

    assert.equal(node.data.onDemand, false);
    assert.equal(node.data.wait, true);
  });

  it('marks On Demand and Wait as mutually exclusive editor toggles', () => {
    const node = new GetGlobalNodeImpl(GetGlobalNodeImpl.create());
    const editors = node.getEditors();

    assert.deepStrictEqual(
      editors.map((editor) => ({
        type: editor.type,
        label: editor.label,
        dataKey: 'dataKey' in editor ? editor.dataKey : undefined,
        includeInGraphSearch: editor.includeInGraphSearch,
        turnOffDataKeysWhenEnabled:
          editor.type === 'toggle' ? editor.turnOffDataKeysWhenEnabled : undefined,
      })),
      [
        {
          type: 'custom',
          label: 'Search Global Variables',
          dataKey: undefined,
          includeInGraphSearch: undefined,
          turnOffDataKeysWhenEnabled: undefined,
        },
        {
          type: 'string',
          label: 'Variable ID',
          dataKey: 'id',
          includeInGraphSearch: true,
          turnOffDataKeysWhenEnabled: undefined,
        },
        {
          type: 'dataTypeSelector',
          label: 'Data Type',
          dataKey: 'dataType',
          includeInGraphSearch: undefined,
          turnOffDataKeysWhenEnabled: undefined,
        },
        {
          type: 'toggle',
          label: 'On Demand',
          dataKey: 'onDemand',
          includeInGraphSearch: undefined,
          turnOffDataKeysWhenEnabled: ['wait'],
        },
        {
          type: 'toggle',
          label: 'Wait',
          dataKey: 'wait',
          includeInGraphSearch: undefined,
          turnOffDataKeysWhenEnabled: ['onDemand'],
        },
      ],
    );
  });

  it('uses a string input port for dynamic variable IDs regardless of value data type', () => {
    const chartNode = GetGlobalNodeImpl.create();
    chartNode.data.useIdInput = true;
    chartNode.data.dataType = 'number';

    const node = new GetGlobalNodeImpl(chartNode);

    assert.deepStrictEqual(node.getInputDefinitions(), [
      {
        id: 'id',
        title: 'Variable ID',
        dataType: 'string',
      },
    ]);
  });

  it('returns the variable ID output in on-demand mode', async () => {
    const chartNode = GetGlobalNodeImpl.create();
    chartNode.data.id = 'static-id';
    chartNode.data.onDemand = true;
    chartNode.data.wait = false;
    const node = new GetGlobalNodeImpl(chartNode);
    const context = {
      getGlobal: (id: string) => (id === 'static-id' ? { type: 'string', value: 'global value' } : undefined),
    } as InternalProcessContext;

    const outputs = await node.process({} as Inputs, context);

    assert.deepEqual(outputs['variable_id_out'], { type: 'string', value: 'static-id' });
    assert.equal(outputs.value?.type, 'fn<string>');
    assert.equal(typeof outputs.value?.value, 'function');
    assert.equal((outputs.value?.value as () => unknown)(), 'global value');
  });

  it('rejects on-demand plus wait before reading dynamic IDs', async () => {
    const chartNode = GetGlobalNodeImpl.create();
    chartNode.data.onDemand = true;
    chartNode.data.wait = true;
    chartNode.data.useIdInput = true;
    const node = new GetGlobalNodeImpl(chartNode);

    await assert.rejects(
      () => node.process({} as Inputs, {} as InternalProcessContext),
      /Cannot use onDemand and wait together/,
    );
  });
});
