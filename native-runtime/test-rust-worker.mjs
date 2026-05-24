import assert from 'node:assert/strict';

import { createNativeGraphRunner } from './index.js';

const previousBackend = process.env.RIVET_NATIVE_RUNTIME_BACKEND;
process.env.RIVET_NATIVE_RUNTIME_BACKEND = 'rust';

try {
  const createResult = await createNativeGraphRunner({
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
          {
            inputId: 'input',
            inputNodeId: 'text',
            outputId: 'data',
            outputNodeId: 'graph-input',
          },
          {
            inputId: 'value',
            inputNodeId: 'graph-output',
            outputId: 'output',
            outputNodeId: 'text',
          },
        ],
      },
    ],
  });

  assert.equal(createResult.supported, true, createResult.reason);
  assert.equal(createResult.backend, 'rust-worker');

  const outputs = await createResult.runner.run({
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

  createResult.runner.dispose?.();
} finally {
  if (previousBackend == null) {
    delete process.env.RIVET_NATIVE_RUNTIME_BACKEND;
  } else {
    process.env.RIVET_NATIVE_RUNTIME_BACKEND = previousBackend;
  }
}
