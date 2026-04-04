import type { GraphId, Project, ProjectId } from '@ironclad/rivet-core';
import type { OpenedProjectsInfo } from '../state/savedGraphs.js';

export function addOpenedProject(
  current: OpenedProjectsInfo,
  project: Project,
  options: { fsPath?: string | null; openedGraph?: GraphId } = {},
): OpenedProjectsInfo {
  const projectId = project.metadata.id as ProjectId;
  const existingProject = current.openedProjects[projectId];
  const nextFsPath =
    'fsPath' in options ? options.fsPath ?? null : existingProject?.fsPath ?? null;
  const nextOpenedGraph =
    'openedGraph' in options ? options.openedGraph : existingProject?.openedGraph ?? project.metadata.mainGraphId;

  return {
    openedProjects: {
      ...current.openedProjects,
      [projectId]: {
        ...existingProject,
        projectId,
        title: project.metadata.title,
        fsPath: nextFsPath,
        openedGraph: nextOpenedGraph,
      },
    },
    openedProjectsSortedIds: current.openedProjectsSortedIds.includes(projectId)
      ? current.openedProjectsSortedIds
      : [...current.openedProjectsSortedIds, projectId],
  };
}
