import { useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { graphState } from '../state/graph';
import {
  loadedProjectState,
  openedProjectSnapshotsState,
  projectDataState,
  projectState,
  projectsState,
} from '../state/savedGraphs';
import { addOpenedProject } from '../utils/openedProjects.js';

export function useSyncCurrentStateIntoOpenedProjects() {
  const setProjects = useSetAtom(projectsState);
  const setOpenedProjectSnapshots = useSetAtom(openedProjectSnapshotsState);
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

  // Track project and graph state, so that when the user switches projects, we can track that state without saving the project.
  const [prevProjectState, setPrevProjectState] = useState({
    project: currentProjectWithData,
    openedGraph: currentGraph?.metadata?.id,
  });
  useEffect(() => {
    if (
      currentGraph.metadata?.id != null &&
      currentProject.graphs[currentGraph.metadata.id] &&
      prevProjectState.project.metadata.id === currentProject.metadata.id
    ) {
      setPrevProjectState({
        project: {
          ...currentProjectWithData,
          graphs: {
            ...currentProject.graphs,
            [currentGraph.metadata!.id!]: currentGraph,
          },
        },
        openedGraph: currentGraph.metadata!.id!,
      });
    }
  }, [currentGraph, currentProject, currentProjectWithData, prevProjectState.project.metadata.id]);

  // Sync current graph into opened projects when user switches projects.
  useEffect(() => {
    if (prevProjectState.project != null && prevProjectState.project.metadata.id !== currentProject.metadata.id) {
      setOpenedProjectSnapshots((previousSnapshots) => ({
        ...previousSnapshots,
        [prevProjectState.project.metadata.id]: {
          project: prevProjectState.project,
          data: prevProjectState.project.data,
        },
      }));

      setProjects((previousProjects) => {
        const previousOpenedProject = previousProjects.openedProjects[prevProjectState.project.metadata.id];
        if (!previousOpenedProject) {
          return previousProjects;
        }

        return {
          ...previousProjects,
          openedProjects: {
            ...previousProjects.openedProjects,
            [prevProjectState.project.metadata.id]: {
              ...previousOpenedProject,
              openedGraph: prevProjectState.openedGraph,
            },
          },
        };
      });

      setPrevProjectState({
        project: currentProjectWithData,
        openedGraph: currentGraph?.metadata?.id,
      });
    }
  }, [currentGraph?.metadata?.id, currentProject.metadata.id, currentProjectWithData, prevProjectState, setOpenedProjectSnapshots, setProjects]);
}
