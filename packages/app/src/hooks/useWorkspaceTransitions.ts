import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { emptyNodeGraph, type DataId, type Project } from '@ironclad/rivet-core';
import { toast, type Id as ToastId } from 'react-toastify';
import { isPathBasedIOProvider } from '../io/IOProvider.js';
import { useIOProvider } from '../providers/ProvidersContext.js';
import { cleanupNodeAtomFamilies, graphState, historicalGraphState, isReadOnlyGraphState } from '../state/graph.js';
import {
  canvasPositionState,
  graphNavigationStackState,
  lastCanvasPositionByGraphState,
  selectedNodesState,
} from '../state/graphBuilder.js';
import {
  loadedProjectState,
  openedProjectSnapshotsState,
  projectDataState,
  projectsState,
  projectState,
} from '../state/savedGraphs.js';
import { trivetState } from '../state/trivet.js';
import { useCenterViewOnGraph } from './useCenterViewOnGraph.js';
import { useSaveCurrentGraph } from './useSaveCurrentGraph.js';
import type { GraphViewContext } from '../domain/graphEditing/navigationActions.js';
import {
  createDefaultTrivetState,
  createGraphSwitchTransition,
  createProjectLoadTransition,
  mergeCurrentGraphIntoProject,
} from '../utils/workspaceTransitions.js';
import { handleError } from '../utils/errorHandling.js';
import { useStaticDataDatabase } from './useStaticDataDatabase.js';
import { addOpenedProject } from '../utils/openedProjects.js';
import {
  resolveCanvasPositionsForProject,
  resolvePersistedCanvasPositionsForLegacyCache,
  resolveProjectEditorRestoreTarget,
} from '../utils/projectEditorState.js';
import { flushHybridStorageGroup } from '../state/storage.js';
import { useCurrentProjectEditorSnapshot } from './useCurrentProjectEditorSnapshot.js';

