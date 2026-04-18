import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowMultiNodeAlignmentToolbar } from './MultiNodeAlignmentToolbar.js';

test('shouldShowMultiNodeAlignmentToolbar only shows for editable multi-selection sessions', () => {
  assert.equal(
    shouldShowMultiNodeAlignmentToolbar({
      selectedNodeCount: 1,
      isDraggingNode: false,
      isReadOnlyGraph: false,
    }),
    false,
  );

  assert.equal(
    shouldShowMultiNodeAlignmentToolbar({
      selectedNodeCount: 2,
      isDraggingNode: true,
      isReadOnlyGraph: false,
    }),
    false,
  );

  assert.equal(
    shouldShowMultiNodeAlignmentToolbar({
      selectedNodeCount: 2,
      isDraggingNode: false,
      isReadOnlyGraph: true,
    }),
    false,
  );

  assert.equal(
    shouldShowMultiNodeAlignmentToolbar({
      selectedNodeCount: 2,
      isDraggingNode: false,
      isReadOnlyGraph: false,
    }),
    true,
  );
});
