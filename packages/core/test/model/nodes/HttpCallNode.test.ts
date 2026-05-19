import { afterEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  getHttpCallBodyPreviewSections,
  HttpCallNodeImpl,
  type EditorDefinition,
  type HttpCallNode,
  type InternalProcessContext,
  type Outputs,
  type PortId,
} from '../../../src/index.js';

const originalFetch = globalThis.fetch;
const requestFailedOutputId = 'requestFailed' as PortId;
const requestErrorOutputId = 'requestError' as PortId;
const statusCodeOutputId = 'statusCode' as PortId;

const expectedTextRequestFailedOutputs: Outputs = {
  res_body: { type: 'control-flow-excluded', value: undefined },
  json: { type: 'control-flow-excluded', value: undefined },
  statusCode: { type: 'control-flow-excluded', value: undefined },
  res_headers: { type: 'control-flow-excluded', value: undefined },
  requestFailed: { type: 'boolean', value: true },
};

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

const flattenEditors = (editors: EditorDefinition<HttpCallNode>[]): EditorDefinition<HttpCallNode>[] =>
  editors.flatMap((editor) => (editor.type === 'group' ? [editor, ...flattenEditors(editor.editors)] : [editor]));

const getStringOutputValue = (outputs: Outputs, portId: PortId): string => {
  const output = outputs[portId];
  if (output?.type !== 'string') {
    assert.fail(`Expected ${portId} to be a string output`);
  }
  return output.value;
};

const assertCaughtTextRequestFailure = (outputs: Outputs, expectedErrorParts: RegExp[]) => {
  const { [requestErrorOutputId]: errorOutput, ...outputsExceptError } = outputs;

  assert.equal(Object.keys(outputs)[0], requestErrorOutputId);
  assert.deepStrictEqual(outputsExceptError, expectedTextRequestFailedOutputs);
  assert.equal(errorOutput?.type, 'string');
  const errorText = getStringOutputValue(outputs, requestErrorOutputId);

  for (const expectedErrorPart of expectedErrorParts) {
    assert.match(errorText, expectedErrorPart);
  }
};

const assertStringArrayOutputMatches = (outputs: Outputs, portId: PortId, expectedErrorParts: RegExp[][]) => {
  const output = outputs[portId];

  assert.equal(output?.type, 'string[]');
  assert.ok(output?.type === 'string[]');
  assert.equal(output.value.length, expectedErrorParts.length);

  expectedErrorParts.forEach((errorParts, index) => {
    for (const errorPart of errorParts) {
      assert.match(output.value[index]!, errorPart);
    }
  });
};

