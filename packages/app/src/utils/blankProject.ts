import { emptyNodeGraph, type Project, type ProjectId, newId } from '@rivet2/rivet-core';

export function blankProject(): Project {
  return {
    graphs: {},
    metadata: {
      id: newId<ProjectId>(),
      title: 'Untitled Project',
      description: '',
    },
    plugins: [],
  };
}

export function createBlankProjectWithDefaultGraph(options: { title?: string; description?: string } = {}): Project {
  const project = blankProject();
  const graph = emptyNodeGraph();

  project.metadata.title = options.title || project.metadata.title;
  project.metadata.description = options.description || project.metadata.description;
  project.metadata.mainGraphId = graph.metadata!.id!;
  project.graphs[graph.metadata!.id!] = graph;

  return project;
}
