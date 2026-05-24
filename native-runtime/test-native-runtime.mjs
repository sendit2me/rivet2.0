import assert from 'node:assert/strict';

import { createNativeGraphRunner } from './index.js';

const backends = [
  { backend: 'js', expectedBackend: 'js-adapter' },
  { backend: 'rust', expectedBackend: 'rust-worker' },
];

for (const backend of backends) {
  await testContextInterpolationAndProcessing(backend);
  await testRepeatedAndConcurrentRuns(backend);
  await testGraphInputDefaultsAndCoercion(backend);
  await testGraphInputDefaultInputPort(backend);
  await testGraphInputUnconnectedDefaultInputPort(backend);
  await testGraphInputUnconnectedBooleanDefaultInputPort(backend);
  await testObjectGraphInputDefault(backend);
  await testJoinArrayFanIn(backend);
  await testObjectConstruction(backend);
  await testObjectArrayConstruction(backend);
  await testCoalesceFanIn(backend);
  await testDestructureObjectPaths(backend);
  await testExtractObjectPath(backend);
  await testCreateRejectionReasons(backend);
}

async function testContextInterpolationAndProcessing({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeContextInterpolationRequest(), expectedBackend);
    try {
      const outputs = await runner.run({
        context: {
          suffix: { type: 'string', value: 'rust' },
        },
        inputs: {
          input: { type: 'string', value: 'native' },
        },
      });

      assert.deepEqual(outputs, {
        result: { type: 'string', value: 'native RUST' },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testRepeatedAndConcurrentRuns({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeRepeatedSubgraphFanInRequest(), expectedBackend);
    try {
      assert.deepEqual(
        await runner.run({
          context: { suffix: { type: 'string', value: 'A' } },
          inputs: { input: { type: 'string', value: 'first' } },
        }),
        {
          result: { type: 'string', value: 'first-Afirst-A' },
        },
      );

      assert.deepEqual(
        await runner.run({
          context: { suffix: { type: 'string', value: 'B' } },
          inputs: { input: { type: 'string', value: 'second' } },
        }),
        {
          result: { type: 'string', value: 'second-Bsecond-B' },
        },
      );

      const [leftOutputs, rightOutputs] = await Promise.all([
        runner.run({
          context: { suffix: { type: 'string', value: 'L' } },
          inputs: { input: { type: 'string', value: 'left' } },
        }),
        runner.run({
          context: { suffix: { type: 'string', value: 'R' } },
          inputs: { input: { type: 'string', value: 'right' } },
        }),
      ]);

      assert.deepEqual(leftOutputs, {
        result: { type: 'string', value: 'left-Lleft-L' },
      });
      assert.deepEqual(rightOutputs, {
        result: { type: 'string', value: 'right-Rright-R' },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testGraphInputDefaultsAndCoercion({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeDefaultInputRequest(), expectedBackend);
    try {
      const outputs = await runner.run();

      assert.deepEqual(outputs, {
        result: { type: 'string', value: '7 true' },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testGraphInputDefaultInputPort({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeDefaultInputPortRequest(), expectedBackend);
    try {
      assert.deepEqual(await runner.run(), {
        result: { type: 'string', value: 'dynamic' },
      });

      assert.deepEqual(
        await runner.run({
          inputs: {
            input: { type: 'string', value: 'explicit' },
          },
        }),
        {
          result: { type: 'string', value: 'explicit' },
        },
      );
    } finally {
      runner.dispose?.();
    }
  });
}

async function testGraphInputUnconnectedDefaultInputPort({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeUnconnectedDefaultInputPortRequest(), expectedBackend);
    try {
      const outputs = await runner.run();

      assert.deepEqual(outputs, {
        result: { type: 'string', value: '' },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testGraphInputUnconnectedBooleanDefaultInputPort({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeUnconnectedBooleanDefaultInputPortRequest(), expectedBackend);
    try {
      const outputs = await runner.run();

      assert.deepEqual(outputs, {
        result: { type: 'boolean', value: false },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testObjectGraphInputDefault({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeObjectDefaultInputRequest(), expectedBackend);
    try {
      const outputs = await runner.run();

      assert.deepEqual(outputs, {
        result: { type: 'object', value: {} },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testJoinArrayFanIn({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeJoinArrayFanInRequest(), expectedBackend);
    try {
      const outputs = await runner.run({
        inputs: {
          items: { type: 'string[]', value: ['a', 'b', 'c'] },
        },
      });

      assert.deepEqual(outputs, {
        result: { type: 'string', value: 'a\nb\nc' },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testObjectConstruction({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeObjectConstructionRequest(), expectedBackend);
    try {
      const outputs = await runner.run({
        context: {
          suffix: { type: 'string', value: 'ctx' },
        },
        inputs: {
          count: { type: 'number', value: 3 },
          input: { type: 'string', value: 'Ada "Lovelace"' },
          meta: { type: 'object', value: { role: 'builder' } },
        },
      });

      assert.deepEqual(outputs, {
        result: {
          type: 'object',
          value: {
            count: 3,
            label: 'Name Ada "Lovelace"',
            literal: '{{ignored}}',
            meta: { role: 'builder' },
            metaText: '{"role":"builder"}',
            name: 'Ada "Lovelace"',
            suffix: 'ctx',
          },
        },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testObjectArrayConstruction({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeObjectArrayConstructionRequest(), expectedBackend);
    try {
      const outputs = await runner.run({
        inputs: {
          input: { type: 'string', value: 'Ada' },
        },
      });

      assert.deepEqual(outputs, {
        result: {
          type: 'object[]',
          value: [{ name: 'Ada' }, { name: 'static' }],
        },
      });
    } finally {
      runner.dispose?.();
    }
  });
}

async function testCoalesceFanIn({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const skippedRunner = await createSupportedRunner(
      makeCoalesceRequest({ ignoreNull: true, ignoreUndefined: true }),
      expectedBackend,
    );
    try {
      assert.deepEqual(
        await skippedRunner.run({
          inputs: {
            conditional: { type: 'boolean', value: false },
            first: { type: 'any', value: null },
            second: { type: 'any', value: undefined },
            third: { type: 'string', value: 'winner' },
          },
        }),
        {
          result: { type: 'string', value: 'winner' },
        },
      );
    } finally {
      skippedRunner.dispose?.();
    }
  });
}

async function testDestructureObjectPaths({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeDestructureRequest(), expectedBackend);
    try {
      assert.deepEqual(
        await runner.run({
          inputs: {
            object: {
              type: 'object',
              value: {
                first: 'alpha',
                items: ['zero', 'one'],
                nested: { second: 42 },
              },
            },
          },
        }),
        {
          first: { type: 'any', value: 'alpha' },
          indexed: { type: 'any', value: 'one' },
          second: { type: 'any', value: 42 },
        },
      );
    } finally {
      runner.dispose?.();
    }
  });
}

async function testExtractObjectPath({ backend, expectedBackend }) {
  await withBackend(backend, async () => {
    const runner = await createSupportedRunner(makeExtractObjectPathRequest(), expectedBackend);
    try {
      assert.deepEqual(
        await runner.run({
          inputs: {
            object: {
              type: 'object',
              value: {
                meta: { role: 'builder' },
                name: 'Ada',
              },
            },
          },
        }),
        {
          allMatches: { type: 'any[]', value: ['builder'] },
          result: { type: 'any', value: 'builder' },
        },
      );
    } finally {
      runner.dispose?.();
    }
  });
}

async function testCreateRejectionReasons({ backend }) {
  await withBackend(backend, async () => {
    const duplicateNodeResult = await createNativeGraphRunner(makeDuplicateNodeRequest());
    assert.deepEqual(duplicateNodeResult, {
      reason: 'duplicate-node:main:duplicate',
      supported: false,
    });

    const staleConnectionResult = await createNativeGraphRunner(makeStaleConnectionRequest());
    assert.deepEqual(staleConnectionResult, {
      reason: 'stale-connection:main',
      supported: false,
    });

    const invalidDestructureResult = await createNativeGraphRunner(
      makeInvalidDestructurePathRequest('$.items[9007199254740992]'),
    );
    assert.deepEqual(invalidDestructureResult, {
      reason: 'invalid-node:main:destructure:destructure',
      supported: false,
    });

    const invalidExtractObjectPathResult = await createNativeGraphRunner(
      makeInvalidExtractObjectPathRequest('$.items[*]'),
    );
    assert.deepEqual(invalidExtractObjectPathResult, {
      reason: 'invalid-node:main:extractObjectPath:extract',
      supported: false,
    });
  });
}

async function createSupportedRunner(request, expectedBackend) {
  const createResult = await createNativeGraphRunner(request);
  assert.equal(createResult.supported, true, createResult.reason);
  assert.equal(createResult.backend, expectedBackend);
  return createResult.runner;
}

async function withBackend(backend, callback) {
  const previousBackend = process.env.RIVET_NATIVE_RUNTIME_BACKEND;
  process.env.RIVET_NATIVE_RUNTIME_BACKEND = backend;

  try {
    await callback();
  } finally {
    if (previousBackend == null) {
      delete process.env.RIVET_NATIVE_RUNTIME_BACKEND;
    } else {
      process.env.RIVET_NATIVE_RUNTIME_BACKEND = previousBackend;
    }
  }
}

function makeContextInterpolationRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'string',
            id: 'graph-input',
            inputId: 'input',
            type: 'graphInput',
          },
          {
            id: 'text',
            normalizeLineEndings: true,
            template: '{{input}} {{@context.suffix | uppercase}}',
            type: 'text',
          },
          {
            dataType: 'string',
            id: 'graph-output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('graph-input', 'data', 'text', 'input'),
          connect('text', 'output', 'graph-output', 'value'),
        ],
      },
    ],
  };
}

function makeRepeatedSubgraphFanInRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'string',
            id: 'main-input',
            inputId: 'input',
            type: 'graphInput',
          },
          {
            graphId: 'child',
            id: 'left-subgraph',
            type: 'subGraph',
          },
          {
            graphId: 'child',
            id: 'right-subgraph',
            type: 'subGraph',
          },
          {
            flatten: true,
            id: 'join',
            joinString: '',
            type: 'join',
          },
          {
            dataType: 'string',
            id: 'main-output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('main-input', 'data', 'left-subgraph', 'input'),
          connect('main-input', 'data', 'right-subgraph', 'input'),
          connect('left-subgraph', 'result', 'join', 'input1'),
          connect('right-subgraph', 'result', 'join', 'input2'),
          connect('join', 'output', 'main-output', 'value'),
        ],
      },
      makeChildTextGraph(),
    ],
  };
}

function makeDefaultInputRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'number',
            defaultValue: 7,
            id: 'count-input',
            inputId: 'count',
            type: 'graphInput',
          },
          {
            dataType: 'boolean',
            defaultValue: true,
            id: 'flag-input',
            inputId: 'flag',
            type: 'graphInput',
          },
          {
            id: 'text',
            normalizeLineEndings: true,
            template: '{{count}} {{flag}}',
            type: 'text',
          },
          {
            dataType: 'string',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('count-input', 'data', 'text', 'count'),
          connect('flag-input', 'data', 'text', 'flag'),
          connect('text', 'output', 'output', 'value'),
        ],
      },
    ],
  };
}

function makeDefaultInputPortRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            id: 'dynamic-default',
            normalizeLineEndings: true,
            template: 'dynamic',
            type: 'text',
          },
          {
            dataType: 'string',
            defaultValue: 'static',
            id: 'input',
            inputId: 'input',
            type: 'graphInput',
            useDefaultValueInput: true,
          },
          {
            dataType: 'string',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('dynamic-default', 'output', 'input', 'default'),
          connect('input', 'data', 'output', 'value'),
        ],
      },
    ],
  };
}

function makeUnconnectedDefaultInputPortRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'string',
            defaultValue: 'static',
            id: 'input',
            inputId: 'input',
            type: 'graphInput',
            useDefaultValueInput: true,
          },
          {
            dataType: 'string',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [connect('input', 'data', 'output', 'value')],
      },
    ],
  };
}

function makeUnconnectedBooleanDefaultInputPortRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'boolean',
            defaultValue: true,
            id: 'input',
            inputId: 'input',
            type: 'graphInput',
            useDefaultValueInput: true,
          },
          {
            dataType: 'boolean',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [connect('input', 'data', 'output', 'value')],
      },
    ],
  };
}

function makeJoinArrayFanInRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'any',
            id: 'items-input',
            inputId: 'items',
            type: 'graphInput',
          },
          {
            flatten: true,
            id: 'join',
            joinString: '\\n',
            type: 'join',
          },
          {
            dataType: 'string',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [connect('items-input', 'data', 'join', 'input1'), connect('join', 'output', 'output', 'value')],
      },
    ],
  };
}

function makeObjectDefaultInputRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'object',
            id: 'object-input',
            inputId: 'object',
            type: 'graphInput',
          },
          {
            dataType: 'object',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [connect('object-input', 'data', 'output', 'value')],
      },
    ],
  };
}

function makeObjectConstructionRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'string',
            id: 'input',
            inputId: 'input',
            type: 'graphInput',
          },
          {
            dataType: 'object',
            id: 'meta',
            inputId: 'meta',
            type: 'graphInput',
          },
          {
            dataType: 'number',
            id: 'count',
            inputId: 'count',
            type: 'graphInput',
          },
          {
            id: 'object',
            jsonTemplate:
              '{"name":"{{input}}","label":"Name {{input}}","meta":{{meta}},"metaText":"{{meta}}","count":{{count}},"suffix":"{{@context.suffix}}","literal":"{{{ignored}}}"}',
            type: 'object',
          },
          {
            dataType: 'object',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('input', 'data', 'object', 'input'),
          connect('meta', 'data', 'object', 'meta'),
          connect('count', 'data', 'object', 'count'),
          connect('object', 'output', 'output', 'value'),
        ],
      },
    ],
  };
}

function makeObjectArrayConstructionRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'string',
            id: 'input',
            inputId: 'input',
            type: 'graphInput',
          },
          {
            id: 'object-array',
            jsonTemplate: '[{"name":"{{input}}"},{"name":"static"}]',
            type: 'object',
          },
          {
            dataType: 'object[]',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('input', 'data', 'object-array', 'input'),
          connect('object-array', 'output', 'output', 'value'),
        ],
      },
    ],
  };
}

function makeDuplicateNodeRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            id: 'duplicate',
            normalizeLineEndings: true,
            template: '',
            type: 'text',
          },
          {
            id: 'duplicate',
            normalizeLineEndings: true,
            template: '',
            type: 'text',
          },
        ],
        connections: [],
      },
    ],
  };
}

function makeCoalesceRequest({ ignoreNull, ignoreUndefined }) {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'boolean',
            id: 'conditional-input',
            inputId: 'conditional',
            type: 'graphInput',
          },
          {
            dataType: 'any',
            id: 'first-input',
            inputId: 'first',
            type: 'graphInput',
          },
          {
            dataType: 'any',
            id: 'second-input',
            inputId: 'second',
            type: 'graphInput',
          },
          {
            dataType: 'string',
            id: 'third-input',
            inputId: 'third',
            type: 'graphInput',
          },
          {
            id: 'coalesce',
            ignoreNull,
            ignoreUndefined,
            type: 'coalesce',
          },
          {
            dataType: 'any',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('conditional-input', 'data', 'coalesce', 'conditional'),
          connect('first-input', 'data', 'coalesce', 'input1'),
          connect('second-input', 'data', 'coalesce', 'input2'),
          connect('third-input', 'data', 'coalesce', 'input3'),
          connect('coalesce', 'output', 'output', 'value'),
        ],
      },
    ],
  };
}

function makeDestructureRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'object',
            id: 'object-input',
            inputId: 'object',
            type: 'graphInput',
          },
          {
            id: 'destructure',
            paths: [
              { outputId: 'first-output', path: '$.first' },
              { outputId: 'second-output', path: '$.nested.second' },
              { outputId: 'indexed-output', path: '$.items[1]' },
            ],
            type: 'destructure',
          },
          {
            dataType: 'any',
            id: 'first',
            outputId: 'first',
            type: 'graphOutput',
          },
          {
            dataType: 'any',
            id: 'second',
            outputId: 'second',
            type: 'graphOutput',
          },
          {
            dataType: 'any',
            id: 'indexed',
            outputId: 'indexed',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('object-input', 'data', 'destructure', 'object'),
          connect('destructure', 'first-output', 'first', 'value'),
          connect('destructure', 'second-output', 'second', 'value'),
          connect('destructure', 'indexed-output', 'indexed', 'value'),
        ],
      },
    ],
  };
}

function makeExtractObjectPathRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'object',
            id: 'object-input',
            inputId: 'object',
            type: 'graphInput',
          },
          {
            id: 'extract',
            path: '$.meta.role',
            type: 'extractObjectPath',
          },
          {
            dataType: 'any',
            id: 'match-output',
            outputId: 'result',
            type: 'graphOutput',
          },
          {
            dataType: 'any',
            id: 'all-matches-output',
            outputId: 'allMatches',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('object-input', 'data', 'extract', 'object'),
          connect('extract', 'match', 'match-output', 'value'),
          connect('extract', 'all_matches', 'all-matches-output', 'value'),
        ],
      },
    ],
  };
}

