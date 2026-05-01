import { useAtomValue, useSetAtom } from 'jotai';
import { loadedProjectState, projectState, referencedProjectsState } from '../state/savedGraphs';
import { useCallback } from 'react';
import { TauriProjectReferenceLoader } from '../model/TauriProjectReferenceLoader';
import { type Project, type ProjectId } from '@ironclad/rivet-core';
import useAsyncEffect from 'use-async-effect';
import { handleError } from '../utils/errorHandling.js';
import { usePathPolicyProvider } from '../providers/ProvidersContext.js';

export function useReloadProjectReferences() {
  const project = useAtomValue(projectState);
  const loadedProject = useAtomValue(loadedProjectState);
  const pathPolicy = usePathPolicyProvider();

  const setReferencedProjects = useSetAtom(referencedProjectsState);

  const reloadReferences = useCallback(async () => {
    try {
      const loader = new TauriProjectReferenceLoader(pathPolicy);

      const collectedProjects: Record<ProjectId, Project> = {};

      for (const reference of project.references ?? []) {
        const refProject = await loader.loadProject(loadedProject.path ?? undefined, reference);
        collectedProjects[reference.id] = refProject;
      }

      setReferencedProjects(collectedProjects);
    } catch (err) {
      handleError(err, 'Failed to reload project references', {
        metadata: {
          projectId: project.metadata.id,
          projectPath: loadedProject.path,
          referenceCount: project.references?.length ?? 0,
        },
      });
    }
  }, [loadedProject, pathPolicy, project, setReferencedProjects]);

  useAsyncEffect(async () => {
    await reloadReferences();
  }, [project, loadedProject, reloadReferences]);

  return reloadReferences;
}
