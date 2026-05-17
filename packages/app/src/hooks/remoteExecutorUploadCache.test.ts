import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataId, GraphId, Project, ProjectId, Settings } from '@valerypopoff/rivet2-core';
import {
  planRemoteExecutorProjectUpload,
  resetRemoteExecutorUploadCache,
  type RemoteExecutorUploadCache,
  uploadRemoteExecutorProjectIfNeeded,
} from './remoteExecutorUploadCache.js';

function makeProject(text = 'hello'): Project {
  return {
    graphs: {
      ['graph-1' as GraphId]: {
        connections: [],
        metadata: {
          id: 'graph-1' as GraphId,
          name: 'Graph',
        },
        nodes: [
          {
            data: { text },
            id: 'text-node',
            title: 'Text',
            type: 'text',
            visualData: { width: 300, x: 0, y: 0 },
          } as never,
        ],
      },
    },
    metadata: {
      description: '',
      id: 'project-1' as ProjectId,
      mainGraphId: 'graph-1' as GraphId,
      title: 'Project',
    },
    plugins: [],
  };
}

function makeSettings(openAiKey = 'key'): Settings {
  return {
    openAiEndpoint: '',
    openAiKey,
    openAiOrganization: '',
    pluginEnv: {},
    pluginSettings: {},
  };
}

function createUploadHarness(options: { dynamicSendResult?: boolean; staticSendResult?: boolean } = {}) {
  const dynamicPayloads: unknown[] = [];
  const staticPayloads: Array<[DataId, string]> = [];

  return {
    dynamicPayloads,
    staticPayloads,
    transport: {
      sendDynamicData: (payload: unknown) => {
        dynamicPayloads.push(payload);
        return options.dynamicSendResult ?? true;
      },
      sendStaticData: (id: DataId, value: string) => {
        staticPayloads.push([id, value]);
        return options.staticSendResult ?? true;
      },
    },
  };
}

test('remote executor upload planner reports required and reusable uploads without sending', () => {
  const cache: RemoteExecutorUploadCache = {};
  const project = makeProject();
  const settings = makeSettings();
  const projectData = {
    ['data-b' as DataId]: 'b',
    ['data-a' as DataId]: 'a',
  };

  const required = planRemoteExecutorProjectUpload({
    cache,
    project,
    projectData,
    sessionKey: 'internal:ws://executor',
    settings,
  });

  assert.equal(required.type, 'upload-required');
  assert.equal(required.sessionKey, 'internal:ws://executor');
  assert.deepEqual(required.staticDataEntries, [
    ['data-a', 'a'],
    ['data-b', 'b'],
  ]);

  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project,
    projectData,
    sessionKey: 'internal:ws://executor',
    settings,
    transport: createUploadHarness().transport,
  });

  const reusable = planRemoteExecutorProjectUpload({
    cache,
    project,
    projectData,
    sessionKey: 'internal:ws://executor',
    settings,
  });

  assert.equal(reusable.type, 'reuse-upload');
  assert.equal(reusable.uploadKey, required.uploadKey);
});

test('remote executor upload cache skips identical consecutive project uploads', () => {
  const cache: RemoteExecutorUploadCache = {};
  const harness = createUploadHarness();
  const project = makeProject();
  const settings = makeSettings();

  const first = uploadRemoteExecutorProjectIfNeeded({
    cache,
    project,
    projectData: { ['data-1' as DataId]: 'static value' },
    sessionKey: 'internal:ws://executor',
    settings,
    transport: harness.transport,
  });
  const second = uploadRemoteExecutorProjectIfNeeded({
    cache,
    project,
    projectData: { ['data-1' as DataId]: 'static value' },
    sessionKey: 'internal:ws://executor',
    settings,
    transport: harness.transport,
  });

  assert.equal(first, 'uploaded');
  assert.equal(second, 'cached');
  assert.equal(harness.dynamicPayloads.length, 1);
  assert.deepEqual(harness.staticPayloads, [['data-1', 'static value']]);
});

