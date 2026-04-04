import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankProjectWithDefaultGraph } from './blankProject.js';

test('createBlankProjectWithDefaultGraph creates a single untitled main graph', () => {
  const project = createBlankProjectWithDefaultGraph();
  const graphIds = Object.keys(project.graphs);

  assert.equal(graphIds.length, 1);
  assert.equal(project.metadata.mainGraphId, graphIds[0]);
  assert.equal(project.graphs[project.metadata.mainGraphId!]?.metadata?.name, 'Untitled Graph');
});

test('createBlankProjectWithDefaultGraph applies title and description overrides', () => {
  const project = createBlankProjectWithDefaultGraph({
    title: 'My Project',
    description: 'Project Description',
  });

  assert.equal(project.metadata.title, 'My Project');
  assert.equal(project.metadata.description, 'Project Description');
  assert.equal(Object.keys(project.graphs).length, 1);
});
