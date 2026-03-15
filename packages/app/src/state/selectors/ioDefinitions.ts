import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { getError, type NodeId, type NodeInputDefinition, type NodeOutputDefinition } from '@ironclad/rivet-core';
import { projectState, referencedProjectsState } from '../savedGraphs';
import { connectionsForSingleNodeState, nodesByIdState } from './graphSelectors';
import { nodeInstanceByIdState } from './nodeSelectors';

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
      console.error('Error getting node input definitions', getError(error));
      inputDefinitions = [];
    }

    try {
      outputDefinitions = instance?.getOutputDefinitions(connections, nodesById, project, referencedProjects);
    } catch (error) {
      console.error('Error getting node output definitions', getError(error));
      outputDefinitions = [];
    }

    return inputDefinitions && outputDefinitions
      ? { inputDefinitions, outputDefinitions }
      : { inputDefinitions: [], outputDefinitions: [] };
  }),
);
