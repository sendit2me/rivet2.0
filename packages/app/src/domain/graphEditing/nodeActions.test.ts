import assert from 'node:assert/strict';
import test from 'node:test';
import { globalRivetNodeRegistry } from '@ironclad/rivet-core';
import { duplicateNodeWithConnections } from './nodeActions';

test('duplicateNodeWithConnections clones nested node data independently', () => {
  const node = globalRivetNodeRegistry.createDynamic('chat');
  (node.data as any) = {
    nested: {
      temperature: 0.5,
    },
  };

  const { newNode } = duplicateNodeWithConnections({
    node,
    connections: [],
  });

  ((newNode.data as any).nested as { temperature: number }).temperature = 0.9;

  assert.equal((node.data as any).nested.temperature, 0.5);
  assert.equal((newNode.data as any).nested.temperature, 0.9);
});
