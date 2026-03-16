import { useSetAtom } from 'jotai';
import { emptyNodeGraph } from '@ironclad/rivet-core';
import { projectsState } from '../state/savedGraphs.js';
import { blankProject } from '../utils/blankProject';
import { addOpenedProject } from '../utils/openedProjects.js';
import { useWorkspaceTransitions } from './useWorkspaceTransitions.js';

export function useNewProject() {
  const setProjects = useSetAtom(projectsState);
  const workspaceTransitions = useWorkspaceTransitions();

  return ({
    title,
    description,
  }: {
    title?: string;
    description?: string;
  } = {}) => {
    const { data: _data, ...project } = blankProject();

    project.metadata.title = title || project.metadata.title;
    project.metadata.description = description || project.metadata.description;

    setProjects((prev) => addOpenedProject(prev, project));
    void workspaceTransitions.loadProject({
      project,
      graphToLoad: emptyNodeGraph(),
      testSuites: [],
    });
  };
}
