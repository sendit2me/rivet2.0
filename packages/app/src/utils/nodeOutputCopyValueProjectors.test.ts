import assert from 'node:assert/strict';
import test from 'node:test';
import { WarningsPort, type DataValue } from '@rivet2/rivet-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs } from '../state/dataFlow.js';
import { projectDisplayedOutputs } from './executionDataCopyValue.js';
import {
  getChatNodeCopyValueData,
  getLoopControllerNodeCopyValueData,
  getSubGraphNodeCopyValueData,
  getUserInputNodeCopyValueData,
} from './nodeOutputCopyValueProjectors.js';

function createDataRefStore(initialValues?: Record<string, DataValue>): DataRefReader {
  const values = new Map<string, DataValue>(Object.entries(initialValues ?? {}));
  return {
    get: (key) => values.get(key),
  };
}

function inlineStored<T extends DataValue['type']>(type: T, value: Extract<DataValue, { type: T }>['value']) {
  return {
    type,
    storage: 'inline' as const,
    value,
  };
}

test('chat copy-value projector returns plain response text when only the response is visible', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        response: inlineStored('string', 'Hello world!'),
        ['in-messages']: inlineStored('chat-message[]', []),
        ['all-messages']: inlineStored('chat-message[]', []),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getChatNodeCopyValueData,
    },
  );

  assert.equal(projected, 'Hello world!');
});

test('chat copy-value projector includes only the visible response, function call, and visible meta fields', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        response: inlineStored('string', 'Hello world!'),
        ['function-call']: inlineStored('object', {
          name: 'lookup',
          arguments: {
            key: 'value',
          },
        }),
        requestTokens: inlineStored('number', 10),
        responseTokens: inlineStored('number', 12),
        cost: inlineStored('number', 0.123),
        duration: inlineStored('number', 250),
        ['in-messages']: inlineStored('chat-message[]', [
          {
            type: 'user',
            message: 'ignored',
          },
        ]),
        usage: inlineStored('object', {
          hidden: true,
        }),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getChatNodeCopyValueData,
    },
  );

  assert.deepEqual(projected, {
    response: 'Hello world!',
    'function-call': {
      name: 'lookup',
      arguments: {
        key: 'value',
      },
    },
    requestTokens: 10,
    responseTokens: 12,
    cost: 0.123,
    duration: 250,
  });
});

test('chat copy-value projector does not include duration when the chat UI would hide the meta block', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        response: inlineStored('string', 'Hello world!'),
        duration: inlineStored('number', 250),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getChatNodeCopyValueData,
    },
  );

  assert.equal(projected, 'Hello world!');
});

test('chat copy-value projector includes duration when a visible meta carrier exists even if the carrier value itself is hidden', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        response: inlineStored('string', 'Hello world!'),
        requestTokens: inlineStored('number', 0),
        duration: inlineStored('number', 250),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getChatNodeCopyValueData,
    },
  );

  assert.deepEqual(projected, {
    response: 'Hello world!',
    duration: 250,
  });
});

test('user input copy-value projector only copies questionsAndAnswers', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        output: inlineStored('string[]', ['answer']),
        questionsAndAnswers: inlineStored('string[]', ['What?\nanswer']),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getUserInputNodeCopyValueData,
    },
  );

  assert.deepEqual(projected, ['What?\nanswer']);
});

test('user input copy-value projector returns nothing when the output preview is empty', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        questionsAndAnswers: inlineStored('control-flow-excluded', undefined),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getUserInputNodeCopyValueData,
    },
  );

  assert.equal(projected, undefined);
});

test('loop controller copy-value projector excludes break and iteration and includes continue plus visible outputs', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        break: inlineStored('any[]', ['done']),
        iteration: inlineStored('number', 2),
        output1: inlineStored('string', 'next'),
        output2: inlineStored('control-flow-excluded', undefined),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getLoopControllerNodeCopyValueData,
    },
  );

  assert.deepEqual(projected, {
    continue: false,
    output1: 'next',
    output2: 'Not ran',
  });
});

test('subgraph copy-value projector includes visible meta and visible outputs only', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        cost: inlineStored('number', 0.5),
        duration: inlineStored('number', 125),
        result: inlineStored('object', {
          ok: true,
        }),
        [WarningsPort]: inlineStored('string[]', ['warning']),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getSubGraphNodeCopyValueData,
    },
  );

  assert.deepEqual(projected, {
    cost: 0.5,
    duration: 125,
    result: {
      ok: true,
    },
  });
});

test('subgraph copy-value projector does not include array meta that the UI does not render', () => {
  const projected = projectDisplayedOutputs(
    {
      outputData: {
        cost: inlineStored('number[]', [0.5, 0.25]),
        duration: inlineStored('number[]', [125, 250]),
        result: inlineStored('string', 'ok'),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
    {
      getCopyValueData: getSubGraphNodeCopyValueData,
    },
  );

  assert.equal(projected, 'ok');
});
