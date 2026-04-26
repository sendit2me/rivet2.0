import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { ToTreeNodeImpl, type DataValue, type ToTreeNode } from '../../../src/index.js';

const createNode = (data: Partial<ToTreeNode['data']>) => {
  return new ToTreeNodeImpl({
    ...ToTreeNodeImpl.create(),
    data: {
      ...ToTreeNodeImpl.create().data,
      ...data,
    },
  });
};

describe('ToTreeNode', () => {
  it('uses interpolation against each row object without creating graph input ports', async () => {
    const node = createNode({
      format: '{{path}}: {{label}}',
      childrenProperty: 'children',
      useSortAlphabetically: false,
    });

    assert.deepStrictEqual(
      node.getInputDefinitions().map((definition) => definition.id),
      ['objects'],
    );

    const result = await node.process({
      objects: {
        type: 'object[]',
        value: [
          {
            path: 'root',
            label: 'Root',
            children: [
              {
                path: 'child',
                label: 'Child',
              },
            ],
          },
        ],
      } as DataValue,
    });

    assert.equal(typeof result.tree?.value, 'string');
    assert.match(result.tree.value as string, /^root: Root\n/);
    assert.match(result.tree.value as string, /child: Child\n$/);
  });
});
