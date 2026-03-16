import type { Project, ProjectId } from '@ironclad/rivet-core';
import type { OpenedProjectsInfo } from '../state/savedGraphs.js';

export function addOpenedProject(
  current: OpenedProjectsInfo,
  project: Project,
  options: { fsPath?: string | null } = {},
): OpenedProjectsInfo {
  const projectId = project.metadata.id as ProjectId;
  const existingProject = current.openedProjects[projectId];
  const nextFsPath =
    'fsPath' in options ? options.fsPath ?? null : existingProject?.fsPath ?? null;

  return {
    openedProjects: {
      ...current.openedProjects,
      [projectId]: {
        ...existingProject,
        project,
        fsPath: nextFsPath,
      },
    },
    openedProjectsSortedIds: current.openedProjectsSortedIds.includes(projectId)
      ? current.openedProjectsSortedIds
      : [...current.openedProjectsSortedIds, projectId],
  };
}
