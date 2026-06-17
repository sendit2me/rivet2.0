import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PROFILE_EXTENDS_DEPTH,
  resolveChatNodeConnection,
  resolveProfile,
} from '../../src/model/LlmProfileResolution.js';
import type { LlmProfile, Settings } from '../../src/model/Settings.js';

const DEFAULT_ENDPOINT = 'https://api.openai.com/api/v1/chat/completions';

function settingsWith(profiles: LlmProfile[]): Pick<Settings, 'llmProfiles'> {
  return { llmProfiles: profiles };
}

describe('resolveProfile', () => {
  it('returns {} for an empty/undefined id (global fallback)', () => {
    assert.deepEqual(resolveProfile({ llmProfiles: [] }, undefined), {});
    assert.deepEqual(resolveProfile({ llmProfiles: [] }, ''), {});
  });

  it('returns {} and traces for an unknown id', () => {
    const traces: string[] = [];
    const result = resolveProfile(settingsWith([{ id: 'a', name: 'A' }]), 'missing', (m) => traces.push(m));
    assert.deepEqual(result, {});
    assert.equal(traces.length, 1);
    assert.match(traces[0]!, /not found/);
  });

  it('resolves a single profile to all its fields', () => {
    const profile: LlmProfile = {
      id: 'local',
      name: 'Local',
      endpoint: 'http://localhost:1234/v1/chat/completions',
      apiKey: '',
      organization: 'org-1',
      headers: { 'x-a': '1' },
      defaultModel: 'qwen',
    };
    assert.deepEqual(resolveProfile(settingsWith([profile]), 'local'), {
      endpoint: 'http://localhost:1234/v1/chat/completions',
      apiKey: '',
      organization: 'org-1',
      headers: { 'x-a': '1' },
      defaultModel: 'qwen',
    });
  });

  it('merges a 2-level extends chain with the child overriding the parent', () => {
    const profiles: LlmProfile[] = [
      { id: 'base', name: 'Base', endpoint: 'http://base', apiKey: 'base-key', defaultModel: 'base-model' },
      { id: 'child', name: 'Child', extends: 'base', apiKey: 'child-key' },
    ];
    assert.deepEqual(resolveProfile(settingsWith(profiles), 'child'), {
      endpoint: 'http://base', // inherited
      apiKey: 'child-key', // overridden
      defaultModel: 'base-model', // inherited
    });
  });

  it('merges a 3-level extends chain (grandparent -> parent -> child)', () => {
    const profiles: LlmProfile[] = [
      { id: 'gp', name: 'GP', endpoint: 'http://gp', apiKey: 'gp-key', organization: 'gp-org' },
      { id: 'p', name: 'P', extends: 'gp', apiKey: 'p-key' },
      { id: 'c', name: 'C', extends: 'p', organization: 'c-org' },
    ];
    assert.deepEqual(resolveProfile(settingsWith(profiles), 'c'), {
      endpoint: 'http://gp', // from grandparent
      apiKey: 'p-key', // parent overrides grandparent
      organization: 'c-org', // child overrides grandparent
    });
  });

  it('deep-merges headers key-by-key across the chain (descendant keys win)', () => {
    const profiles: LlmProfile[] = [
      { id: 'base', name: 'Base', headers: { shared: 'base', onlyBase: 'b' } },
      { id: 'child', name: 'Child', extends: 'base', headers: { shared: 'child', onlyChild: 'c' } },
    ];
    assert.deepEqual(resolveProfile(settingsWith(profiles), 'child').headers, {
      shared: 'child',
      onlyBase: 'b',
      onlyChild: 'c',
    });
  });

  it('ignores an extends pointing at an unknown parent and keeps resolving the child', () => {
    const traces: string[] = [];
    const profiles: LlmProfile[] = [{ id: 'child', name: 'Child', extends: 'ghost', apiKey: 'child-key' }];
    const result = resolveProfile(settingsWith(profiles), 'child', (m) => traces.push(m));
    assert.deepEqual(result, { apiKey: 'child-key' });
    assert.equal(traces.length, 1);
    assert.match(traces[0]!, /unknown profile 'ghost'/);
  });

  it('guards against an extends cycle and returns the partial chain', () => {
    const traces: string[] = [];
    const profiles: LlmProfile[] = [
      { id: 'a', name: 'A', extends: 'b', apiKey: 'a-key' },
      { id: 'b', name: 'B', extends: 'a', endpoint: 'http://b' },
    ];
    const result = resolveProfile(settingsWith(profiles), 'a', (m) => traces.push(m));
    // Both nodes are visited once; merge of {a} over {b} -> a-key wins, endpoint from b survives.
    assert.deepEqual(result, { apiKey: 'a-key', endpoint: 'http://b' });
    assert.ok(traces.some((t) => /cycle/.test(t)));
  });

  it('caps the extends depth and stops walking', () => {
    // Build a linear chain longer than the cap: p0 (root requested) -> p1 -> ... -> pN.
    const len = MAX_PROFILE_EXTENDS_DEPTH + 5;
    const profiles: LlmProfile[] = [];
    for (let i = 0; i < len; i++) {
      profiles.push({
        id: `p${i}`,
        name: `P${i}`,
        extends: i < len - 1 ? `p${i + 1}` : undefined,
        // Only the deepest ancestor sets this; if the cap stops us early it won't appear.
        ...(i === len - 1 ? { endpoint: 'http://deepest' } : {}),
      });
    }
    const traces: string[] = [];
    const result = resolveProfile(settingsWith(profiles), 'p0', (m) => traces.push(m));
    assert.ok(traces.some((t) => /max extends depth/.test(t)));
    // The deepest ancestor is beyond the cap, so its endpoint must NOT be present.
    assert.equal(result.endpoint, undefined);
  });
});

