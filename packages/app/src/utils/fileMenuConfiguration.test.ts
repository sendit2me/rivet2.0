import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_FILE_MENU_ITEM_IDS,
  FILE_MENU_GROUPS,
  getVisibleFileMenuGroups,
} from './fileMenuConfiguration.js';

test('getVisibleFileMenuGroups returns the canonical menu when no host config is provided', () => {
  assert.deepEqual(getVisibleFileMenuGroups(), FILE_MENU_GROUPS);
  assert.deepEqual(
    getVisibleFileMenuGroups().flatMap((group) => group.map((item) => item.id)),
    DEFAULT_FILE_MENU_ITEM_IDS,
  );
});

test('getVisibleFileMenuGroups labels the app settings and help commands for the browser File menu', () => {
  const items = getVisibleFileMenuGroups().flatMap((group) => group);

  assert.equal(items.find((item) => item.id === 'settings')?.label, 'Rivet settings');
  assert.equal(items.find((item) => item.id === 'get_help')?.label, 'Help');
});

test('getVisibleFileMenuGroups keeps canonical order while filtering configured ids', () => {
  const groups = getVisibleFileMenuGroups({
    visibleItems: ['settings', 'open_project', 'save_project'],
  });

  assert.deepEqual(
    groups.map((group) => group.map((item) => item.id)),
    [['open_project'], ['save_project'], ['settings']],
  );
});

test('getVisibleFileMenuGroups drops empty groups so separators can collapse', () => {
  const groups = getVisibleFileMenuGroups({
    visibleItems: ['settings'],
  });

  assert.deepEqual(
    groups.map((group) => group.map((item) => item.id)),
    [['settings']],
  );
});

test('getVisibleFileMenuGroups lets hosts keep only Help from the browser app group', () => {
  const groups = getVisibleFileMenuGroups({
    visibleItems: ['get_help'],
  });

  assert.deepEqual(
    groups.map((group) => group.map((item) => item.id)),
    [['get_help']],
  );
});

test('getVisibleFileMenuGroups deduplicates repeated configured ids', () => {
  const groups = getVisibleFileMenuGroups({
    visibleItems: ['open_project', 'open_project', 'settings'],
  });

  assert.deepEqual(
    groups.map((group) => group.map((item) => item.id)),
    [['open_project'], ['settings']],
  );
});

test('getVisibleFileMenuGroups supports hiding the entire browser file menu', () => {
  assert.deepEqual(getVisibleFileMenuGroups({ visibleItems: [] }), []);
});