export function useWorkspaceTransitions() {
  const ioProvider = useIOProvider();
  const database = useStaticDataDatabase();
  const [currentGraph, setGraph] = useAtom(graphState);
  const [project, setProject] = useAtom(projectState);
  const [loadedProject, setLoadedProject] = useAtom(loadedProjectState);
  const setProjectData = useSetAtom(projectDataState);
  const setTrivetState = useSetAtom(trivetState);
  const setNavigationStack = useSetAtom(graphNavigationStackState);
  const setIsReadOnlyGraph = useSetAtom(isReadOnlyGraphState);
  const setHistoricalGraph = useSetAtom(historicalGraphState);
  const setSelectedNodes = useSetAtom(selectedNodesState);
  const setPosition = useSetAtom(canvasPositionState);
  const setLastSavedPositions = useSetAtom(lastCanvasPositionByGraphState);
  const setOpenedProjectSnapshots = useSetAtom(openedProjectSnapshotsState);
  const setProjects = useSetAtom(projectsState);
  const centerViewOnGraph = useCenterViewOnGraph();
  const saveCurrentGraph = useSaveCurrentGraph();
  const { testSuites } = useAtomValue(trivetState);
  const {
    canvasPosition,
    graphNavigationStack,
    lastCanvasPositionsByGraph: lastSavedPositions,
    persistCurrentOpenedProjectSnapshot,
    persistCurrentProjectEditorSnapshot,
    projectEditorStateByProjectId,
  } = useCurrentProjectEditorSnapshot();

  async function applyStaticData(data: Project['data'] | undefined) {
    setProjectData(data);

    try {
      await database.clear();
    } catch (err) {
      handleError(err, 'Failed to clear static data cache while loading project', {
        metadata: {
          projectId: project.metadata.id,
          projectPath: loadedProject.path,
        },
        toastError: false,
      });
    }

    if (!data) {
      return;
    }

    for (const [id, dataValue] of Object.entries(data)) {
      try {
        await database.insert(id as DataId, dataValue!);
      } catch (err) {
        handleError(err, `Failed to hydrate static data entry "${id}" while loading project`, {
          metadata: {
            dataId: id,
            projectId: project.metadata.id,
            projectPath: loadedProject.path,
          },
          toastError: false,
        });
      }
    }
  }

  return {
    async loadProject(projectInfo: {
      project: Omit<Project, 'data'>;
      data?: Project['data'];
      fsPath?: string | null;
      openedGraph?: string;
      testSuites?: typeof testSuites;
      graphToLoad?: typeof currentGraph;
      graphView?: GraphViewContext;
    }): Promise<boolean> {
      try {
        const currentProjectId = project.metadata.id;
        const targetProjectId = projectInfo.project.metadata.id;
        const shouldPersistCurrentProjectEditorState =
          Boolean(currentProjectId) &&
          (loadedProject.loaded || Object.keys(project.graphs).length > 0 || graphNavigationStack.stack.length > 0);

        const currentProjectEditorSnapshot = shouldPersistCurrentProjectEditorState
          ? persistCurrentProjectEditorSnapshot()
          : undefined;

        if (currentProjectEditorSnapshot && currentProjectId) {
          persistCurrentOpenedProjectSnapshot();
        }

        const persistedProjectEditorState =
          targetProjectId === currentProjectId
            ? currentProjectEditorSnapshot ?? projectEditorStateByProjectId[targetProjectId]
            : projectEditorStateByProjectId[targetProjectId];
        const restoreTarget = resolveProjectEditorRestoreTarget({
          project: projectInfo.project,
          persistedProjectEditorState,
          explicitGraphToLoad: projectInfo.graphToLoad,
          explicitGraphView: projectInfo.graphView,
          openedGraphId: projectInfo.openedGraph as any,
          legacyCanvasPositionsByGraph: lastSavedPositions,
        });

        const transition = createProjectLoadTransition({
          currentGraph,
          graphToLoad: restoreTarget.graph,
          navigationStack: restoreTarget.navigationStack,
          path: projectInfo.fsPath,
          project: projectInfo.project,
          viewport: restoreTarget.viewport,
        });

        setProject(transition.project);
        setNavigationStack(transition.navigationStack);
        cleanupNodeAtomFamilies(transition.cleanupNodeIds);
        setIsReadOnlyGraph(false);
        setHistoricalGraph(null);
        setGraph(transition.graph);
        const persistedCanvasPositionsByGraph = resolvePersistedCanvasPositionsForLegacyCache({
          project: projectInfo.project,
          persistedProjectEditorState,
        });
        if (Object.keys(persistedCanvasPositionsByGraph).length > 0) {
          setLastSavedPositions((previousPositionsByGraph) => ({
            ...previousPositionsByGraph,
            ...persistedCanvasPositionsByGraph,
          }));
        }

        if (transition.viewport.type === 'saved') {
          setPosition(transition.viewport.position);
        } else if (transition.viewport.type === 'center') {
          centerViewOnGraph(transition.graph);
        } else {
          setPosition({ x: 0, y: 0, zoom: 1 });
        }
        await applyStaticData(projectInfo.data);
        setLoadedProject(transition.loadedProject);
        setTrivetState(createDefaultTrivetState(projectInfo.testSuites ?? []));
        return true;
      } catch (err) {
        handleError(err, 'Failed to load project', {
          metadata: {
            currentGraphId: currentGraph.metadata?.id,
            fsPath: projectInfo.fsPath,
            openedGraph: projectInfo.openedGraph,
            projectId: projectInfo.project.metadata.id,
          },
        });
        return false;
      }
    },

    switchGraph(savedGraph: typeof currentGraph, options: { graphView?: GraphViewContext; pushHistory?: boolean } = {}) {
      const currentGraphId = currentGraph.metadata?.id;

      if (project.metadata.id) {
        persistCurrentProjectEditorSnapshot({
          currentGraphId,
        });

        if (currentGraphId) {
          setLastSavedPositions((previousPositionsByGraph) => ({
            ...previousPositionsByGraph,
            [currentGraphId]: {
              x: canvasPosition.x,
              y: canvasPosition.y,
              zoom: canvasPosition.zoom,
            },
          }));
        }
      }

      if (currentGraph.nodes.length > 0 || currentGraph.metadata?.name !== emptyNodeGraph().metadata!.name) {
        saveCurrentGraph();
      }

      const transition = createGraphSwitchTransition({
        currentGraph,
        graphToLoad: savedGraph,
        lastSavedPositions: resolveCanvasPositionsForProject({
          project,
          persistedProjectEditorState: projectEditorStateByProjectId[project.metadata.id],
          legacyCanvasPositionsByGraph: lastSavedPositions,
        }),
        nextGraphView: options.graphView,
        previousNavigationStack: graphNavigationStack,
        pushHistory: options.pushHistory ?? true,
      });

      if (transition.cleanupNodeIds.length > 0) {
        cleanupNodeAtomFamilies(transition.cleanupNodeIds);
      }

      setGraph(transition.graph);
      setSelectedNodes(transition.selectedNodes);
      setIsReadOnlyGraph(false);
      setHistoricalGraph(null);

      if (transition.navigationStack) {
        setNavigationStack(transition.navigationStack);
      }

      if (transition.viewport.type === 'saved') {
        setPosition(transition.viewport.position);
      } else if (transition.viewport.type === 'center') {
        centerViewOnGraph(savedGraph);
      } else {
        setPosition({ x: 0, y: 0, zoom: 1 });
      }
    },

    buildProjectForSave() {
      const savedGraph = saveCurrentGraph();
      return mergeCurrentGraphIntoProject(project, savedGraph);
    },

    async saveProject(options: { forceSaveAs?: boolean } = {}) {
      const projectToPersist = mergeCurrentGraphIntoProject(project, saveCurrentGraph());
      const shouldUseSaveAs =
        options.forceSaveAs || !loadedProject.loaded || !loadedProject.path || !isPathBasedIOProvider(ioProvider);

      let saving: ToastId | undefined;
      const savingTimeout = setTimeout(() => {
        saving = toast.info('Saving project');
      }, 500);

      try {
        persistCurrentProjectEditorSnapshot({
          project: projectToPersist,
        });
        await flushHybridStorageGroup('project');

        if (shouldUseSaveAs) {
          const filePath = await ioProvider.saveProjectData(projectToPersist, { testSuites });

          if (filePath) {
            setLoadedProject({ loaded: true, path: filePath });
            setOpenedProjectSnapshots((snapshots) => {
              const nextSnapshots = { ...snapshots };
              delete nextSnapshots[projectToPersist.metadata.id];
              return nextSnapshots;
            });
            setProjects((prev) => addOpenedProject(prev, projectToPersist, { fsPath: filePath }));
            await flushHybridStorageGroup('project');
            toast.success('Project saved');
          }
        } else {
          const projectPath = loadedProject.path!;
          await ioProvider.saveProjectDataNoPrompt(projectToPersist, { testSuites }, projectPath);
          setLoadedProject({ loaded: true, path: projectPath });
          setOpenedProjectSnapshots((snapshots) => {
            const nextSnapshots = { ...snapshots };
            delete nextSnapshots[projectToPersist.metadata.id];
            return nextSnapshots;
          });
          await flushHybridStorageGroup('project');
          toast.success('Project saved');
        }
      } catch (err) {
        handleError(err, 'Failed to save project', {
          metadata: {
            forceSaveAs: options.forceSaveAs ?? false,
            projectId: projectToPersist.metadata.id,
            projectPath: loadedProject.path,
            usedSaveAs: shouldUseSaveAs,
          },
        });
      } finally {
        clearTimeout(savingTimeout);
        if (saving != null) {
          toast.dismiss(saving);
        }
      }
    },
  };
}
