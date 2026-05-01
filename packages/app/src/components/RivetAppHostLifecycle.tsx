import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { loadedProjectState, openedProjectsSortedIdsState, projectState } from '../state/savedGraphs.js';
import { useRivetAppHostCallbacks } from '../providers/HostCallbacksContext.js';

export function RivetAppHostLifecycle() {
  const callbacks = useRivetAppHostCallbacks();
  const project = useAtomValue(projectState);
  const loadedProject = useAtomValue(loadedProjectState);
  const openedProjectIds = useAtomValue(openedProjectsSortedIdsState);

  useEffect(() => {
    callbacks.onActiveProjectChanged?.({
      project: openedProjectIds.length > 0 ? project : null,
      projectId: openedProjectIds.length > 0 ? project.metadata.id : null,
      path: openedProjectIds.length > 0 ? loadedProject.path : null,
    });
  }, [callbacks, loadedProject.path, openedProjectIds.length, project.metadata.id]);

  useEffect(() => {
    callbacks.onOpenProjectCountChanged?.({
      count: openedProjectIds.length,
      projectIds: openedProjectIds,
    });
  }, [callbacks, openedProjectIds.length]);

  return null;
}
