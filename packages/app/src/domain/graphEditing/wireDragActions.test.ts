import assert from 'node:assert/strict';
import test from 'node:test';
import { type NodeConnection } from '@ironclad/rivet-core';
import {
  getCanvasPreviewConnections,
  resolveWireDragAction,
  shouldContinueDraggingAfterWireAction,
} from './wireDragActions.js';

function makeConnection(connection: Partial<NodeConnection>): NodeConnection {
  return {
    inputNodeId: 'input-node' as any,
    inputId: 'input-port' as any,
    outputNodeId: 'output-node' as any,
    outputId: 'output-port' as any,
    ...connection,
  };
}

test('resolveWireDragAction creates a make-connection action for a normal output drag', () => {
  const action = resolveWireDragAction({
    draggingWire: {
      startNodeId: 'output-a' as any,
      startPortId: 'out-a' as any,
    },
    dropTarget: {
      nodeId: 'input-a' as any,
      portId: 'in-a' as any,
    },
  });

  assert.deepEqual(action, {
    type: 'makeConnection',
    params: {
      outputNodeId: 'output-a',
      outputId: 'out-a',
      inputNodeId: 'input-a',
      inputId: 'in-a',
    },
  });
});

test('resolveWireDragAction creates a rewire action for a connected-input drag to a new target', () => {
  const originalConnection = makeConnection({
    inputNodeId: 'input-a' as any,
    inputId: 'in-a' as any,
    outputNodeId: 'output-a' as any,
    outputId: 'out-a' as any,
  });

  const action = resolveWireDragAction({
    draggingWire: {
      startNodeId: 'output-a' as any,
      startPortId: 'out-a' as any,
      originalConnection,
      rewireSourceInput: {
        nodeId: 'input-a' as any,
        portId: 'in-a' as any,
      },
    },
    dropTarget: {
      nodeId: 'input-b' as any,
      portId: 'in-b' as any,
    },
  });

  assert.deepEqual(action, {
    type: 'rewireConnection',
    originalConnection,
    params: {
      outputNodeId: 'output-a',
      outputId: 'out-a',
      inputNodeId: 'input-b',
      inputId: 'in-b',
    },
  });
});

test('resolveWireDragAction treats dropping back on the original input as a no-op', () => {
  const originalConnection = makeConnection({
    inputNodeId: 'input-a' as any,
    inputId: 'in-a' as any,
    outputNodeId: 'output-a' as any,
    outputId: 'out-a' as any,
  });

  const action = resolveWireDragAction({
    draggingWire: {
      startNodeId: 'output-a' as any,
      startPortId: 'out-a' as any,
      originalConnection,
      rewireSourceInput: {
        nodeId: 'input-a' as any,
        portId: 'in-a' as any,
      },
    },
    dropTarget: {
      nodeId: 'input-a' as any,
      portId: 'in-a' as any,
    },
  });

  assert.deepEqual(action, { type: 'none', reason: 'sameEndpoint' });
});

test('resolveWireDragAction treats empty-canvas release from a connected input as a disconnect', () => {
  const originalConnection = makeConnection({
    inputNodeId: 'input-a' as any,
    inputId: 'in-a' as any,
  });

  const action = resolveWireDragAction({
    draggingWire: {
      startNodeId: 'output-a' as any,
      startPortId: 'out-a' as any,
      originalConnection,
      rewireSourceInput: {
        nodeId: 'input-a' as any,
        portId: 'in-a' as any,
      },
    },
  });

  assert.deepEqual(action, {
    type: 'breakConnection',
    connection: originalConnection,
  });
});

test('getCanvasPreviewConnections hides the original connection during input-origin rewire', () => {
  const originalConnection = makeConnection({
    inputNodeId: 'input-a' as any,
    inputId: 'in-a' as any,
  });
  const untouchedConnection = makeConnection({
    inputNodeId: 'input-b' as any,
    inputId: 'in-b' as any,
  });

  const previewConnections = getCanvasPreviewConnections([originalConnection, untouchedConnection], {
    originalConnection: {
      ...originalConnection,
    },
  });

  assert.deepEqual(previewConnections, [untouchedConnection]);
});

test('shouldContinueDraggingAfterWireAction keeps sticky drag for empty-canvas no-op output drags', () => {
  const action = resolveWireDragAction({
    draggingWire: {
      startNodeId: 'output-a' as any,
      startPortId: 'out-a' as any,
    },
  });

  assert.equal(shouldContinueDraggingAfterWireAction(action, true), true);
});

test('shouldContinueDraggingAfterWireAction cancels sticky drag when rewiring back to the original input', () => {
  const originalConnection = makeConnection({
    inputNodeId: 'input-a' as any,
    inputId: 'in-a' as any,
    outputNodeId: 'output-a' as any,
    outputId: 'out-a' as any,
  });

  const action = resolveWireDragAction({
    draggingWire: {
      startNodeId: 'output-a' as any,
      startPortId: 'out-a' as any,
      originalConnection,
      rewireSourceInput: {
        nodeId: 'input-a' as any,
        portId: 'in-a' as any,
      },
    },
    dropTarget: {
      nodeId: 'input-a' as any,
      portId: 'in-a' as any,
    },
  });

  assert.equal(shouldContinueDraggingAfterWireAction(action, true), false);
});
