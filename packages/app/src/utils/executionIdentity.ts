import { type GraphExecutionMetadata } from '@ironclad/rivet-core';
import {
  createRootGraphViewContext,
  createSubgraphGraphViewContext,
  type GraphViewContext,
  type GraphViewKey,
} from '../domain/graphEditing/navigationActions.js';

export function buildGraphViewContextFromExecution(options: {
  execution: GraphExecutionMetadata;
}): GraphViewContext {
  const { execution } = options;

  if (!execution.executor) {
    return createRootGraphViewContext(execution.graphId);
  }

  return createSubgraphGraphViewContext({
    graphId: execution.graphId,
    parentGraphId: execution.executor.parentGraphId,
    parentNodeId: execution.executor.nodeId,
  });
}

export function buildGraphViewKeyFromExecution(options: {
  execution: GraphExecutionMetadata;
}): GraphViewKey {
  return buildGraphViewContextFromExecution(options).key;
}
