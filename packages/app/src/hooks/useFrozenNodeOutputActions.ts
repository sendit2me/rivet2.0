import type { GraphId, NodeId } from '@valerypopoff/rivet2-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { toast } from 'react-toastify';
import { useDataRefs } from '../providers/ProvidersContext.js';
import { frozenNodeOutputsState, lastRunDataByNodeState, resolvedGraphSelectionState } from '../state/dataFlow.js';
import { selectedExecutorState } from '../state/settings.js';
import {
  assertFrozenNodeOutputsSerializableForInternalExecutor,
  captureFrozenNodeOutputs,
  removeFrozenNodeOutputsForNode,
  setFrozenNodeOutputsForNode,
} from '../utils/frozenNodeOutputs.js';
import { useStableCallback } from './useStableCallback.js';

export function useFrozenNodeOutputActions() {
  const dataRefs = useDataRefs();
  const lastRunData = useAtomValue(lastRunDataByNodeState);
  const graphSelection = useAtomValue(resolvedGraphSelectionState);
  const selectedExecutor = useAtomValue(selectedExecutorState);
  const setFrozenNodeOutputs = useSetAtom(frozenNodeOutputsState);

  const freezeNode = useStableCallback((graphId: GraphId, nodeId: NodeId): boolean => {
    try {
      const outputInstances = captureFrozenNodeOutputs({
        dataRefs,
        graphId,
        nodeId,
        processData: lastRunData[nodeId],
        selection: graphSelection,
      });

      if (selectedExecutor === 'nodejs') {
        assertFrozenNodeOutputsSerializableForInternalExecutor(outputInstances);
      }

      setFrozenNodeOutputs((previous) => setFrozenNodeOutputsForNode(previous, graphId, nodeId, outputInstances));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not freeze node output');
      return false;
    }
  });

  const unfreezeNode = useStableCallback((graphId: GraphId, nodeId: NodeId): void => {
    setFrozenNodeOutputs((previous) => removeFrozenNodeOutputsForNode(previous, graphId, nodeId));
  });

  return {
    freezeNode,
    unfreezeNode,
  };
}
