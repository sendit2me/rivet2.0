import { type NodeId } from '@ironclad/rivet-core';
import { useDuplicateNodeCommand } from '../commands/duplicateNodeCommand.js';

export function useDuplicateNode() {
  const duplicateNode = useDuplicateNodeCommand();

  return (nodeId: NodeId) => {
    duplicateNode({ nodeId });
  };
}
