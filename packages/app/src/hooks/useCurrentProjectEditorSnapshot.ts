import { type GraphId } from '@ironclad/rivet-core';
import { useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { isEqual } from 'lodash-es';
import { graphState } from '../state/graph.js';
import { canvasPositionState, graphNavigationStackState, lastCanvasPositionByGraphState } from '../state/graphBuilder.js';
import { openedProjectSnapshotsState, projectDataState, projectState } from '../state/savedGraphs.js';
import { projectEditorStateByProjectIdState, type ProjectEditorState } from '../state/projectEditor.js';
import { buildCurrentProjectEditorStateSnapshot } from '../utils/projectEditorState.js';
import { mergeCurrentGraphIntoProject } from '../utils/workspaceTransitions.js';

export function useCurrentProjectEditorSnapshot() {
  const currentProject = useAtomValue(projectState);
  const currentProjectData = useAtomValue(projectDataState);
  const currentGraph = useAtomValue(graphState);
  const canvasPosition = useAtomValue(canvasPositionState);
  const graphNavigationStack = useAtomValue(graphNavigationStackState);
  const lastCanvasPositionsByGraph = useAtomValue(lastCanvasPositionByGraphState);
  const [projectEditorStateByProjectId, setProjectEditorStateByProjectId] = useAtom(projectEditorStateByProjectIdState);
  const setOpenedProjectSnapshots = useSetAtom(openedProjectSnapshotsState);

  const buildSnapshot = useCallback((options: {
    project?: typeof currentProject;
    currentGraphId?: GraphId | undefined;
    existingProjectEditorState?: ProjectEditorState;
  } = {}) => {
    const snapshotProject = options.project ?? currentProject;

    return buildCurrentProjectEditorStateSnapshot({
      project: snapshotProject,
      currentGraphId: options.currentGraphId ?? currentGraph.metadata?.id,
      navigationStack: graphNavigationStack,
      canvasPosition,
      existingProjectEditorState:
        options.existingProjectEditorState ?? projectEditorStateByProjectId[snapshotProject.metadata.id],
      legacyCanvasPositionsByGraph: lastCanvasPositionsByGraph,
    });
  }, [
    canvasPosition,
    currentGraph.metadata?.id,
    currentProject,
    graphNavigationStack,
    lastCanvasPositionsByGraph,
    projectEditorStateByProjectId,
  ]);

  const persistSnapshot = useCallback((options: {
    project?: typeof currentProject;
    currentGraphId?: GraphId | undefined;
    existingProjectEditorState?: ProjectEditorState;
  } = {}) => {
    const snapshotProject = options.project ?? currentProject;
    const snapshotProjectId = snapshotProject.metadata.id;
    if (!snapshotProjectId) {
      return undefined;
    }

    const nextProjectEditorState = buildSnapshot(options);

    setProjectEditorStateByProjectId((previousStateByProjectId) => {
      if (isEqual(previousStateByProjectId[snapshotProjectId], nextProjectEditorState)) {
        return previousStateByProjectId;
      }

      return {
        ...previousStateByProjectId,
        [snapshotProjectId]: nextProjectEditorState,
      };
    });

    return nextProjectEditorState;
  }, [buildSnapshot, currentProject, setProjectEditorStateByProjectId]);

  const persistCurrentOpenedProjectSnapshot = useCallback(() => {
    if (!currentProject.metadata.id) {
      return;
    }

    setOpenedProjectSnapshots((previousSnapshots) => ({
      ...previousSnapshots,
      [currentProject.metadata.id]: {
        project: mergeCurrentGraphIntoProject(currentProject, currentGraph),
        data: currentProjectData,
      },
    }));
  }, [currentGraph, currentProject, currentProjectData, setOpenedProjectSnapshots]);

  return {
    canvasPosition,
    currentGraph,
    currentProject,
    graphNavigationStack,
    lastCanvasPositionsByGraph,
    persistCurrentOpenedProjectSnapshot,
    buildCurrentProjectEditorSnapshot: buildSnapshot,
    persistCurrentProjectEditorSnapshot: persistSnapshot,
    projectEditorStateByProjectId,
  };
}
