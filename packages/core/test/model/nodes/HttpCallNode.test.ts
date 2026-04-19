import { afterEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { HttpCallNodeImpl, type HttpCallNode, type InternalProcessContext, type PortId } from '../../../src/index.js';

const originalFetch = globalThis.fetch;

const createNode = (data: Partial<HttpCallNode['data']>) =>
  new HttpCallNodeImpl({
    ...HttpCallNodeImpl.create(),
    data: {
      ...HttpCallNodeImpl.create().data,
      ...data,
    },
  });

const createContext = ({
  executor = 'nodejs',
  signal = new AbortController().signal,
}: {
  executor?: 'nodejs' | 'browser';
  signal?: AbortSignal;
} = {}) =>
  ({
    executor,
    signal,
    graphInputNodeValues: {},
    contextValues: {},
  }) as InternalProcessContext;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('HttpCallNode', () => {
  it('creates with catchRequestFailed disabled by default', () => {
    const node = HttpCallNodeImpl.create();

    assert.equal(node.type, 'httpCall');
    assert.equal(node.data.catchRequestFailed, false);
  });

  it('includes the Catch Request failed toggle in the editor config', () => {
    const node = new HttpCallNodeImpl(HttpCallNodeImpl.create());
    const editors = node.getEditors();

    assert.ok(
      editors.some(
        (editor) =>
          editor.type === 'toggle' && editor.label === 'Catch Request failed' && editor.dataKey === 'catchRequestFailed',
      ),
    );
  });

  it('only exposes the requestFailed output when enabled', () => {
    const withoutCatch = createNode({});
    const withCatch = createNode({ catchRequestFailed: true });

    assert.equal(withoutCatch.getOutputDefinitions().some((definition) => definition.id === 'requestFailed'), false);
    assert.equal(withCatch.getOutputDefinitions().some((definition) => definition.id === 'requestFailed'), true);
  });

  it('keeps success behavior unchanged when catchRequestFailed is disabled', async () => {
    globalThis.fetch = async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });

    const node = createNode({ method: 'GET', url: 'https://example.com' });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: 'ok' },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'number', value: 200 },
      res_headers: { type: 'object', value: { 'content-type': 'text/plain' } },
    });
  });

  it('throws on non-2XX responses when errorOnNon200 is enabled and catchRequestFailed is disabled', async () => {
    globalThis.fetch = async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', errorOnNon200: true, catchRequestFailed: false });

    await assert.rejects(() => node.process({}, createContext()), /HTTP call returned non-2XX status code: 404/);
  });

  it('does not throw on non-2XX responses when errorOnNon200 is disabled', async () => {
    globalThis.fetch = async () => new Response('created', { status: 201, headers: { 'content-type': 'text/plain' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', errorOnNon200: false });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: 'created' },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'number', value: 201 },
      res_headers: { type: 'object', value: { 'content-type': 'text/plain' } },
    });
  });

  it('does not throw on 2XX responses when errorOnNon200 is enabled', async () => {
    globalThis.fetch = async () => new Response('created', { status: 201, headers: { 'content-type': 'text/plain' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', errorOnNon200: true, catchRequestFailed: false });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: 'created' },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'number', value: 201 },
      res_headers: { type: 'object', value: { 'content-type': 'text/plain' } },
    });
  });

  it('returns requestFailed=false on successful text responses when enabled', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: '{"ok":true}' },
      json: { type: 'object', value: { ok: true } },
      statusCode: { type: 'number', value: 200 },
      res_headers: { type: 'object', value: { 'content-type': 'application/json' } },
      requestFailed: { type: 'boolean', value: false },
    });
  });

  it('returns requestFailed=false on successful non-json responses when enabled', async () => {
    globalThis.fetch = async () => new Response('plain', { status: 200, headers: { 'content-type': 'text/plain' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: 'plain' },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'number', value: 200 },
      res_headers: { type: 'object', value: { 'content-type': 'text/plain' } },
      requestFailed: { type: 'boolean', value: false },
    });
  });

  it('returns requestFailed=false on successful binary responses when enabled', async () => {
    globalThis.fetch = async () =>
      new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/octet-stream' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true, isBinaryOutput: true });
    const result = await node.process({}, createContext());

    assert.equal(result.binary?.type, 'binary');
    assert.deepStrictEqual(Array.from((result.binary as { value: Uint8Array }).value), [1, 2, 3]);
    assert.deepStrictEqual(result.statusCode, { type: 'number', value: 200 });
    assert.deepStrictEqual(result.res_headers, {
      type: 'object',
      value: { 'content-type': 'application/octet-stream' },
    });
    assert.deepStrictEqual(result.requestFailed, { type: 'boolean', value: false });
  });

  it('still throws invalid URL when catchRequestFailed is disabled', async () => {
    const node = createNode({ url: 'not a url' });

    await assert.rejects(() => node.process({}, createContext()), /Invalid URL: not a url/);
  });

  it('returns excluded outputs and requestFailed=true for invalid URL when enabled', async () => {
    const node = createNode({ url: 'not a url', catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'control-flow-excluded', value: undefined },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'control-flow-excluded', value: undefined },
      res_headers: { type: 'control-flow-excluded', value: undefined },
      requestFailed: { type: 'boolean', value: true },
    });
  });

  it('catches browser-style Failed to fetch errors when enabled', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext({ executor: 'browser' }));

    assert.deepStrictEqual(result.requestFailed, { type: 'boolean', value: true });
    assert.deepStrictEqual(result.res_body, { type: 'control-flow-excluded', value: undefined });
  });

  it('catches browser-style Load failed errors when enabled', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Load failed');
    };

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext({ executor: 'browser' }));

    assert.deepStrictEqual(result.requestFailed, { type: 'boolean', value: true });
    assert.deepStrictEqual(result.statusCode, { type: 'control-flow-excluded', value: undefined });
  });

  it('catches node-style fetch failed errors when enabled', async () => {
    const fetchError = new TypeError('fetch failed') as TypeError & { cause?: { code: string; message: string } };
    fetchError.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND example.invalid' };
    globalThis.fetch = async () => {
      throw fetchError;
    };

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result.requestFailed, { type: 'boolean', value: true });
    assert.deepStrictEqual(result.res_headers, { type: 'control-flow-excluded', value: undefined });
  });

  it('treats non-2XX responses as requestFailed=true when both toggles are enabled', async () => {
    globalThis.fetch = async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', errorOnNon200: true, catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'control-flow-excluded', value: undefined },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'control-flow-excluded', value: undefined },
      res_headers: { type: 'control-flow-excluded', value: undefined },
      requestFailed: { type: 'boolean', value: true },
    });
  });

  it('keeps 2XX responses out of the requestFailed path when both toggles are enabled', async () => {
    globalThis.fetch = async () => new Response('created', { status: 201, headers: { 'content-type': 'text/plain' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', errorOnNon200: true, catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: 'created' },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'number', value: 201 },
      res_headers: { type: 'object', value: { 'content-type': 'text/plain' } },
      requestFailed: { type: 'boolean', value: false },
    });
  });

  it('still throws runtime request failures when catchRequestFailed is disabled', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    const node = createNode({ method: 'GET', url: 'https://example.com' });

    await assert.rejects(() => node.process({}, createContext()), /fetch failed/);
  });

  it('does not catch malformed JSON responses', async () => {
    globalThis.fetch = async () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });

    await assert.rejects(() => node.process({}, createContext()), /Unexpected end|JSON/);
  });

  it('does not catch abort errors', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    globalThis.fetch = async () => {
      throw abortError;
    };

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });

    await assert.rejects(() => node.process({}, createContext()), /Aborted/);
  });

  it('does not catch response body read failures', async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => {
          throw new Error('Body read failed');
        },
      }) as Response;

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });

    await assert.rejects(() => node.process({}, createContext()), /Body read failed/);
  });
});
