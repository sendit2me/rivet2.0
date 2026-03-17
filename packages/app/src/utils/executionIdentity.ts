import { type GraphExecutionMetadata, type NodeGraph, type Project } from '@ironclad/rivet-core';
import {
  createRootGraphViewContext,
  createSubgraphGraphViewContext,
  type GraphViewContext,
  type GraphViewKey,
} from '../domain/graphEditing/navigationActions.js';

function inferSubgraphViewContextFromProject(options: {
  execution: GraphExecutionMetadata;
  project: Pick<Project, 'graphs'>;
}): GraphViewContext | undefined {
  const { execution, project } = options;
  if (!execution.parentGraphRunId) {
    return undefined;
  }

  const matchingExecutors = (Object.values(project.graphs) as NodeGraph[]).flatMap((graph) =>
    graph.nodes
      .filter(
        (node: NodeGraph['nodes'][number]) =>
          node.type === 'subGraph' &&
          (node.data as { graphId?: GraphExecutionMetadata['graphId'] } | undefined)?.graphId === execution.graphId,
      )
      .map((node: NodeGraph['nodes'][number]) => ({
        parentGraphId: graph.metadata?.id,
        parentNodeId: node.id,
      })),
  );

  if (matchingExecutors.length !== 1) {
    return undefined;
  }

  const match = matchingExecutors[0];
  if (!match?.parentGraphId) {
    return undefined;
  }

  return createSubgraphGraphViewContext({
    graphId: execution.graphId,
    parentGraphId: match.parentGraphId,
    parentNodeId: match.parentNodeId,
  });
}

export function buildGraphViewContextFromExecution(options: {
  execution: GraphExecutionMetadata;
  project: Pick<Project, 'graphs'>;
}): GraphViewContext {
  const { execution, project } = options;

  if (!execution.executor) {
    const inferredSubgraphView = inferSubgraphViewContextFromProject({ execution, project });
    if (inferredSubgraphView) {
      return inferredSubgraphView;
    }

    return createRootGraphViewContext(execution.graphId);
  }

  if (execution.executor.parentGraphId) {
    return createSubgraphGraphViewContext({
      graphId: execution.graphId,
      parentGraphId: execution.executor.parentGraphId,
      parentNodeId: execution.executor.nodeId,
    });
  }

  const parentGraph = (Object.values(project.graphs) as NodeGraph[]).find((graph) =>
    graph.nodes.some((node: NodeGraph['nodes'][number]) => node.id === execution.executor!.nodeId),
  );
  if (!parentGraph?.metadata?.id) {
    return {
      key: `subgraph:${execution.executor.nodeId}:${execution.graphId}`,
      graphId: execution.graphId,
    };
  }

  return createSubgraphGraphViewContext({
    graphId: execution.graphId,
    parentGraphId: parentGraph.metadata.id,
    parentNodeId: execution.executor.nodeId,
  });
}

export function buildGraphViewKeyFromExecution(options: {
  execution: GraphExecutionMetadata;
  project: Pick<Project, 'graphs'>;
}): GraphViewKey {
  return buildGraphViewContextFromExecution(options).key;
}
