import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuiltInRegistry } from '@ironclad/rivet-core';
import { createPastedNodes, duplicateNodeWithConnections } from './nodeActions';

test('duplicateNodeWithConnections clones nested node data independently', () => {
  const registry = createBuiltInRegistry();
  const node = registry.createDynamic('chat');
  (node.data as any) = {
    nested: {
      temperature: 0.5,
    },
  };

  const { newNode } = duplicateNodeWithConnections({
    node,
    connections: [],
    registry,
  });

  ((newNode.data as any).nested as { temperature: number }).temperature = 0.9;

  assert.equal((node.data as any).nested.temperature, 0.5);
  assert.equal((newNode.data as any).nested.temperature, 0.9);
});

test('createPastedNodes remaps node ids and internal connections from the new anchor position', () => {
  const registry = createBuiltInRegistry();
  const source = registry.createDynamic('chat');
  const target = registry.createDynamic('chat');

  source.visualData.x = 10;
  source.visualData.y = 20;
  target.visualData.x = 110;
  target.visualData.y = 220;

  const { newNodes, newConnections } = createPastedNodes({
    nodes: [source, target],
    connections: [
      {
        inputNodeId: target.id,
        inputId: 'prompt' as any,
        outputNodeId: source.id,
        outputId: 'messages' as any,
      },
    ],
    position: { x: 500, y: 600 },
  });

  assert.equal(newNodes.length, 2);
  assert.equal(newConnections.length, 1);
  assert.equal(newNodes[0]!.visualData.x, 500);
  assert.equal(newNodes[0]!.visualData.y, 600);
  assert.equal(newNodes[1]!.visualData.x, 600);
  assert.equal(newNodes[1]!.visualData.y, 800);
  assert.notEqual(newNodes[0]!.id, source.id);
  assert.notEqual(newNodes[1]!.id, target.id);
  assert.equal(newConnections[0]!.outputNodeId, newNodes[0]!.id);
  assert.equal(newConnections[0]!.inputNodeId, newNodes[1]!.id);
});
