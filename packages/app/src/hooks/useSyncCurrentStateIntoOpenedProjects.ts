import { useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { graphState } from '../state/graph';
import { loadedProjectState, projectDataState, projectState, projectsState } from '../state/savedGraphs';
import { addOpenedProject } from '../utils/openedProjects.js';

export function useSyncCurrentStateIntoOpenedProjects() {
  const setProjects = useSetAtom(projectsState);
  const currentProject = useAtomValue(projectState);
  const currentProjectData = useAtomValue(projectDataState);
  const loadedProject = useAtomValue(loadedProjectState);
  const currentGraph = useAtomValue(graphState);
  const currentProjectWithData = useMemo(
    () => ({
      ...currentProject,
      data: currentProjectData,
    }),
    [currentProject, currentProjectData],
  );

  // Make sure current opened project is in opened projects
  useEffect(() => {
    if (!currentProject.metadata.id) {
      return;
    }

    setProjects((previousProjects) => {
      const existingProject = previousProjects.openedProjects[currentProject.metadata.id];
      const nextOpenedGraph = currentGraph?.metadata?.id;
      const nextFsPath = loadedProject.path ?? existingProject?.fsPath ?? null;
      const nextProjects = addOpenedProject(previousProjects, currentProjectWithData, {
        ...(loadedProject.path ? { fsPath: loadedProject.path } : {}),
        ...(nextOpenedGraph ? { openedGraph: nextOpenedGraph } : {}),
      });
      const nextProject = nextProjects.openedProjects[currentProject.metadata.id];

      if (
        existingProject?.title === currentProject.metadata.title &&
        existingProject?.fsPath === nextFsPath &&
        existingProject?.openedGraph === nextOpenedGraph &&
        previousProjects.openedProjectsSortedIds.includes(currentProject.metadata.id)
      ) {
        return previousProjects;
      }

      return nextProject ? nextProjects : previousProjects;
    });
  }, [currentGraph?.metadata?.id, currentProject, currentProjectWithData, loadedProject.path, setProjects]);
}
