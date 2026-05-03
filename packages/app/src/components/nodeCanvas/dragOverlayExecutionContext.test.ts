import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodeId } from '@valerypopoff/rivet2-core';
import { resolveDraggingExecutionContext } from './dragOverlayExecutionContext.js';
import type { PageValue, ProcessDataForNode } from '../../state/dataFlow.js';

test('resolveDraggingExecutionContext uses the dragging node itself for move drags', () => {
  const moveRun = [{ data: { status: { type: 'error', error: 'boom' } } }] as unknown as ProcessDataForNode[];

  const context = resolveDraggingExecutionContext({
    dragMode: 'move',
    draggingNodeId: 'node-a' as NodeId,
    draggingSourceNodeIds: ['node-a' as NodeId],
    index: 0,
    expandedOutputNodeIdSet: new Set(['node-a' as NodeId]),
    lastRunPerNode: {
      ['node-a' as NodeId]: moveRun,
    },
    selectedProcessPagePerNode: {
      ['node-a' as NodeId]: 2 as PageValue,
    },
  });

  assert.equal(context.executionSourceNodeId, 'node-a');
  assert.equal(context.isOutputExpanded, true);
  assert.equal(context.lastRun, moveRun);
  assert.equal(context.processPage, 2);
});

test('resolveDraggingExecutionContext maps duplicate preview nodes back to the source node execution context', () => {
  const sourceRun = [{ data: { status: { type: 'error', error: 'boom' } } }] as unknown as ProcessDataForNode[];

  const context = resolveDraggingExecutionContext({
    dragMode: 'duplicate',
    draggingNodeId: 'preview-a' as NodeId,
    draggingSourceNodeIds: ['source-a' as NodeId, 'source-b' as NodeId],
    index: 0,
    expandedOutputNodeIdSet: new Set(['source-a' as NodeId]),
    lastRunPerNode: {
      ['source-a' as NodeId]: sourceRun,
    },
    selectedProcessPagePerNode: {
      ['source-a' as NodeId]: 'latest',
      ['source-b' as NodeId]: 1 as PageValue,
    },
  });

  assert.equal(context.executionSourceNodeId, 'source-a');
  assert.equal(context.isOutputExpanded, true);
  assert.equal(context.lastRun, sourceRun);
  assert.equal(context.processPage, 'latest');
});

test('resolveDraggingExecutionContext falls back safely when duplicate preview ordering data is incomplete', () => {
  const context = resolveDraggingExecutionContext({
    dragMode: 'duplicate',
    draggingNodeId: 'preview-a' as NodeId,
    draggingSourceNodeIds: [],
    index: 0,
    expandedOutputNodeIdSet: new Set(),
    lastRunPerNode: {},
    selectedProcessPagePerNode: {},
  });

  assert.equal(context.executionSourceNodeId, 'preview-a');
  assert.equal(context.isOutputExpanded, false);
  assert.equal(context.lastRun, undefined);
  assert.equal(context.processPage, 'latest');
});
