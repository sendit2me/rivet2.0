import { type NodeId } from '@ironclad/rivet-core';
import { connectionsForSingleNodeState } from './selectors/graphSelectors';
import { ioDefinitionsForNodeState } from './selectors/ioDefinitions';
import { nodeByIdState, nodeInstanceByIdState } from './selectors/nodeSelectors';

export {
  connectionsState,
  graphMetadataState,
  graphState,
  historicalChangedNodesState,
  historicalGraphState,
  isReadOnlyGraphState,
  nodesState,
} from './atoms/graph';
export {
  connectionsForNodeState,
  nodesByIdState,
  nodesForConnectionState,
} from './selectors/graphSelectors';
export { connectionsForSingleNodeState } from './selectors/graphSelectors';
export { ioDefinitionsForNodeState } from './selectors/ioDefinitions';
export { nodeByIdState, nodeConstructorsState, nodeInstanceByIdState, nodeInstancesState } from './selectors/nodeSelectors';

export function removeGraphNodeStateFamilies(nodeId: NodeId): void {
  connectionsForSingleNodeState.remove(nodeId);
  nodeByIdState.remove(nodeId);
  nodeInstanceByIdState.remove(nodeId);
  ioDefinitionsForNodeState.remove(nodeId);
}