const assertRetryAttemptOutputs = (
  outputs: Outputs,
  {
    statusCodeValues,
    requestFailedValues,
    requestErrorParts,
  }: {
    statusCodeValues?: number[];
    requestFailedValues: boolean[];
    requestErrorParts: RegExp[][];
  },
) => {
  assert.deepStrictEqual(
    outputs[statusCodeOutputId],
    statusCodeValues == null
      ? { type: 'control-flow-excluded', value: undefined }
      : { type: 'number[]', value: statusCodeValues },
  );
  assert.deepStrictEqual(outputs[requestFailedOutputId], {
    type: 'boolean[]',
    value: requestFailedValues,
  });
  assertStringArrayOutputMatches(outputs, requestErrorOutputId, requestErrorParts);
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('HttpCallNode', () => {
  it('creates with catchRequestFailed disabled by default', () => {
    const node = HttpCallNodeImpl.create();

    assert.equal(node.type, 'httpCall');
    assert.equal(node.data.catchRequestFailed, false);
    assert.equal(node.data.retryOnNon200, false);
    assert.equal(node.data.retryOnNon200RepeatTimes, 1);
    assert.equal(node.data.retryOnNon200CooldownMs, 0);
  });

  it('includes the Catch all request failures toggle in the editor config', () => {
    const node = new HttpCallNodeImpl(HttpCallNodeImpl.create());
    const editors = node.getEditors();

    assert.ok(
      editors.some(
        (editor) =>
          editor.type === 'toggle' &&
          editor.label === 'Catch all request failures' &&
          editor.dataKey === 'catchRequestFailed',
      ),
    );
  });

  it('includes retry-on-non-200 editors and hides retry details until enabled', () => {
    const node = new HttpCallNodeImpl(HttpCallNodeImpl.create());
    const editors = node.getEditors();
    const flattenedEditors = flattenEditors(editors);

    const bodyEditorIndex = editors.findIndex((editor) => editor.type === 'code' && editor.dataKey === 'body');
    const binaryOutputIndex = editors.findIndex(
      (editor) => editor.type === 'toggle' && editor.dataKey === 'isBinaryOutput',
    );
    const retryGroupIndex = editors.findIndex(
      (editor) => editor.type === 'group' && editor.label === 'Retry on non-200',
    );
    const retryGroup = editors[retryGroupIndex];

    assert.equal(retryGroupIndex, bodyEditorIndex + 1);
    assert.equal(binaryOutputIndex, retryGroupIndex + 1);
    assert.equal(retryGroup?.type, 'group');
    assert.equal(retryGroup?.toggleDataKey, 'retryOnNon200');

    const repeatTimesEditor = flattenedEditors.find(
      (editor) => editor.type === 'number' && editor.dataKey === 'retryOnNon200RepeatTimes',
    );
    const cooldownEditor = flattenedEditors.find(
      (editor) => editor.type === 'number' && editor.dataKey === 'retryOnNon200CooldownMs',
    );

    assert.equal(repeatTimesEditor?.label, 'Repeat times');
    assert.equal(repeatTimesEditor?.defaultValue, 1);
    assert.equal(repeatTimesEditor?.min, 1);
    assert.equal(repeatTimesEditor?.layout, 'inline');
    assert.equal(repeatTimesEditor?.helperMessage, 'Times to repeat after the initial request');

    assert.equal(cooldownEditor?.label, 'Cooldown, ms');
    assert.equal(cooldownEditor?.defaultValue, 0);
    assert.equal(cooldownEditor?.min, 0);
    assert.equal(cooldownEditor?.layout, 'inline');
    assert.equal(cooldownEditor?.helperMessage, 'Milliseconds to wait between repeats');
  });

  it('exposes request failure and retry-attempt outputs only for their enabled modes', () => {
    const withoutCatch = createNode({});
    const withCatch = createNode({ catchRequestFailed: true });
    const withRetry = createNode({ retryOnNon200: true });
    const withoutCatchOutputs = withoutCatch.getOutputDefinitions();
    const withCatchOutputs = withCatch.getOutputDefinitions();
    const withRetryOutputs = withRetry.getOutputDefinitions();
    const withoutCatchOutputIds = withoutCatchOutputs.map((definition) => definition.id);
    const withCatchOutputIds = withCatchOutputs.map((definition) => definition.id);
    const withRetryOutputIds = withRetryOutputs.map((definition) => definition.id);

    assert.equal(withoutCatchOutputIds.includes(requestFailedOutputId), false);
    assert.equal(withoutCatchOutputIds.includes(requestErrorOutputId), false);
    assert.equal(withoutCatchOutputs.find((definition) => definition.id === statusCodeOutputId)?.dataType, 'number');

    assert.equal(withCatchOutputIds.includes(requestFailedOutputId), true);
    assert.equal(withCatchOutputIds.includes(requestErrorOutputId), true);
    assert.equal(withCatchOutputs.find((definition) => definition.id === statusCodeOutputId)?.dataType, 'number');
    assert.equal(withCatchOutputs.find((definition) => definition.id === requestFailedOutputId)?.dataType, 'boolean');
    assert.equal(withCatchOutputs.find((definition) => definition.id === requestErrorOutputId)?.dataType, 'string');

    assert.equal(withRetryOutputIds.includes(requestFailedOutputId), true);
    assert.equal(withRetryOutputIds.includes(requestErrorOutputId), true);
    assert.equal(withRetryOutputs.find((definition) => definition.id === statusCodeOutputId)?.dataType, 'number[]');
    assert.equal(withRetryOutputs.find((definition) => definition.id === requestFailedOutputId)?.dataType, 'boolean[]');
    assert.equal(withRetryOutputs.find((definition) => definition.id === requestErrorOutputId)?.dataType, 'string[]');
  });

  it('builds HTTP body preview sections for selected options', () => {
    const node = createNode({
      method: 'POST',
      url: 'https://google.com',
      errorOnNon200: true,
      catchRequestFailed: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
      retryOnNon200CooldownMs: 1000,
    });

    const expectedSections = [
      'POST https://google.com',
      'Throw on non-2XX',
      'Catch all request failures',
      'Retry on non-200 (1 repeats, 1000ms cooldown)',
    ];

    assert.deepStrictEqual(getHttpCallBodyPreviewSections(node.data), expectedSections);
    assert.equal(node.getBody(), expectedSections.join('\n'));
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

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      catchRequestFailed: false,
    });

    await assert.rejects(() => node.process({}, createContext()), /HTTP call returned non-2XX status code: 404/);
  });

  it('retries non-200 responses before applying fail-on-non-2XX behavior', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return requestCount === 1
        ? new Response('server error', { status: 500, headers: { 'content-type': 'text/plain' } })
        : new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      catchRequestFailed: false,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
    });
    const result = await node.process({}, createContext());

    assert.equal(requestCount, 2);
    assert.deepStrictEqual(result.res_body, { type: 'string', value: 'ok' });
    assertRetryAttemptOutputs(result, {
      statusCodeValues: [500, 200],
      requestFailedValues: [true, false],
      requestErrorParts: [[/HTTP call returned non-2XX status code: 500/]],
    });
  });

  it('retries 2XX responses that are not exactly 200', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return requestCount === 1
        ? new Response('created', { status: 201, headers: { 'content-type': 'text/plain' } })
        : new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
    });
    const result = await node.process({}, createContext());

    assert.equal(requestCount, 2);
    assertRetryAttemptOutputs(result, {
      statusCodeValues: [201, 200],
      requestFailedValues: [true, false],
      requestErrorParts: [[/HTTP call returned non-2XX status code: 201/]],
    });
  });

  it('treats saved repeat counts below one as one repeat when retry is enabled', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return requestCount === 1
        ? new Response('server error', { status: 500, headers: { 'content-type': 'text/plain' } })
        : new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 0,
    });
    const result = await node.process({}, createContext());

    assert.equal(requestCount, 2);
    assertRetryAttemptOutputs(result, {
      statusCodeValues: [500, 200],
      requestFailedValues: [true, false],
      requestErrorParts: [[/HTTP call returned non-2XX status code: 500/]],
    });
  });

  it('returns the final non-200 response after retries when fail-on-non-2XX is disabled', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return new Response(`try ${requestCount}`, { status: 503, headers: { 'content-type': 'text/plain' } });
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: false,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 2,
    });
    const result = await node.process({}, createContext());

    assert.equal(requestCount, 3);
    assert.deepStrictEqual(result.res_body, { type: 'string', value: 'try 3' });
    assertRetryAttemptOutputs(result, {
      statusCodeValues: [503, 503, 503],
      requestFailedValues: [true, true, true],
      requestErrorParts: [
        [/HTTP call returned non-2XX status code: 503/],
        [/HTTP call returned non-2XX status code: 503/],
        [/HTTP call returned non-2XX status code: 503/],
      ],
    });
  });

  it('lets catchRequestFailed catch the final non-2XX failure after retries are exhausted', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      catchRequestFailed: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
    });
    const result = await node.process({}, createContext());

    assert.equal(requestCount, 2);
    assert.equal(Object.keys(result)[0], requestErrorOutputId);
    assert.deepStrictEqual(result.res_body, { type: 'control-flow-excluded', value: undefined });
    assert.deepStrictEqual(result.json, { type: 'control-flow-excluded', value: undefined });
    assert.deepStrictEqual(result.res_headers, { type: 'control-flow-excluded', value: undefined });
    assertRetryAttemptOutputs(result, {
      statusCodeValues: [404, 404],
      requestFailedValues: [true, true],
      requestErrorParts: [
        [/HTTP call returned non-2XX status code: 404/],
        [/HTTP call returned non-2XX status code: 404/],
      ],
    });
  });

  it('records thrown request failures in existing retry transport outputs when catch mode is enabled', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      catchRequestFailed: true,
      retryOnNon200: true,
    });
    const result = await node.process({}, createContext());

    assert.equal(Object.keys(result)[0], requestErrorOutputId);
    assert.deepStrictEqual(result.res_body, { type: 'control-flow-excluded', value: undefined });
    assert.deepStrictEqual(result.json, { type: 'control-flow-excluded', value: undefined });
    assert.deepStrictEqual(result.res_headers, { type: 'control-flow-excluded', value: undefined });
    assertRetryAttemptOutputs(result, {
      statusCodeValues: undefined,
      requestFailedValues: [true],
      requestErrorParts: [[/fetch failed/]],
    });
  });

  it('uses existing retry transport outputs for invalid URLs before any request starts', async () => {
    const node = createNode({ url: 'not a url', catchRequestFailed: true, retryOnNon200: true });
    const result = await node.process({}, createContext());

    assert.equal(Object.keys(result)[0], requestErrorOutputId);
    assertRetryAttemptOutputs(result, {
      statusCodeValues: undefined,
      requestFailedValues: [true],
      requestErrorParts: [[/Invalid URL: not a url/]],
    });
  });

  it('keeps response processing failures visible in existing retry transport outputs', async () => {
    globalThis.fetch = async () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } });

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      catchRequestFailed: true,
      retryOnNon200: true,
    });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result.res_body, { type: 'control-flow-excluded', value: undefined });
    assertRetryAttemptOutputs(result, {
      statusCodeValues: [200],
      requestFailedValues: [true],
      requestErrorParts: [[/SyntaxError/]],
    });
  });

  it('returns excluded request error when retry mode succeeds without failed attempts', async () => {
    globalThis.fetch = async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      catchRequestFailed: true,
      retryOnNon200: true,
    });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result.statusCode, { type: 'number[]', value: [200] });
    assert.deepStrictEqual(result.requestFailed, { type: 'boolean[]', value: [false] });
    assert.deepStrictEqual(result.requestError, { type: 'control-flow-excluded', value: undefined });
  });

  it('keeps old HTTP retry-attempt output IDs out of the runtime contract', async () => {
    globalThis.fetch = async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      retryOnNon200: true,
    });
    const result = await node.process({}, createContext());

    assert.equal('statusCodes' in result, false);
    assert.equal('requestFailedAttempts' in result, false);
    assert.equal('requestErrors' in result, false);
  });

  it('does not expose old HTTP retry-attempt output definitions', () => {
    const node = createNode({ retryOnNon200: true });
    const outputIds = node.getOutputDefinitions().map((definition) => definition.id);

    assert.equal(outputIds.includes('statusCodes' as PortId), false);
    assert.equal(outputIds.includes('requestFailedAttempts' as PortId), false);
    assert.equal(outputIds.includes('requestErrors' as PortId), false);
  });

  it('records request errors from each failed retry attempt in existing Request error output', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return new Response(`try ${requestCount}`, { status: requestCount === 1 ? 502 : 503 });
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: false,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
    });
    const result = await node.process({}, createContext());

    assertRetryAttemptOutputs(result, {
      statusCodeValues: [502, 503],
      requestFailedValues: [true, true],
      requestErrorParts: [
        [/HTTP call returned non-2XX status code: 502/],
        [/HTTP call returned non-2XX status code: 503/],
      ],
    });
  });

  it('records final caught retry errors as an array on the existing Request error output', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
    };

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      catchRequestFailed: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
    });
    const result = await node.process({}, createContext());

    assert.equal(requestCount, 2);
    assertStringArrayOutputMatches(result, requestErrorOutputId, [
      [/HTTP call returned non-2XX status code: 404/],
      [/HTTP call returned non-2XX status code: 404/],
    ]);
  });

  it('does not swallow aborts during retry cooldown', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount++;
      return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
    };

    const abortController = new AbortController();
    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      catchRequestFailed: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
      retryOnNon200CooldownMs: 50,
    });

    setTimeout(() => abortController.abort(), 5);

    await assert.rejects(() => node.process({}, createContext({ signal: abortController.signal })), /Aborted/);
    assert.equal(requestCount, 1);
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

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      catchRequestFailed: false,
    });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: 'created' },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'number', value: 201 },
      res_headers: { type: 'object', value: { 'content-type': 'text/plain' } },
    });
  });

  it('does not format unused retry-attempt errors when retry mode is disabled', async () => {
    globalThis.fetch = async () => new Response('created', { status: 201, headers: { 'content-type': 'text/plain' } });

    const originalPrepareStackTrace = Error.prepareStackTrace;
    let formattedStackCount = 0;
    Error.prepareStackTrace = () => {
      formattedStackCount++;
      return 'formatted stack';
    };

    try {
      const node = createNode({
        method: 'GET',
        url: 'https://example.com',
        errorOnNon200: true,
        retryOnNon200: false,
      });
      const result = await node.process({}, createContext());

      assert.deepStrictEqual(result.statusCode, { type: 'number', value: 201 });
      assert.equal(formattedStackCount, 0);
    } finally {
      Error.prepareStackTrace = originalPrepareStackTrace;
    }
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
      requestError: { type: 'control-flow-excluded', value: undefined },
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
      requestError: { type: 'control-flow-excluded', value: undefined },
    });
  });

  it('returns requestFailed=false on successful binary responses when enabled', async () => {
    globalThis.fetch = async () =>
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      catchRequestFailed: true,
      isBinaryOutput: true,
    });
    const result = await node.process({}, createContext());

    assert.equal(result.binary?.type, 'binary');
    assert.deepStrictEqual(Array.from((result.binary as { value: Uint8Array }).value), [1, 2, 3]);
    assert.deepStrictEqual(result.statusCode, { type: 'number', value: 200 });
    assert.deepStrictEqual(result.res_headers, {
      type: 'object',
      value: { 'content-type': 'application/octet-stream' },
    });
    assert.deepStrictEqual(result.requestFailed, { type: 'boolean', value: false });
    assert.deepStrictEqual(result.requestError, { type: 'control-flow-excluded', value: undefined });
  });

  it('still throws invalid URL when catchRequestFailed is disabled', async () => {
    const node = createNode({ url: 'not a url' });

    await assert.rejects(() => node.process({}, createContext()), /Invalid URL: not a url/);
  });

  it('returns excluded outputs and requestFailed=true for invalid URL when enabled', async () => {
    const node = createNode({ url: 'not a url', catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assertCaughtTextRequestFailure(result, [/Invalid URL: not a url/]);
  });

  it('catches browser-style Failed to fetch errors when enabled', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext({ executor: 'browser' }));

    assert.deepStrictEqual(result.requestFailed, { type: 'boolean', value: true });
    assert.deepStrictEqual(result.res_body, { type: 'control-flow-excluded', value: undefined });
    const errorText = getStringOutputValue(result, requestErrorOutputId);
    assert.match(errorText, /CORS problems/);
    assert.match(errorText, /Failed to fetch/);
  });

  it('catches browser-style Load failed errors when enabled', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Load failed');
    };

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext({ executor: 'browser' }));

    assert.deepStrictEqual(result.requestFailed, { type: 'boolean', value: true });
    assert.deepStrictEqual(result.statusCode, { type: 'control-flow-excluded', value: undefined });
    const errorText = getStringOutputValue(result, requestErrorOutputId);
    assert.match(errorText, /CORS problems/);
    assert.match(errorText, /Load failed/);
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
    const errorText = getStringOutputValue(result, requestErrorOutputId);
    assert.match(errorText, /fetch failed/);
    assert.match(errorText, /ENOTFOUND/);
  });

  it('treats non-2XX responses as requestFailed=true when both toggles are enabled', async () => {
    globalThis.fetch = async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      catchRequestFailed: true,
    });
    const result = await node.process({}, createContext());

    assertCaughtTextRequestFailure(result, [/HTTP call returned non-2XX status code: 404/]);
  });

  it('keeps 2XX responses out of the requestFailed path when both toggles are enabled', async () => {
    globalThis.fetch = async () => new Response('created', { status: 201, headers: { 'content-type': 'text/plain' } });

    const node = createNode({
      method: 'GET',
      url: 'https://example.com',
      errorOnNon200: true,
      catchRequestFailed: true,
    });
    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result, {
      res_body: { type: 'string', value: 'created' },
      json: { type: 'control-flow-excluded', value: undefined },
      statusCode: { type: 'number', value: 201 },
      res_headers: { type: 'object', value: { 'content-type': 'text/plain' } },
      requestFailed: { type: 'boolean', value: false },
      requestError: { type: 'control-flow-excluded', value: undefined },
    });
  });

  it('still throws runtime request failures when catchRequestFailed is disabled', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    const node = createNode({ method: 'GET', url: 'https://example.com' });

    await assert.rejects(() => node.process({}, createContext()), /fetch failed/);
  });

  it('catches malformed JSON responses when enabled', async () => {
    globalThis.fetch = async () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } });

    const node = createNode({ method: 'GET', url: 'https://example.com', catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assertCaughtTextRequestFailure(result, [/SyntaxError/]);
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

  it('catches response body read failures when enabled', async () => {
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
    const result = await node.process({}, createContext());

    assertCaughtTextRequestFailure(result, [/Body read failed/]);
  });

  it('catches invalid configured headers JSON when enabled', async () => {
    const node = createNode({ method: 'GET', url: 'https://example.com', headers: '{', catchRequestFailed: true });
    const result = await node.process({}, createContext());

    assertCaughtTextRequestFailure(result, [/SyntaxError/]);
  });
});
