import test from 'node:test';
import assert from 'node:assert/strict';
import { WarningsPort, type PortId, type ProcessId } from '@valerypopoff/rivet2-core';
import type { ProcessDataForNode } from '../../state/dataFlow.js';
import {
  getSelectedVisibleOutputProcess,
  nodeRunDataHasVisibleOutput,
  shouldUseCodeErrorOutput,
  shouldUseCustomNodeErrorOutput,
} from './nodeOutputVisibility.js';

const process = (processId: string, data: ProcessDataForNode['data']): ProcessDataForNode => ({
  processId: processId as ProcessId,
  data,
});

test('nodeRunDataHasVisibleOutput treats running without output as not visible', () => {
  assert.equal(nodeRunDataHasVisibleOutput('text', { status: { type: 'running' } }), false);
});

test('nodeRunDataHasVisibleOutput ignores absent port wrappers', () => {
  assert.equal(
    nodeRunDataHasVisibleOutput('text', {
      outputData: {
        ['output' as PortId]: undefined,
      },
      status: { type: 'ok' },
    } as never),
    false,
  );

  assert.equal(
    nodeRunDataHasVisibleOutput('text', {
      splitOutputData: {
        0: {
          ['output' as PortId]: undefined,
        },
      },
      status: { type: 'ok' },
    } as never),
    false,
  );
});

test('nodeRunDataHasVisibleOutput ignores hidden internal output ports but keeps warnings visible', () => {
  assert.equal(
    nodeRunDataHasVisibleOutput('text', {
      outputData: {
        ['__internalPort_private' as PortId]: {
          type: 'string',
          storage: 'inline',
          value: 'hidden',
        },
      },
      status: { type: 'ok' },
    } as never),
    false,
  );

  assert.equal(
    nodeRunDataHasVisibleOutput('text', {
      splitOutputData: {
        0: {
          [WarningsPort]: {
            type: 'string[]',
            storage: 'inline',
            value: ['warning'],
          },
        },
      },
      status: { type: 'ok' },
    } as never),
    true,
  );
});

test('nodeRunDataHasVisibleOutput treats outputs and errors as visible', () => {
  assert.equal(
    nodeRunDataHasVisibleOutput('text', {
      outputData: {
        ['output' as PortId]: {
          type: 'string',
          storage: 'inline',
          value: 'hello',
        },
      },
      status: { type: 'ok' },
    }),
    true,
  );
  assert.equal(nodeRunDataHasVisibleOutput('text', { status: { type: 'error', error: 'Failed' } }), true);
  assert.equal(nodeRunDataHasVisibleOutput('code', { status: { type: 'error', error: 'SyntaxError' } }), true);
  assert.equal(nodeRunDataHasVisibleOutput('codeNew', { status: { type: 'error', error: 'SyntaxError' } }), true);
});

test('Code errors keep the custom output path while Code legacy uses the code-error path', () => {
  const data = { status: { type: 'error', error: 'SyntaxError' } } as const;

  assert.equal(shouldUseCodeErrorOutput('code', data), true);
  assert.equal(shouldUseCustomNodeErrorOutput('code', data), false);
  assert.equal(shouldUseCodeErrorOutput('codeNew', data), false);
  assert.equal(shouldUseCustomNodeErrorOutput('codeNew', data), true);
});

test('getSelectedVisibleOutputProcess only reports the selected process when it has visible output', () => {
  const oldOutput = process('old', {
    outputData: {
      ['output' as PortId]: {
        type: 'string',
        storage: 'inline',
        value: 'old',
      },
    },
    status: { type: 'ok' },
  });
  const runningOutput = process('running', { status: { type: 'running' } });

  assert.equal(getSelectedVisibleOutputProcess('text', [oldOutput, runningOutput], 'latest'), undefined);
  assert.equal(getSelectedVisibleOutputProcess('text', [oldOutput, runningOutput], 0), oldOutput);
});

test('getSelectedVisibleOutputProcess ignores selected processes with only absent wrappers', () => {
  const emptyOutput = process('empty', {
    outputData: {
      ['output' as PortId]: undefined,
    },
    status: { type: 'ok' },
  } as never);

  assert.equal(getSelectedVisibleOutputProcess('text', [emptyOutput], 'latest'), undefined);
});
