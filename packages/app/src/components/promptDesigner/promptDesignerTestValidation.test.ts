import test from 'node:test';
import assert from 'node:assert/strict';
import type { GraphId, NodeGraph, Project } from '@rivet2/rivet-core';
import { resolvePromptDesignerEvaluatorGraph } from './promptDesignerTestValidation.js';

const graphId = 'evaluator-graph' as GraphId;

function makeProject(graphs: Record<GraphId, NodeGraph>): Pick<Project, 'graphs'> {
  return { graphs };
}

test('resolvePromptDesignerEvaluatorGraph rejects an unchosen evaluator graph', () => {
  assert.throws(
    () => resolvePromptDesignerEvaluatorGraph(makeProject({}), { evaluatorGraphId: '' as GraphId }),
    /Choose an evaluator graph/,
  );
});

test('resolvePromptDesignerEvaluatorGraph rejects an unavailable evaluator graph', () => {
  assert.throws(
    () => resolvePromptDesignerEvaluatorGraph(makeProject({}), { evaluatorGraphId: graphId }),
    /not available/,
  );
});

test('resolvePromptDesignerEvaluatorGraph returns the selected evaluator graph', () => {
  const graph = { metadata: { id: graphId, name: 'Evaluator' }, nodes: [], connections: [] } as NodeGraph;

  assert.deepEqual(resolvePromptDesignerEvaluatorGraph(makeProject({ [graphId]: graph }), { evaluatorGraphId: graphId }), {
    graphId,
    graph,
  });
});
