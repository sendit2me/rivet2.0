import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { didLoopControllerBreak, LOOP_NOT_BROKEN_SENTINEL } from '../../src/model/loopControllerBreak.js';

void describe('didLoopControllerBreak', () => {
  void it('continues the loop only for the loop-not-broken sentinel', () => {
    assert.equal(
      didLoopControllerBreak({
        type: 'control-flow-excluded',
        value: LOOP_NOT_BROKEN_SENTINEL,
      }),
      false,
    );
  });

  void it('treats missing break output as a break', () => {
    assert.equal(didLoopControllerBreak(undefined), true);
  });

  void it('treats ordinary break output as a break', () => {
    assert.equal(
      didLoopControllerBreak({
        type: 'any[]',
        value: [1, 2, 3],
      }),
      true,
    );
  });

  void it('treats other control-flow-excluded values as a break', () => {
    assert.equal(
      didLoopControllerBreak({
        type: 'control-flow-excluded',
        value: undefined,
      }),
      true,
    );
  });
});
