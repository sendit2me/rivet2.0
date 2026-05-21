import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  SetGlobalNodeImpl,
  type Inputs,
  type InternalProcessContext,
  type ScalarOrArrayDataValue,
} from '../../../src/index.js';

describe('SetGlobalNode', () => {
  it('marks the variable ID editor as searchable by graph search', () => {
    const node = new SetGlobalNodeImpl(SetGlobalNodeImpl.create());
    const idEditor = node.getEditors().find((editor) => 'dataKey' in editor && editor.dataKey === 'id');

    assert.equal(idEditor?.includeInGraphSearch, true);
  });

  it('reads the previous value from the dynamic variable ID input', async () => {
    const chartNode = SetGlobalNodeImpl.create();
    chartNode.data.id = 'static-id';
    chartNode.data.useIdInput = true;

    const globals = new Map<string, ScalarOrArrayDataValue>([
      ['static-id', { type: 'string', value: 'static old value' }],
      ['dynamic-id', { type: 'string', value: 'dynamic old value' }],
    ]);
    const context = {
      getGlobal: (id: string) => globals.get(id),
      setGlobal: (id: string, value: ScalarOrArrayDataValue) => {
        globals.set(id, value);
      },
    } as InternalProcessContext;
    const node = new SetGlobalNodeImpl(chartNode);

    const outputs = await node.process(
      {
        value: { type: 'string', value: 'new value' },
        id: { type: 'string', value: 'dynamic-id' },
      } as Inputs,
      context,
    );

    assert.deepEqual(outputs['previous-value'], { type: 'string', value: 'dynamic old value' });
    assert.deepEqual(globals.get('dynamic-id'), { type: 'string', value: 'new value' });
    assert.deepEqual(globals.get('static-id'), { type: 'string', value: 'static old value' });
  });
});
