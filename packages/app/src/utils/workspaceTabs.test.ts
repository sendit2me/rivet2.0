import assert from 'node:assert/strict';
import test from 'node:test';
import { getVisibleWorkspaceTabs } from './workspaceTabs.js';

test('workspace tabs keep Community at the end before Search', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: true,
    communityEnabled: true,
    openOverlay: undefined,
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'chatViewer', 'dataStudio', 'community'],
  );
});

test('workspace tabs hide Chat Viewer when there are no renderable chat rows', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: false,
    communityEnabled: true,
    openOverlay: undefined,
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'dataStudio', 'community'],
  );
});

test('workspace tabs insert active Prompt Designer before Community', () => {
  const tabs = getVisibleWorkspaceTabs({
    chatViewerAvailable: false,
    communityEnabled: true,
    openOverlay: 'promptDesigner',
  });

  assert.deepEqual(
    tabs.map((tab) => tab.key),
    ['trivet', 'dataStudio', 'promptDesigner', 'community'],
  );
});
