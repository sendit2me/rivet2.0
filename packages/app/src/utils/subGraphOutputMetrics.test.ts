import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSubGraphCostMetricForCopy,
  formatSubGraphDurationMetricForCopy,
  getSubGraphCostMetric,
  getSubGraphDurationMetric,
} from './subGraphOutputMetrics.js';

test('getSubGraphDurationMetric keeps scalar duration behavior', () => {
  assert.deepEqual(getSubGraphDurationMetric({ type: 'number', value: 125 }), {
    kind: 'single',
    value: 125,
  });
  assert.deepEqual(getSubGraphDurationMetric({ type: 'number', value: 0 }), { kind: 'none' });
});

test('getSubGraphDurationMetric renders split duration arrays as total plus runs', () => {
  const metric = getSubGraphDurationMetric({ type: 'number[]', value: [125, 250] });

  assert.deepEqual(metric, {
    kind: 'split',
    totalValue: 375,
    runValues: [125, 250],
  });
  assert.equal(
    formatSubGraphDurationMetricForCopy(metric),
    ['Total duration: 375ms', 'Run 1: 125ms', 'Run 2: 250ms'].join('\n'),
  );
});

test('getSubGraphCostMetric renders split cost arrays as total plus runs', () => {
  const metric = getSubGraphCostMetric({ type: 'number[]', value: [0, 0.5, 0.25] });

  assert.deepEqual(metric, {
    kind: 'split',
    totalValue: 0.75,
    runValues: [0, 0.5, 0.25],
  });
  assert.equal(
    formatSubGraphCostMetricForCopy(metric),
    ['Total cost: $0.750', 'Run 1: $0.000', 'Run 2: $0.500', 'Run 3: $0.250'].join('\n'),
  );
  assert.deepEqual(getSubGraphCostMetric({ type: 'number[]', value: [0, 0] }), { kind: 'none' });
});
