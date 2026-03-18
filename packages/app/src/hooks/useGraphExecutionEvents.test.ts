import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphId, GraphRunId } from '@ironclad/rivet-core';
import type { GraphViewKey } from '../domain/graphEditing/navigationActions';
import { removeRunningGraphEntry, updateSelectedGraphRunForGraphStart } from './useGraphExecutionEvents';

test('updateSelectedGraphRunForGraphStart preserves explicit historical selection', () => {
  assert.deepEqual(
    updateSelectedGraphRunForGraphStart(
      {
        'root:graph-a': 'graph-run-1' as GraphRunId,
        'root:graph-b': 'latest',
      },
      'root:graph-a' as GraphViewKey,
    ),
    {
      'root:graph-a': 'graph-run-1' as GraphRunId,
      'root:graph-b': 'latest',
    },
  );
});

test('updateSelectedGraphRunForGraphStart follows latest when unset or already latest', () => {
  assert.deepEqual(updateSelectedGraphRunForGraphStart({}, 'root:graph-a' as GraphViewKey), { 'root:graph-a': 'latest' });
  assert.deepEqual(
    updateSelectedGraphRunForGraphStart(
      {
        'root:graph-a': 'latest',
      },
      'root:graph-a' as GraphViewKey,
    ),
    {
      'root:graph-a': 'latest',
    },
  );
});

test('removeRunningGraphEntry removes only one matching running graph occurrence', () => {
  assert.deepEqual(
    removeRunningGraphEntry(
      ['graph-a' as GraphId, 'graph-b' as GraphId, 'graph-a' as GraphId],
      'graph-a' as GraphId,
    ),
    ['graph-b' as GraphId, 'graph-a' as GraphId],
  );
  assert.deepEqual(
    removeRunningGraphEntry(['graph-a' as GraphId, 'graph-b' as GraphId], 'graph-c' as GraphId),
    ['graph-a' as GraphId, 'graph-b' as GraphId],
  );
});