test('remote executor upload cache reuploads after graph, settings, project data, or session changes', () => {
  const cache: RemoteExecutorUploadCache = {};
  const harness = createUploadHarness();

  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project: makeProject('one'),
    projectData: { ['data-1' as DataId]: 'static value' },
    sessionKey: 'internal:ws://executor',
    settings: makeSettings('key'),
    transport: harness.transport,
  });
  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project: makeProject('two'),
    projectData: { ['data-1' as DataId]: 'static value' },
    sessionKey: 'internal:ws://executor',
    settings: makeSettings('key'),
    transport: harness.transport,
  });
  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project: makeProject('two'),
    projectData: { ['data-1' as DataId]: 'static value' },
    sessionKey: 'internal:ws://executor',
    settings: makeSettings('next-key'),
    transport: harness.transport,
  });
  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project: makeProject('two'),
    projectData: { ['data-1' as DataId]: 'changed static value' },
    sessionKey: 'internal:ws://executor',
    settings: makeSettings('next-key'),
    transport: harness.transport,
  });
  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project: makeProject('two'),
    projectData: { ['data-1' as DataId]: 'changed static value' },
    sessionKey: 'internal:ws://executor-reconnected',
    settings: makeSettings('next-key'),
    transport: harness.transport,
  });

  assert.equal(harness.dynamicPayloads.length, 5);
  assert.equal(harness.staticPayloads.length, 5);
});

test('remote executor upload cache can be reset after reconnect', () => {
  const cache: RemoteExecutorUploadCache = {};
  const harness = createUploadHarness();
  const project = makeProject();
  const settings = makeSettings();

  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project,
    sessionKey: 'internal:ws://executor',
    settings,
    transport: harness.transport,
  });
  resetRemoteExecutorUploadCache(cache);
  uploadRemoteExecutorProjectIfNeeded({
    cache,
    project,
    sessionKey: 'internal:ws://executor',
    settings,
    transport: harness.transport,
  });

  assert.equal(harness.dynamicPayloads.length, 2);
});

test('remote executor upload cache does not mark failed dynamic uploads as cached', () => {
  const cache: RemoteExecutorUploadCache = {};
  const failingHarness = createUploadHarness({ dynamicSendResult: false });
  const project = makeProject();
  const settings = makeSettings();

  assert.throws(
    () =>
      uploadRemoteExecutorProjectIfNeeded({
        cache,
        project,
        sessionKey: 'internal:ws://executor',
        settings,
        transport: failingHarness.transport,
      }),
    /project upload could be sent/,
  );

  const passingHarness = createUploadHarness();
  const result = uploadRemoteExecutorProjectIfNeeded({
    cache,
    project,
    sessionKey: 'internal:ws://executor',
    settings,
    transport: passingHarness.transport,
  });

  assert.equal(result, 'uploaded');
  assert.equal(passingHarness.dynamicPayloads.length, 1);
});

test('remote executor upload cache does not mark failed static uploads as cached', () => {
  const cache: RemoteExecutorUploadCache = {};
  const failingHarness = createUploadHarness({ staticSendResult: false });
  const project = makeProject();
  const settings = makeSettings();

  assert.throws(
    () =>
      uploadRemoteExecutorProjectIfNeeded({
        cache,
        project,
        projectData: { ['data-1' as DataId]: 'static value' },
        sessionKey: 'internal:ws://executor',
        settings,
        transport: failingHarness.transport,
      }),
    /static project data could be sent/,
  );

  const passingHarness = createUploadHarness();
  const result = uploadRemoteExecutorProjectIfNeeded({
    cache,
    project,
    projectData: { ['data-1' as DataId]: 'static value' },
    sessionKey: 'internal:ws://executor',
    settings,
    transport: passingHarness.transport,
  });

  assert.equal(result, 'uploaded');
  assert.equal(passingHarness.dynamicPayloads.length, 1);
  assert.equal(passingHarness.staticPayloads.length, 1);
});
