import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getActionBarRunButtonPresentation } from './actionBarRunButtons.js';

const actionBarSource = readFileSync(new URL('./ActionBar.tsx', import.meta.url), 'utf8');

const DEFAULT_OPTIONS = {
  currentGraphName: 'Current graph',
  graphRunning: false,
  hasLoadedRecording: false,
  hasMainGraph: false,
  isMainGraph: false,
  showRunButton: true,
};

test('main graph selected uses one project-level run button', () => {
  assert.deepEqual(
    getActionBarRunButtonPresentation({
      ...DEFAULT_OPTIONS,
      hasMainGraph: true,
      isMainGraph: true,
    }),
    {
      currentGraphRunLabel: 'Run project',
      projectGraphRunLabel: 'Run project',
      showProjectGraphRunButton: false,
    },
  );
});

test('non-main graph selected shows a selected-graph run button plus Run project', () => {
  assert.deepEqual(
    getActionBarRunButtonPresentation({
      ...DEFAULT_OPTIONS,
      currentGraphName: 'Draft graph',
      hasMainGraph: true,
    }),
    {
      currentGraphRunLabel: 'Run Draft graph',
      projectGraphRunLabel: 'Run project',
      showProjectGraphRunButton: true,
    },
  );
});

test('selected-graph secondary styling uses the same condition as the project run button', () => {
  assert.equal(
    getActionBarRunButtonPresentation({
      ...DEFAULT_OPTIONS,
      hasLoadedRecording: true,
      hasMainGraph: true,
    }).showProjectGraphRunButton,
    false,
  );

  assert.equal(
    getActionBarRunButtonPresentation({
      ...DEFAULT_OPTIONS,
      graphRunning: true,
      hasMainGraph: true,
    }).showProjectGraphRunButton,
    false,
  );

  assert.equal(
    getActionBarRunButtonPresentation({
      ...DEFAULT_OPTIONS,
      hasMainGraph: true,
      showRunButton: false,
    }).showProjectGraphRunButton,
    false,
  );
});

test('ActionBar wires the selected-graph secondary class to project-run visibility', () => {
  assert.match(actionBarSource, /secondary: runButtonPresentation\.showProjectGraphRunButton/);
});

test('ready run buttons are text-only without the old chevron glyph', () => {
  assert.doesNotMatch(actionBarSource, /ChevronRightIcon|chevron-right/);
});

test('no main graph configured preserves the existing single Run label', () => {
  assert.deepEqual(getActionBarRunButtonPresentation(DEFAULT_OPTIONS), {
    currentGraphRunLabel: 'Run',
    projectGraphRunLabel: 'Run project',
    showProjectGraphRunButton: false,
  });
});
