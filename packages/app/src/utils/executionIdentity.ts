import { type GraphExecutionMetadata, type GraphId } from '@rivet2/rivet-core';
import {
  createRootGraphViewContext,
  createSubgraphGraphViewContext,
  type GraphViewContext,
  type GraphViewKey,
} from '../domain/graphEditing/navigationActions.js';

export function buildGraphViewContextFromExecution(options: {
  execution?: GraphExecutionMetadata;
  graphIdFallback?: GraphId;
}): GraphViewContext {
  const { execution, graphIdFallback } = options;
  const graphId = execution?.graphId ?? graphIdFallback;

  if (!graphId) {
    throw new Error('Cannot build graph view context without graph execution metadata or a graph id fallback.');
  }

  if (!execution?.executor) {
    return createRootGraphViewContext(graphId);
  }

  return createSubgraphGraphViewContext({
    graphId,
    parentGraphId: execution.executor.parentGraphId,
    parentNodeId: execution.executor.nodeId,
  });
}

export function buildGraphViewKeyFromExecution(options: {
  execution?: GraphExecutionMetadata;
  graphIdFallback?: GraphId;
}): GraphViewKey {
  return buildGraphViewContextFromExecution(options).key;
}
