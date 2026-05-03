import { type GraphId, type NodeId, type Project } from '@rivet2/rivet-core';

export type GraphViewKey = string;

export type GraphViewContext = {
  key: GraphViewKey;
  graphId: GraphId;
  parent?: {
    parentGraphId: GraphId;
    parentNodeId: NodeId;
  };
};

export type GraphNavigationStack = {
  stack: GraphViewContext[];
  index?: number;
};

export function createRootGraphViewContext(graphId: GraphId): GraphViewContext {
  return {
    key: `root:${graphId}`,
    graphId,
  };
}

export function createSubgraphGraphViewContext(options: {
  graphId: GraphId;
  parentGraphId: GraphId;
  parentNodeId: NodeId;
}): GraphViewContext {
  return {
    key: `subgraph:${options.parentGraphId}:${options.parentNodeId}:${options.graphId}`,
    graphId: options.graphId,
    parent: {
      parentGraphId: options.parentGraphId,
      parentNodeId: options.parentNodeId,
    },
  };
}

export function createInitialGraphNavigationStack(options: {
  currentGraphId?: GraphId;
  availableGraphIds: GraphId[];
  existingStack: GraphNavigationStack;
}): GraphNavigationStack | undefined {
  if (
    options.existingStack.stack.length === 0 &&
    options.currentGraphId != null &&
    options.availableGraphIds.includes(options.currentGraphId)
  ) {
    return { index: 0, stack: [createRootGraphViewContext(options.currentGraphId)] };
  }

  return undefined;
}

export function getGraphNavigationAvailability(stack: GraphNavigationStack) {
  return {
    hasForward: stack.index != null && stack.index < stack.stack.length - 1,
    hasBackward: (stack.index ?? -1) > 0,
  };
}

export function resolveNavigationTarget(options: {
  direction: 'backward' | 'forward';
  navigationStack: GraphNavigationStack;
  project: Pick<Project, 'graphs'>;
}): { nextStack: GraphNavigationStack; targetGraphId: GraphId; targetView: GraphViewContext } | undefined {
  const { direction, navigationStack } = options;

  if (direction === 'backward') {
    if ((navigationStack.index ?? -1) <= 0) {
      return undefined;
    }

    const targetIndex = navigationStack.index! - 1;
    const targetView = navigationStack.stack[targetIndex];
    const targetGraphId = targetView?.graphId;
    if (!targetGraphId || !options.project.graphs[targetGraphId]) {
      return undefined;
    }

    return {
      nextStack: {
        ...navigationStack,
        index: targetIndex,
      },
      targetView,
      targetGraphId,
    };
  }

  if (navigationStack.index == null || navigationStack.index >= navigationStack.stack.length - 1) {
    return undefined;
  }

  const targetIndex = navigationStack.index + 1;
  const targetView = navigationStack.stack[targetIndex];
  const targetGraphId = targetView?.graphId;
  if (!targetGraphId || !options.project.graphs[targetGraphId]) {
    return undefined;
  }

  return {
    nextStack: {
      ...navigationStack,
      index: targetIndex,
    },
    targetView,
    targetGraphId,
  };
}