describe('resolveChatNodeConnection (precedence Node > Profile > Global)', () => {
  const global = {
    openAiEndpoint: 'http://global-endpoint',
    openAiKey: 'global-key',
    openAiOrganization: 'global-org',
    chatNodeHeaders: { g: 'global', shared: 'global' },
  };

  it('node-level fields beat the profile, which beats global', () => {
    const conn = resolveChatNodeConnection({
      profile: {
        endpoint: 'http://profile-endpoint',
        apiKey: 'profile-key',
        organization: 'profile-org',
        defaultModel: 'profile-model',
        headers: { p: 'profile', shared: 'profile' },
      },
      global,
      node: { endpoint: 'http://node-endpoint', model: 'node-model', headers: { n: 'node', shared: 'node' } },
      defaultEndpoint: DEFAULT_ENDPOINT,
    });
    assert.equal(conn.endpoint, 'http://node-endpoint');
    assert.equal(conn.model, 'node-model');
    // key/org are not node-level fields, so the profile wins over global.
    assert.equal(conn.apiKey, 'profile-key');
    assert.equal(conn.organization, 'profile-org');
    // Header merge order global < profile < node.
    assert.deepEqual(conn.headers, { g: 'global', p: 'profile', n: 'node', shared: 'node' });
  });

  it('falls back to the profile when node fields are blank', () => {
    const conn = resolveChatNodeConnection({
      profile: {
        endpoint: 'http://profile-endpoint',
        apiKey: 'profile-key',
        organization: 'profile-org',
        defaultModel: 'profile-model',
        headers: { p: 'profile' },
      },
      global,
      node: { endpoint: '', model: '', headers: {} },
      defaultEndpoint: DEFAULT_ENDPOINT,
    });
    assert.equal(conn.endpoint, 'http://profile-endpoint');
    assert.equal(conn.model, 'profile-model');
    assert.equal(conn.apiKey, 'profile-key');
    assert.equal(conn.organization, 'profile-org');
    assert.deepEqual(conn.headers, { g: 'global', shared: 'global', p: 'profile' });
  });

  it('preserves an empty-string profile apiKey (keyless local endpoint)', () => {
    const conn = resolveChatNodeConnection({
      profile: { apiKey: '' },
      global,
      node: { endpoint: '', model: 'm' },
      defaultEndpoint: DEFAULT_ENDPOINT,
    });
    // '' is an explicit, valid keyless value — it must override the global key, not fall through.
    assert.equal(conn.apiKey, '');
  });

  it('uses the default endpoint when neither node, profile, nor global set one', () => {
    const conn = resolveChatNodeConnection({
      profile: {},
      global: {},
      node: { endpoint: '', model: 'm' },
      defaultEndpoint: DEFAULT_ENDPOINT,
    });
    assert.equal(conn.endpoint, DEFAULT_ENDPOINT);
  });
});

describe('backward compatibility (no profile selected)', () => {
  it('resolves byte-identically to base global-settings behavior', () => {
    // Snapshot of what base Rivet produces from globals alone: empty profile + no node-level fields.
    const global = {
      openAiEndpoint: 'http://my-endpoint',
      openAiKey: 'my-key',
      openAiOrganization: 'my-org',
      chatNodeHeaders: { 'x-custom': 'v' },
    };
    const conn = resolveChatNodeConnection({
      profile: resolveProfile({ llmProfiles: [] }, undefined), // == {}
      global,
      node: { endpoint: undefined, model: 'gpt-5', headers: undefined },
      defaultEndpoint: DEFAULT_ENDPOINT,
    });

    assert.deepEqual(
      { endpoint: conn.endpoint, apiKey: conn.apiKey, organization: conn.organization, headers: conn.headers },
      {
        endpoint: 'http://my-endpoint',
        apiKey: 'my-key',
        organization: 'my-org',
        headers: { 'x-custom': 'v' },
      },
    );
    assert.equal(conn.model, 'gpt-5');
  });

  it('with empty globals, matches the legacy `openAiKey ?? \'\'` + default endpoint result', () => {
    const conn = resolveChatNodeConnection({
      profile: {},
      global: {},
      node: { endpoint: undefined, model: 'gpt-5', headers: undefined },
      defaultEndpoint: DEFAULT_ENDPOINT,
    });
    assert.equal(conn.apiKey, '');
    assert.equal(conn.organization, undefined);
    assert.equal(conn.endpoint, DEFAULT_ENDPOINT);
    assert.deepEqual(conn.headers, {});
  });
});
