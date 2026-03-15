import { useSetAtom } from 'jotai';
import { graphState } from '../state/graph';
import { duplicateGraph } from '../utils/duplicateGraph';
import { savedGraphsState } from '../state/savedGraphs';
import { useCenterViewOnGraph } from './useCenterViewOnGraph';
import { useIOProvider } from '../providers/ProvidersContext';

export function useImportGraph() {
  const ioProvider = useIOProvider();
  const setGraphData = useSetAtom(graphState);
  const setSavedGraphs = useSetAtom(savedGraphsState);
  const centerViewOnGraph = useCenterViewOnGraph();

  return () => {
    ioProvider.loadGraphData((data) => {
      // Duplicate so that we get a fresh set of IDs for the imported graph
      const duplicated = duplicateGraph(data);
      setGraphData(duplicated);
      setSavedGraphs((prev) => [...prev, duplicated]);
      centerViewOnGraph(duplicated);
    });
  };
}
