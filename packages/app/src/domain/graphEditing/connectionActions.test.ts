import assert from 'node:assert/strict';
import test from 'node:test';
import { type NodeConnection } from '@ironclad/rivet-core';
import {
  areConnectionsEqual,
  createRewireConnectionChange,
  removeMatchingConnection,
  undoRewireConnectionChange,
} from './connectionActions.js';

function makeConnection(connection: Partial<NodeConnection>): NodeConnection {
  return {
    inputNodeId: 'input-node' as any,
    inputId: 'input-port' as any,
    outputNodeId: 'output-node' as any,
    outputId: 'output-port' as any,
    ...connection,
  };
}

test('removeMatchingConnection removes the first endpoint-equal connection', () => {
  const original = makeConnection({});
  const sameEndpointsDifferentObject = makeConnection({});
  const untouched = makeConnection({
    inputNodeId: 'input-2' as any,
    inputId: 'input-2' as any,
  });

  const result = removeMatchingConnection([original, sameEndpointsDifferentObject, untouched], sameEndpointsDifferentObject);

  assert.deepEqual(result, [sameEndpointsDifferentObject, untouched]);
});

test('createRewireConnectionChange rewires to a free input and undo restores the original connection', () => {
  const original = makeConnection({
    inputNodeId: 'input-a' as any,
    inputId: 'in-a' as any,
    outputNodeId: 'output-a' as any,
    outputId: 'out-a' as any,
  });

  const change = createRewireConnectionChange([original], original, {
    outputNodeId: 'output-a' as any,
    outputId: 'out-a' as any,
    inputNodeId: 'input-b' as any,
    inputId: 'in-b' as any,
  });

  assert.equal(change.replacedTargetConnection, undefined);
  assert.deepEqual(change.connections, [
    {
      inputNodeId: 'input-b',
      inputId: 'in-b',
      outputNodeId: 'output-a',
      outputId: 'out-a',
    },
  ]);

  assert.deepEqual(
    undoRewireConnectionChange({
      connections: change.connections,
      newConnection: change.newConnection,
      originalConnection: change.originalConnection,
      replacedTargetConnection: change.replacedTargetConnection,
    }),
    [original],
  );
});

test('createRewireConnectionChange rewires to an occupied input and undo restores both prior connections', () => {
  const original = makeConnection({
    inputNodeId: 'input-a' as any,
    inputId: 'in-a' as any,
    outputNodeId: 'output-a' as any,
    outputId: 'out-a' as any,
  });
  const occupiedTarget = makeConnection({
    inputNodeId: 'input-b' as any,
    inputId: 'in-b' as any,
    outputNodeId: 'output-b' as any,
    outputId: 'out-b' as any,
  });

  const change = createRewireConnectionChange([original, occupiedTarget], original, {
    outputNodeId: 'output-a' as any,
    outputId: 'out-a' as any,
    inputNodeId: 'input-b' as any,
    inputId: 'in-b' as any,
  });

  assert.ok(areConnectionsEqual(change.replacedTargetConnection!, occupiedTarget));
  assert.deepEqual(change.connections, [
    {
      inputNodeId: 'input-b',
      inputId: 'in-b',
      outputNodeId: 'output-a',
      outputId: 'out-a',
    },
  ]);

  const undone = undoRewireConnectionChange({
    connections: change.connections,
    newConnection: change.newConnection,
    originalConnection: change.originalConnection,
    replacedTargetConnection: change.replacedTargetConnection,
  });

  assert.equal(undone.length, 2);
  assert.ok(undone.some((connection) => areConnectionsEqual(connection, original)));
  assert.ok(undone.some((connection) => areConnectionsEqual(connection, occupiedTarget)));
});
