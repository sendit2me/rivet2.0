import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { type NodeId, type StringArrayDataValue } from '@ironclad/rivet-core';
import { clearUserInputSubmitHandler, setUserInputSubmitHandler, submitUserInputAnswers } from './userInputActions';

describe('userInputActions', () => {
  it('routes answers through the current submit handler', () => {
    const calls: unknown[] = [];

    setUserInputSubmitHandler((nodeId, answers) => {
      calls.push({ nodeId, answers });
    });

    submitUserInputAnswers('node-1' as NodeId, { type: 'string[]', value: ['answer'] } as StringArrayDataValue);

    assert.deepEqual(calls, [{ nodeId: 'node-1', answers: { type: 'string[]', value: ['answer'] } }]);
  });

  it('clears the active submit handler', () => {
    clearUserInputSubmitHandler();
    assert.doesNotThrow(() =>
      submitUserInputAnswers('node-1' as NodeId, { type: 'string[]', value: [] } as StringArrayDataValue),
    );
  });
});
