import { useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { graphState } from '../state/graph';
import {
  loadedProjectState,
  openedProjectSnapshotsState,
  openedProjectsSortedIdsState,
  openedProjectsState,
  projectDataState,
  projectState,
} from '../state/savedGraphs';

export function useSyncCurrentStateIntoOpenedProjects() {
  const [openedProjects, setOpenedProjects] = useAtom(openedProjectsState);
  const [openedProjectSnapshots, setOpenedProjectSnapshots] = useAtom(openedProjectSnapshotsState);
  const [openedProjectsSortedIds, setOpenedProjectsSortedIds] = useAtom(openedProjectsSortedIdsState);

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
    if (currentProject && openedProjects[currentProject.metadata.id] == null) {
      setOpenedProjects({
        ...openedProjects,
        [currentProject.metadata.id]: {
          projectId: currentProject.metadata.id,
          title: currentProject.metadata.title,
          fsPath: null,
          openedGraph: currentGraph?.metadata?.id,
        },
      });
    }

    if (loadedProject.path && !openedProjects[currentProject.metadata.id]?.fsPath) {
      setOpenedProjects({
        ...openedProjects,
        [currentProject.metadata.id]: {
          projectId: currentProject.metadata.id,
          title: currentProject.metadata.title,
          fsPath: loadedProject.path,
          openedGraph: currentGraph?.metadata?.id,
        },
      });
    }

    if (currentProject && openedProjectsSortedIds.includes(currentProject.metadata.id) === false) {
      setOpenedProjectsSortedIds([...openedProjectsSortedIds, currentProject.metadata.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [currentProject, currentProjectWithData, loadedProject, setOpenedProjects]);

  // Sync current project into opened projects
  useEffect(() => {
    setOpenedProjects({
      ...openedProjects,
      [currentProject.metadata.id]: {
        ...openedProjects[currentProject.metadata.id],
        projectId: currentProject.metadata.id,
        title: currentProject.metadata.title,
        openedGraph: currentGraph?.metadata?.id,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [currentProject, currentGraph?.metadata?.id]);

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
    if (
      prevProjectState.project != null &&
      prevProjectState.project.metadata.id !== currentProject.metadata.id &&
      openedProjects[prevProjectState.project.metadata.id]
    ) {
      setOpenedProjectSnapshots({
        ...openedProjectSnapshots,
        [prevProjectState.project.metadata.id]: {
          project: prevProjectState.project,
          data: prevProjectState.project.data,
        },
      });

      setOpenedProjects({
        ...openedProjects,
        [prevProjectState.project.metadata.id]: {
          ...openedProjects[prevProjectState.project.metadata.id],
          openedGraph: prevProjectState.openedGraph,
        },
      });
      // Update prevProjectState, so that we track changes to it
      setPrevProjectState({
        project: currentProjectWithData,
        openedGraph: currentGraph?.metadata?.id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [currentProject, currentProjectWithData]);
}
