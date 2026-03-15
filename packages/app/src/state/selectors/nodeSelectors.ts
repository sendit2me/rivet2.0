import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { getError, globalRivetNodeRegistry, type NodeId } from '@ironclad/rivet-core';
import { mapValues } from 'lodash-es';
import { pluginRefreshCounterState } from '../plugins';
import { nodesByIdState } from './graphSelectors';

export const nodeByIdState = atomFamily((nodeId: NodeId) => atom((get) => get(nodesByIdState)[nodeId]));

export const nodeInstancesState = atom((get) => {
  const nodesById = get(nodesByIdState);
  get(pluginRefreshCounterState);

  return mapValues(nodesById, (node) => {
    try {
      return globalRivetNodeRegistry.createDynamicImpl(node);
    } catch (error) {
      console.error('Error creating node implementation', getError(error));
      return undefined;
    }
  });
});

export const nodeInstanceByIdState = atomFamily((nodeId: NodeId) =>
  atom((get) => get(nodeInstancesState)?.[nodeId]),
);

export const nodeConstructorsState = atom((get) => {
  get(pluginRefreshCounterState);
  return globalRivetNodeRegistry.getNodeConstructors();
});
