import { useSetAtom } from 'jotai';
import {
  type GraphId,
  type NodeGraph,
  deserializeProject,
  type BuiltInNodes,
  type ProjectId,
} from '@ironclad/rivet-core';
import { duplicateGraph } from '../utils/duplicateGraph';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { addOpenedProject } from '../utils/openedProjects.js';
import { projectsState } from '../state/savedGraphs.js';
import { chooseProjectGraph } from '../utils/workspaceTransitions.js';
import { useWorkspaceTransitions } from './useWorkspaceTransitions.js';

export function useNewProjectFromTemplate() {
  const setProjects = useSetAtom(projectsState);
  const workspaceTransitions = useWorkspaceTransitions();

  return async (template: unknown) => {
    let [project] = deserializeProject(template);

    project = produce(project, (draft) => {
      const newGraphs: NodeGraph[] = [];
      const oldNewGraphIdMapping: Record<GraphId, GraphId> = {};

      // Duplicate each graph to get brand new IDs for all nodes and connections
      for (const graph of Object.values(draft.graphs)) {
        const duplicated = duplicateGraph(graph);
        newGraphs.push(duplicated);
        oldNewGraphIdMapping[graph.metadata!.id!] = duplicated.metadata!.id!;
      }

      // Subgraph node and Loop Until node are the only nodes that maintain a reference to another graph,
      // so we need to update the graphId for them
      for (const graph of newGraphs) {
        for (const node of graph.nodes) {
          const builtInNode = node as BuiltInNodes;
          if (builtInNode.type === 'subGraph') {
            builtInNode.data.graphId = oldNewGraphIdMapping[builtInNode.data.graphId]!;
          }
          if (builtInNode.type === 'loopUntil') {
            builtInNode.data.targetGraph = builtInNode.data.targetGraph
              ? oldNewGraphIdMapping[builtInNode.data.targetGraph]
              : undefined;
          }
        }
      }

      draft.graphs = newGraphs.reduce(
        (acc, graph) => {
          acc[graph.metadata!.id!] = graph;
          return acc;
        },
        {} as Record<GraphId, NodeGraph>,
      );

      // Also need to update the main graph if it's set
      if (draft.metadata.mainGraphId) {
        draft.metadata.mainGraphId = oldNewGraphIdMapping[draft.metadata.mainGraphId]!;
      }
    });

    const projectWithNewId = {
      ...project,
      metadata: {
        ...project.metadata,
        id: nanoid() as ProjectId,
      },
    };
    const { data, ...projectWithoutData } = projectWithNewId;
    const graphToLoad = chooseProjectGraph(projectWithoutData, {
      fallbackToMainGraph: true,
      fallbackToSortedProjectGraph: true,
    });

    const loaded = await workspaceTransitions.loadProject({
      project: projectWithoutData,
      data,
      graphToLoad,
      testSuites: [],
    });

    if (loaded) {
      setProjects((prev) =>
        addOpenedProject(prev, projectWithNewId, {
          openedGraph: graphToLoad.metadata?.id,
        }),
      );
    }

    return loaded;
  };
}
