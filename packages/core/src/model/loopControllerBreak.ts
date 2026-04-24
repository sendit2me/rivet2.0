import type { DataValue } from './DataValue.js';

export const LOOP_NOT_BROKEN_SENTINEL = 'loop-not-broken';

export function didLoopControllerBreak(breakValue: DataValue | undefined): boolean {
  return !(breakValue?.type === 'control-flow-excluded' && breakValue.value === LOOP_NOT_BROKEN_SENTINEL);
}
