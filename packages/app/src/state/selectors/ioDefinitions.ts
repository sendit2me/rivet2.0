import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { type NodeId, type NodeInputDefinition, type NodeOutputDefinition } from '@valerypopoff/rivet2-core';
import { projectState, referencedProjectsState } from '../savedGraphs';
import { connectionsForSingleNodeState, nodesByIdState } from './graphSelectors';
import { nodeInstanceByIdState } from './nodeSelectors';
import { handleError } from '../../utils/errorHandling.js';

export const ioDefinitionsForNodeState = atomFamily((nodeId: NodeId | undefined) =>
  atom((get) => {
    if (!nodeId) {
      return { inputDefinitions: [], outputDefinitions: [] };
    }

    const instance = get(nodeInstanceByIdState(nodeId));
    const connections = get(connectionsForSingleNodeState(nodeId)) ?? [];
    const nodesById = get(nodesByIdState);
    const project = get(projectState);
    const referencedProjects = get(referencedProjectsState);

    let inputDefinitions: NodeInputDefinition[] | undefined;
    let outputDefinitions: NodeOutputDefinition[] | undefined;

    try {
      inputDefinitions = instance?.getInputDefinitionsIncludingBuiltIn(connections, nodesById, project, referencedProjects);
    } catch (error) {
      handleError(error, 'Error getting node input definitions', {
        metadata: {
          connectionCount: connections.length,
          nodeId,
        },
        toastError: false,
      });
      inputDefinitions = [];
    }

    try {
      outputDefinitions = instance?.getOutputDefinitions(connections, nodesById, project, referencedProjects);
    } catch (error) {
      handleError(error, 'Error getting node output definitions', {
        metadata: {
          connectionCount: connections.length,
          nodeId,
        },
        toastError: false,
      });
      outputDefinitions = [];
    }

    return inputDefinitions && outputDefinitions
      ? { inputDefinitions, outputDefinitions }
      : { inputDefinitions: [], outputDefinitions: [] };
  }),
);
