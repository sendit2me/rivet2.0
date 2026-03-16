import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { GraphId, Project, ProjectId } from '@ironclad/rivet-core';
import { addOpenedProject } from './openedProjects.js';

function makeProject(id: string, title: string): Project {
  return {
    metadata: {
      id: id as ProjectId,
      title,
      description: '',
      mainGraphId: 'graph-1' as GraphId,
    },
    graphs: {},
  };
}

describe('openedProjects helpers', () => {
  test('adds a new project without dropping existing open projects', () => {
    const existingProject = makeProject('project-1', 'Existing');
    const nextProject = makeProject('project-2', 'Next');

    const result = addOpenedProject(
      {
        openedProjects: {
          [existingProject.metadata.id]: {
            project: existingProject,
            fsPath: '/tmp/existing.rivet-project',
          },
        },
        openedProjectsSortedIds: [existingProject.metadata.id],
      },
      nextProject,
    );

    assert.deepEqual(result.openedProjectsSortedIds, [existingProject.metadata.id, nextProject.metadata.id]);
    assert.equal(result.openedProjects[existingProject.metadata.id]?.project.metadata.title, 'Existing');
    assert.equal(result.openedProjects[nextProject.metadata.id]?.project.metadata.title, 'Next');
    assert.equal(result.openedProjects[nextProject.metadata.id]?.fsPath, null);
  });

  test('does not duplicate an already-open project id', () => {
    const project = makeProject('project-1', 'Existing');

    const result = addOpenedProject(
      {
        openedProjects: {
          [project.metadata.id]: {
            project,
            fsPath: null,
          },
        },
        openedProjectsSortedIds: [project.metadata.id],
      },
      project,
      { fsPath: '/tmp/project-1.rivet-project' },
    );

    assert.deepEqual(result.openedProjectsSortedIds, [project.metadata.id]);
    assert.equal(result.openedProjects[project.metadata.id]?.fsPath, '/tmp/project-1.rivet-project');
  });

  test('preserves existing tab metadata when updating an already-open project', () => {
    const project = makeProject('project-1', 'Existing');
    const updatedProject = makeProject('project-1', 'Updated');

    const result = addOpenedProject(
      {
        openedProjects: {
          [project.metadata.id]: {
            project,
            fsPath: '/tmp/project-1.rivet-project',
            openedGraph: 'graph-2' as GraphId,
          },
        },
        openedProjectsSortedIds: [project.metadata.id],
      },
      updatedProject,
    );

    assert.deepEqual(result.openedProjectsSortedIds, [project.metadata.id]);
    assert.equal(result.openedProjects[project.metadata.id]?.project.metadata.title, 'Updated');
    assert.equal(result.openedProjects[project.metadata.id]?.fsPath, '/tmp/project-1.rivet-project');
    assert.equal(result.openedProjects[project.metadata.id]?.openedGraph, 'graph-2');
  });
});
