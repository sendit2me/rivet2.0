import { type GraphId, type Project } from '@ironclad/rivet-core';

export type GraphNavigationStack = {
  stack: GraphId[];
  index?: number;
};

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
    return { index: 0, stack: [options.currentGraphId] };
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
}): { nextStack: GraphNavigationStack; targetGraphId: GraphId } | undefined {
  const { direction, navigationStack } = options;

  if (direction === 'backward') {
    if ((navigationStack.index ?? -1) <= 0) {
      return undefined;
    }

    const targetIndex = navigationStack.index! - 1;
    const targetGraphId = navigationStack.stack[targetIndex];
    if (!targetGraphId || !options.project.graphs[targetGraphId]) {
      return undefined;
    }

    return {
      nextStack: {
        ...navigationStack,
        index: targetIndex,
      },
      targetGraphId,
    };
  }

  if (navigationStack.index == null || navigationStack.index >= navigationStack.stack.length - 1) {
    return undefined;
  }

  const targetIndex = navigationStack.index + 1;
  const targetGraphId = navigationStack.stack[targetIndex];
  if (!targetGraphId || !options.project.graphs[targetGraphId]) {
    return undefined;
  }

  return {
    nextStack: {
      ...navigationStack,
      index: targetIndex,
    },
    targetGraphId,
  };
}
