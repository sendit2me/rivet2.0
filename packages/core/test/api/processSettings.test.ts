import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { DEFAULT_CHAT_NODE_TIMEOUT, resolveProcessSettings } from '../../src/index.js';

describe('resolveProcessSettings', () => {
  it('applies the runtime defaults used by graph processors', () => {
    assert.deepEqual(resolveProcessSettings(), {
      openAiKey: '',
      openAiOrganization: '',
      openAiEndpoint: '',
      pluginEnv: {},
      pluginSettings: {},
      recordingPlaybackLatency: 1000,
      defaultNodeColors: false,
      openNodeSettingsOnCreate: true,
      chatNodeHeaders: {},
      chatNodeTimeout: DEFAULT_CHAT_NODE_TIMEOUT,
      throttleChatNode: 100,
    });
  });

  it('prefers explicit settings over host fallbacks', () => {
    assert.equal(resolveProcessSettings({ recordingPlaybackLatency: 250 }).recordingPlaybackLatency, 250);
    assert.equal(
      resolveProcessSettings({ openAiKey: 'explicit', pluginEnv: { A: '1' } }, { openAiKey: 'fallback' }).openAiKey,
      'explicit',
    );
    assert.deepEqual(
      resolveProcessSettings({ openAiKey: 'explicit', pluginEnv: { A: '1' } }, { pluginEnv: { B: '2' } }).pluginEnv,
      { A: '1' },
    );
  });

  it('uses host fallbacks when explicit settings are missing', () => {
    assert.deepEqual(
      resolveProcessSettings(undefined, {
        openAiKey: 'env-key',
        openAiOrganization: 'env-org',
        openAiEndpoint: 'env-endpoint',
        pluginEnv: { API_TOKEN: 'token' },
      }),
      {
        openAiKey: 'env-key',
        openAiOrganization: 'env-org',
        openAiEndpoint: 'env-endpoint',
        pluginEnv: { API_TOKEN: 'token' },
        pluginSettings: {},
        recordingPlaybackLatency: 1000,
        defaultNodeColors: false,
        openNodeSettingsOnCreate: true,
        chatNodeHeaders: {},
        chatNodeTimeout: DEFAULT_CHAT_NODE_TIMEOUT,
        throttleChatNode: 100,
      },
    );
  });
});
