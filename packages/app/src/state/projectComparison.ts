import { atom } from 'jotai';
import {
  compareProjects,
  type Project,
  type ProjectComparison,
  type ProjectGraphComparison,
  type ProjectId,
  type NodeId,
  type GraphId,
} from '@valerypopoff/rivet2-core';
import { graphMetadataState, graphState } from './graph.js';
import { projectState } from './savedGraphs.js';

export type ProjectCompareReference = {
  projectId: ProjectId;
  referenceProject: Project;
  referencePath?: string;
};

export type ActiveProjectComparison = ProjectCompareReference & {
  comparison: ProjectComparison;
};

export const projectCompareReferenceState = atom<ProjectCompareReference | undefined>(undefined);

export const viewingProjectComparisonNodeState = atom<{ graphId: GraphId; nodeId: NodeId } | undefined>(undefined);

export const activeProjectComparisonState = atom<ActiveProjectComparison | undefined>((get) => {
  const project = get(projectState);
  const graph = get(graphState);
  const reference = get(projectCompareReferenceState);

  if (!reference || reference.projectId !== project.metadata.id) {
    return undefined;
  }

  const graphId = graph.metadata?.id;
  const liveProject = graphId
    ? {
        ...project,
        graphs: {
          ...project.graphs,
          [graphId]: graph,
        },
      }
    : project;

  return {
    ...reference,
    comparison: compareProjects(reference.referenceProject, liveProject as Project),
  };
});

export const selectedGraphProjectComparisonState = atom<ProjectGraphComparison | undefined>((get) => {
  const comparison = get(activeProjectComparisonState)?.comparison;
  const graphId = get(graphMetadataState)?.id;

  return graphId ? comparison?.graphs[graphId] : undefined;
});
