import { useAtom, useSetAtom } from 'jotai';
import { projectsState } from '../state/savedGraphs.js';
import { getError } from '@ironclad/rivet-core';
import { toast } from 'react-toastify';
import { useIOProvider } from '../providers/ProvidersContext.js';
import { chooseProjectGraph } from '../utils/workspaceTransitions.js';
import { useWorkspaceTransitions } from './useWorkspaceTransitions.js';

export function useLoadProjectWithFileBrowser() {
  const ioProvider = useIOProvider();
  const [projects, setProjects] = useAtom(projectsState);
  const workspaceTransitions = useWorkspaceTransitions();

  return async () => {
    try {
      await ioProvider.loadProjectData(({ project, testData, path }) => {
        const { data, ...projectData } = project;

        if (Object.values(projects.openedProjects).some((p) => p.fsPath === path)) {
          toast.error(`That project is already open.`);
          return;
        }

        const alreadyOpenedProject = Object.values(projects.openedProjects).find(
          (p) => p.project.metadata.id === project.metadata.id,
        );

        if (alreadyOpenedProject) {
          toast.error(
            `"${alreadyOpenedProject.project.metadata.title} [${
              alreadyOpenedProject.fsPath?.split('/').pop() ?? 'no path'
            }]" shares the same ID (${
              project.metadata.id
            }) and is already open. Please close that project first to open this one.`,
          );
          return;
        }

        const graphToLoad = chooseProjectGraph(projectData, {
          fallbackToMainGraph: true,
          fallbackToSortedProjectGraph: true,
        });

        void workspaceTransitions.loadProject({
          project: projectData,
          data,
          fsPath: path,
          graphToLoad,
          testSuites: testData.testSuites,
        });

        setProjects((prev) => ({
          openedProjects: {
            ...prev.openedProjects,
            [project.metadata.id]: {
              project: projectData,
              fsPath: path,
            },
          },
          openedProjectsSortedIds: [...prev.openedProjectsSortedIds, project.metadata.id],
        }));
      });
    } catch (err) {
      toast.error(`Failed to load project: ${getError(err).message}`);
    }
  };
}
