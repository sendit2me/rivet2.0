import assert from 'node:assert/strict';
import test from 'node:test';
import { type NodeId } from '@valerypopoff/rivet2-core';
import { shouldMergeEditNodeCommand } from './editNodeCommand.js';

test('editNode merge helper only merges recent edits for the same node and command type', () => {
  const recentMatchingCommand = {
    timestamp: 10_000,
    command: {
      type: 'editNode',
    },
    data: {
      nodeId: 'node-a' as NodeId,
    },
  };

  assert.equal(shouldMergeEditNodeCommand(recentMatchingCommand as any, 'node-a' as NodeId, 12_000), true);
  assert.equal(shouldMergeEditNodeCommand(recentMatchingCommand as any, 'node-b' as NodeId, 12_000), false);
  assert.equal(
    shouldMergeEditNodeCommand(
      {
        ...recentMatchingCommand,
        command: {
          type: 'editNodeWithConnections',
        },
      } as any,
      'node-a' as NodeId,
      12_000,
    ),
    false,
  );
  assert.equal(shouldMergeEditNodeCommand(recentMatchingCommand as any, 'node-a' as NodeId, 16_100), false);
});
