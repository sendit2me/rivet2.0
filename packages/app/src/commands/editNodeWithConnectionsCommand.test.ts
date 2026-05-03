import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodeId } from '@valerypopoff/rivet2-core';
import { shouldMergeEditNodeWithConnectionsCommand } from './editNodeWithConnectionsCommand.js';

test('editNodeWithConnections merge helper only merges recent edits for the same node and command type', () => {
  const recentMatchingCommand = {
    timestamp: 10_000,
    command: {
      type: 'editNodeWithConnections',
    },
    data: {
      nodeId: 'node-a' as NodeId,
    },
  };

  assert.equal(
    shouldMergeEditNodeWithConnectionsCommand(recentMatchingCommand as any, 'node-a' as NodeId, 12_000),
    true,
  );
  assert.equal(
    shouldMergeEditNodeWithConnectionsCommand(recentMatchingCommand as any, 'node-b' as NodeId, 12_000),
    false,
  );
  assert.equal(
    shouldMergeEditNodeWithConnectionsCommand(
      {
        ...recentMatchingCommand,
        command: {
          type: 'editNode',
        },
      } as any,
      'node-a' as NodeId,
      12_000,
    ),
    false,
  );
  assert.equal(
    shouldMergeEditNodeWithConnectionsCommand(recentMatchingCommand as any, 'node-a' as NodeId, 16_100),
    false,
  );
});