function makeInvalidDestructurePathRequest(path) {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'object',
            id: 'object-input',
            inputId: 'object',
            type: 'graphInput',
          },
          {
            id: 'destructure',
            paths: [{ outputId: 'match', path }],
            type: 'destructure',
          },
          {
            dataType: 'any',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('object-input', 'data', 'destructure', 'object'),
          connect('destructure', 'match', 'output', 'value'),
        ],
      },
    ],
  };
}

function makeInvalidExtractObjectPathRequest(path) {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            dataType: 'object',
            id: 'object-input',
            inputId: 'object',
            type: 'graphInput',
          },
          {
            id: 'extract',
            path,
            type: 'extractObjectPath',
          },
          {
            dataType: 'any',
            id: 'output',
            outputId: 'result',
            type: 'graphOutput',
          },
        ],
        connections: [
          connect('object-input', 'data', 'extract', 'object'),
          connect('extract', 'match', 'output', 'value'),
        ],
      },
    ],
  };
}

function makeStaleConnectionRequest() {
  return {
    graphId: 'main',
    graphs: [
      {
        graphId: 'main',
        nodes: [
          {
            id: 'text',
            normalizeLineEndings: true,
            template: '',
            type: 'text',
          },
        ],
        connections: [connect('missing-node', 'output', 'text', 'input')],
      },
    ],
  };
}

function makeChildTextGraph() {
  return {
    graphId: 'child',
    nodes: [
      {
        dataType: 'string',
        id: 'child-input',
        inputId: 'input',
        type: 'graphInput',
      },
      {
        id: 'child-text',
        normalizeLineEndings: true,
        template: '{{input}}-{{@context.suffix}}',
        type: 'text',
      },
      {
        dataType: 'string',
        id: 'child-output',
        outputId: 'result',
        type: 'graphOutput',
      },
    ],
    connections: [
      connect('child-input', 'data', 'child-text', 'input'),
      connect('child-text', 'output', 'child-output', 'value'),
    ],
  };
}

function connect(outputNodeId, outputId, inputNodeId, inputId) {
  return {
    inputId,
    inputNodeId,
    outputId,
    outputNodeId,
  };
}
