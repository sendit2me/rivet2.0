import { type OpenedProjectInfo } from '../state/savedGraphs.js';
import { type GraphId } from '@ironclad/rivet-core';
import { isPathBasedIOProvider } from '../io/IOProvider.js';
import { toast } from 'react-toastify';
import { useIOProvider } from '../providers/ProvidersContext.js';
import { chooseProjectGraph } from '../utils/workspaceTransitions.js';
import { useWorkspaceTransitions } from './useWorkspaceTransitions.js';
import type { TrivetState } from '../state/trivet.js';

export function useLoadProject() {
  const ioProvider = useIOProvider();
  const workspaceTransitions = useWorkspaceTransitions();

  return async (projectInfo: OpenedProjectInfo) => {
    try {
      let testSuites: TrivetState['testSuites'] = [];
      if (projectInfo.fsPath && isPathBasedIOProvider(ioProvider)) {
        const { testData } = await ioProvider.loadProjectDataNoPrompt(projectInfo.fsPath);
        testSuites = testData.testSuites;
      }

      await workspaceTransitions.loadProject({
        project: projectInfo.project,
        data: projectInfo.project.data,
        fsPath: projectInfo.fsPath,
        openedGraph: projectInfo.openedGraph,
        graphToLoad: chooseProjectGraph(projectInfo.project, {
          openedGraphId: projectInfo.openedGraph as GraphId | undefined,
          fallbackToMainGraph: true,
          fallbackToSortedProjectGraph: true,
        }),
        testSuites,
      });
    } catch (err) {
      toast.error(`Failed to load project: ${(err as Error).message}`);
    }
  };
}
