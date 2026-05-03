import { useAtomValue } from 'jotai';
import { ioDefinitionsForNodeState } from '../state/graph.js';
import { type NodeId } from '@valerypopoff/rivet2-core';
import { canvasIoDefinitionsForNodeState } from '../state/selectors/canvasGraphSelectors.js';

export function useNodeIO(nodeId: NodeId | undefined) {
  return useAtomValue(ioDefinitionsForNodeState(nodeId));
}

export function useCanvasNodeIO(nodeId: NodeId | undefined) {
  return useAtomValue(canvasIoDefinitionsForNodeState(nodeId));
}
