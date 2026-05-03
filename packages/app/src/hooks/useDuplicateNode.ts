import { type NodeId } from '@rivet2/rivet-core';
import { useDuplicateNodeCommand } from '../commands/duplicateNodeCommand.js';

export function useDuplicateNode() {
  const duplicateNode = useDuplicateNodeCommand();

  return (nodeId: NodeId) => {
    duplicateNode({ nodeId });
  };
}
