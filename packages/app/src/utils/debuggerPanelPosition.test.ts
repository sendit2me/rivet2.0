import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDebuggerPanelPosition } from './debuggerPanelPosition.js';

test('resolveDebuggerPanelPosition falls back to the top-right default without an anchor', () => {
  assert.deepEqual(resolveDebuggerPanelPosition({ viewportWidth: 1200 }), {
    right: 20,
    top: 'calc(56px + var(--project-selector-height))',
  });
});

test('resolveDebuggerPanelPosition places the panel under the trigger and clamps horizontally', () => {
  assert.deepEqual(
    resolveDebuggerPanelPosition({
      anchor: {
        right: 900,
        bottom: 100,
      },
      viewportWidth: 1000,
    }),
    {
      left: 500,
      top: 104,
    },
  );

  assert.deepEqual(
    resolveDebuggerPanelPosition({
      anchor: {
        right: 100,
        bottom: 4,
      },
      viewportWidth: 1000,
    }),
    {
      left: 16,
      top: 16,
    },
  );
});
