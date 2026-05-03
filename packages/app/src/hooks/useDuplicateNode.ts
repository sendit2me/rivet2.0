import { type NodeId } from '@valerypopoff/rivet2-core';
import { useDuplicateNodeCommand } from '../commands/duplicateNodeCommand.js';

export function useDuplicateNode() {
  const duplicateNode = useDuplicateNodeCommand();

  return (nodeId: NodeId) => {
    duplicateNode({ nodeId });
  };
}
