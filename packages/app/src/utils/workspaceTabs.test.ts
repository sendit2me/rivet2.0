import assert from 'node:assert/strict';
import test from 'node:test';
import { getVisibleWorkspaceTabs } from './workspaceTabs.js';

test('workspace tabs show project-independent workspaces', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: true,
    openOverlay: undefined,
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'chatViewer', 'dataStudio'],
  );
});

test('workspace tabs hide Chat Viewer when there are no renderable chat rows', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: false,
    openOverlay: undefined,
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'dataStudio'],
  );
});

test('workspace tabs show active Prompt Designer only while it is open', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: false,
    openOverlay: 'promptDesigner',
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'dataStudio', 'promptDesigner'],
  );
});
