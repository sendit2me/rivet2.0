import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProcessId } from '@valerypopoff/rivet2-core';
import type { NodeRunDataWithRefs, ProcessDataForNode } from '../../state/dataFlow.js';
import {
  getNodeRunDurationEntries,
  getTotalNodeRunDurationMs,
  shouldShowNodeRunDurationMeta,
  shouldShowNodeRunDurationSummary,
} from './NodeRunDurationMeta.js';

function process(processId: string, data: NodeRunDataWithRefs): ProcessDataForNode {
  return {
    processId: processId as ProcessId,
    data,
  };
}

test('getNodeRunDurationEntries numbers visible finished runs and skips non-visible durations', () => {
  const entries = getNodeRunDurationEntries([
    process('first', { durationMs: 5, status: { type: 'ok' } }),
    process('running', { durationMs: 6, status: { type: 'running' } }),
    process('missing', { status: { type: 'ok' } }),
    process('invalid', { durationMs: Number.NaN, status: { type: 'ok' } }),
    process('not-ran', { durationMs: 8, status: { type: 'notRan', reason: 'skipped' } }),
    process('error', { durationMs: 12.5, status: { type: 'error', error: 'Failed' } }),
  ]);

  assert.deepEqual(entries, [
    { runIndex: 1, durationMs: 5 },
    { runIndex: 2, durationMs: 12.5 },
  ]);
});

test('getNodeRunDurationEntries expands split-run item durations before aggregate duration', () => {
  const entries = getNodeRunDurationEntries([
    process('split', {
      durationMs: 20,
      splitRunDurationMs: {
        0: 7,
        1: 9.5,
      },
      status: { type: 'ok' },
    }),
  ]);

  assert.deepEqual(entries, [
    { runIndex: 1, durationMs: 7 },
    { runIndex: 2, durationMs: 9.5 },
  ]);
  assert.equal(
    getTotalNodeRunDurationMs([
      process('split', { splitRunDurationMs: { 0: 7, 1: 9.5 }, status: { type: 'ok' } }),
    ]),
    16.5,
  );
});

test('getTotalNodeRunDurationMs sums visible completed run durations', () => {
  assert.equal(
    getTotalNodeRunDurationMs([
      process('first', { durationMs: 5, status: { type: 'ok' } }),
      process('second', { durationMs: 12.5, status: { type: 'ok' } }),
      process('running', { durationMs: 100, status: { type: 'running' } }),
    ]),
    17.5,
  );
  assert.equal(
    getTotalNodeRunDurationMs([process('running', { durationMs: 100, status: { type: 'running' } })]),
    undefined,
  );
});

test('duration metadata summary is shown only for repeated visible runs', () => {
  const singleRun = [process('first', { durationMs: 5, status: { type: 'ok' } })];
  const repeatedRuns = [
    process('first', { durationMs: 5, status: { type: 'ok' } }),
    process('second', { durationMs: 12, status: { type: 'ok' } }),
  ];
  const splitRun = [
    process('split', {
      durationMs: 20,
      splitRunDurationMs: { 0: 5, 1: 6 },
      status: { type: 'ok' },
    }),
  ];

  assert.equal(shouldShowNodeRunDurationSummary('text', repeatedRuns, false), false);
  assert.equal(shouldShowNodeRunDurationSummary('text', singleRun, true), false);
  assert.equal(shouldShowNodeRunDurationSummary('text', repeatedRuns, true), true);
  assert.equal(shouldShowNodeRunDurationSummary('text', splitRun, true), true);
  assert.equal(shouldShowNodeRunDurationSummary('subGraph', repeatedRuns, true), false);
});

test('single-run duration metadata still follows the existing visibility policy', () => {
  assert.equal(shouldShowNodeRunDurationMeta('text', { durationMs: 5, status: { type: 'ok' } }, false), false);
  assert.equal(shouldShowNodeRunDurationMeta('text', { durationMs: 5, status: { type: 'ok' } }, true), true);
  assert.equal(
    shouldShowNodeRunDurationMeta(
      'text',
      { durationMs: 20, splitRunDurationMs: { 0: 5, 1: 6 }, status: { type: 'ok' } },
      true,
    ),
    false,
  );
  assert.equal(shouldShowNodeRunDurationMeta('subGraph', { durationMs: 5, status: { type: 'ok' } }, true), false);
});
