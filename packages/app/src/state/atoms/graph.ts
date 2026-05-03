import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { type ChartNode, type NodeConnection, type NodeGraph, type NodeId, emptyNodeGraph } from '@rivet2/rivet-core';
import { type CalculatedRevision } from '../../utils/ProjectRevisionCalculator';
import { createHybridStorage } from '../storage.js';

const { storage } = createHybridStorage('graph');

export const historicalGraphState = atom<CalculatedRevision | null>(null);
export const isReadOnlyGraphState = atom<boolean>(false);
export const historicalChangedNodesState = atom<Set<NodeId>>(new Set<NodeId>());
export const graphState = atomWithStorage<NodeGraph>('graphState', emptyNodeGraph(), storage);

export const graphMetadataState = atom(
  (get) => get(graphState).metadata,
  (get, set, newValue: NodeGraph['metadata']) => {
    set(graphState, { ...get(graphState), metadata: newValue });
  },
);

export const nodesState = atom(
  (get) => get(graphState).nodes,
  (get, set, newValue: ChartNode[] | ((prev: ChartNode[]) => ChartNode[])) => {
    const currentGraph = get(graphState);
    const nextNodes = typeof newValue === 'function' ? newValue(currentGraph.nodes) : newValue;
    set(graphState, { ...currentGraph, nodes: nextNodes });
  },
);

export const connectionsState = atom(
  (get) => get(graphState).connections,
  (get, set, newValue: NodeConnection[] | ((prev: NodeConnection[]) => NodeConnection[])) => {
    const currentGraph = get(graphState);
    const nextConnections = typeof newValue === 'function' ? newValue(currentGraph.connections) : newValue;
    set(graphState, { ...currentGraph, connections: nextConnections });
  },
);
