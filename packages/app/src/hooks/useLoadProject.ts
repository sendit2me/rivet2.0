import { useAtomValue } from 'jotai';
import { isPathBasedIOProvider } from '../io/IOProvider.js';
import { useIOProvider } from '../providers/ProvidersContext.js';
import {
  openedProjectSnapshotsState,
  type OpenedProjectInfo,
  projectDataState,
  projectState,
} from '../state/savedGraphs.js';
import { handleError } from '../utils/errorHandling.js';
import { useWorkspaceTransitions } from './useWorkspaceTransitions.js';
import type { TrivetState } from '../state/trivet.js';

export function useLoadProject() {
  const ioProvider = useIOProvider();
  const workspaceTransitions = useWorkspaceTransitions();
  const currentProject = useAtomValue(projectState);
  const currentProjectData = useAtomValue(projectDataState);
  const openedProjectSnapshots = useAtomValue(openedProjectSnapshotsState);

  return async (projectInfo: OpenedProjectInfo) => {
    try {
      if (currentProject.metadata.id === projectInfo.projectId) {
        return;
      }

      const activeProjectSnapshot =
        currentProject.metadata.id === projectInfo.projectId
          ? {
              project: currentProject,
              data: currentProjectData,
            }
          : undefined;
      const storedSnapshot = activeProjectSnapshot ?? openedProjectSnapshots[projectInfo.projectId];

      let project = storedSnapshot?.project;
      let data = storedSnapshot?.data;
      let testSuites: TrivetState['testSuites'] = [];

      if (!project && projectInfo.fsPath && isPathBasedIOProvider(ioProvider)) {
        const loadedProject = await ioProvider.loadProjectDataNoPrompt(projectInfo.fsPath);
        project = loadedProject.project;
        data = loadedProject.project.data;
        testSuites = loadedProject.testData.testSuites;
      } else if (projectInfo.fsPath && isPathBasedIOProvider(ioProvider)) {
        const { testData } = await ioProvider.loadProjectDataNoPrompt(projectInfo.fsPath);
        testSuites = testData.testSuites;
      }

      if (!project) {
        throw new Error(`No in-memory snapshot is available for "${projectInfo.title}".`);
      }

      await workspaceTransitions.loadProject({
        project,
        data,
        fsPath: projectInfo.fsPath,
        openedGraph: projectInfo.openedGraph,
        testSuites,
      });
    } catch (err) {
      handleError(err, 'Failed to load opened project', {
        metadata: {
          fsPath: projectInfo.fsPath,
          openedGraph: projectInfo.openedGraph,
          projectId: projectInfo.projectId,
          projectTitle: projectInfo.title,
        },
      });
    }
  };
}
