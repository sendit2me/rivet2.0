import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphId, GraphRunId, NodeId, ProcessId, RootRunId } from '@valerypopoff/rivet2-core';
import { buildGraphViewContextFromExecution, buildGraphViewKeyFromExecution } from './executionIdentity.js';

test('buildGraphViewContextFromExecution falls back to a root graph view when execution metadata is missing', () => {
  const graphId = 'graph-a' as GraphId;

  assert.deepEqual(
    buildGraphViewContextFromExecution({
      graphIdFallback: graphId,
    }),
    {
      key: 'root:graph-a',
      graphId,
    },
  );
});

test('buildGraphViewKeyFromExecution uses subgraph identity when executor metadata is present', () => {
  assert.equal(
    buildGraphViewKeyFromExecution({
      execution: {
        rootRunId: 'root-run' as RootRunId,
        graphRunId: 'graph-run' as GraphRunId,
        graphId: 'graph-child' as GraphId,
        parentGraphRunId: 'parent-run' as GraphRunId,
        executor: {
          nodeId: 'node-a' as NodeId,
          parentGraphId: 'graph-parent' as GraphId,
          processId: 'process-a' as ProcessId,
        },
      },
    }),
    'subgraph:graph-parent:node-a:graph-child',
  );
});
