import assert from 'node:assert/strict';
import test from 'node:test';
import { getVisibleWorkspaceTabs } from './workspaceTabs.js';

test('workspace tabs show project-independent workspaces', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: true,
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'chatViewer', 'dataStudio'],
  );
});

test('workspace tabs hide Chat Viewer when there are no renderable chat rows', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: false,
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'dataStudio'],
  );
});

test('workspace tabs show Welcome screen only in no-project mode', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: false,
    welcomeScreenAvailable: true,
  });

  assert.deepEqual(
    tabs.map((tab) => [tab.key, tab.targetOverlay]),
    [
      ['welcomeScreen', undefined],
      ['trivet', 'trivet'],
      ['dataStudio', 'dataStudio'],
    ],
  );
});
