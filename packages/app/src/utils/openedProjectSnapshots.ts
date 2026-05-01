import type { NodeGraph, Project } from '@ironclad/rivet-core';
import type { OpenedProjectSnapshot } from '../state/savedGraphs.js';
import { mergeCurrentGraphIntoProject } from './workspaceTransitions.js';

export function buildOpenedProjectSnapshot(params: {
  project: Omit<Project, 'data'>;
  graph: NodeGraph;
  data?: Project['data'];
}): OpenedProjectSnapshot {
  return {
    project: mergeCurrentGraphIntoProject(params.project, params.graph),
    data: params.data,
  };
}
