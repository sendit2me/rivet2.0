import { useAtom, useAtomValue } from 'jotai';
import { savedGraphsState } from '../state/savedGraphs';
import { graphState } from '../state/graph';
import { graphNavigationStackState } from '../state/graphBuilder';
import { useEffect } from 'react';
import { createInitialGraphNavigationStack } from '../domain/graphEditing/navigationActions.js';

export function useInitializeGraphNavigationStack() {
  const savedGraphs = useAtomValue(savedGraphsState);
  const graph = useAtomValue(graphState);
  const [graphNavigationStack, setGraphNavigationStack] = useAtom(graphNavigationStackState);

  useEffect(() => {
    const initialStack = createInitialGraphNavigationStack({
      currentGraphId: graph.metadata?.id,
      availableGraphIds: savedGraphs.map((savedGraph) => savedGraph.metadata!.id!),
      existingStack: graphNavigationStack,
    });

    if (initialStack) {
      setGraphNavigationStack(initialStack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
