import type { GraphId, NodeGraph, NodeTestGroup, Project } from '@rivet2/rivet-core';

export function resolvePromptDesignerEvaluatorGraph(
  project: Pick<Project, 'graphs'>,
  testGroup: Pick<NodeTestGroup, 'evaluatorGraphId'>,
): { graphId: GraphId; graph: NodeGraph } {
  const graphId = testGroup.evaluatorGraphId;

  if (!graphId) {
    throw new Error('Choose an evaluator graph before running this Prompt Designer test group.');
  }

  const graph = project.graphs[graphId];

  if (!graph) {
    throw new Error('The selected evaluator graph is not available in this project.');
  }

  return { graphId, graph };
}
