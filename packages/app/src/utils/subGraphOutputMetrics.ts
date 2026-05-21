import { coerceTypeOptional, type DataValue } from '@valerypopoff/rivet2-core';

export type SubGraphNumberMetric =
  | {
      kind: 'none';
    }
  | {
      kind: 'single';
      value: number;
    }
  | {
      kind: 'split';
      totalValue: number;
      runValues: number[];
    };

export type SubGraphDurationMetric = SubGraphNumberMetric;
export type SubGraphCostMetric = SubGraphNumberMetric;

export function getSubGraphDurationMetric(value: DataValue | undefined): SubGraphDurationMetric {
  const durationMs = coerceTypeOptional(value, 'number');
  if (durationMs != null && durationMs > 0) {
    return {
      kind: 'single',
      value: durationMs,
    };
  }

  const runDurationsMs = value?.type === 'number[]' ? value.value.filter(isValidMetricValue) : [];
  if (runDurationsMs.length === 0) {
    return { kind: 'none' };
  }

  if (runDurationsMs.length === 1) {
    return {
      kind: 'single',
      value: runDurationsMs[0]!,
    };
  }

  return {
    kind: 'split',
    totalValue: runDurationsMs.reduce((sum, duration) => sum + duration, 0),
    runValues: runDurationsMs,
  };
}

export function getSubGraphCostMetric(value: DataValue | undefined): SubGraphCostMetric {
  const cost = coerceTypeOptional(value, 'number');
  if (cost != null && cost > 0) {
    return {
      kind: 'single',
      value: cost,
    };
  }

  const runCosts = value?.type === 'number[]' ? value.value.filter(isValidMetricValue) : [];
  if (runCosts.length === 0 || runCosts.every((runCost) => runCost <= 0)) {
    return { kind: 'none' };
  }

  if (runCosts.length === 1) {
    return {
      kind: 'single',
      value: runCosts[0]!,
    };
  }

  return {
    kind: 'split',
    totalValue: runCosts.reduce((sum, cost) => sum + cost, 0),
    runValues: runCosts,
  };
}

export function formatSubGraphDurationMs(durationMs: number): string {
  return `${Math.round(durationMs)}ms`;
}

export function formatSubGraphCost(cost: number): string {
  return `$${cost.toFixed(3)}`;
}

export function formatSubGraphDurationMetricForCopy(metric: SubGraphDurationMetric): string | undefined {
  return formatSubGraphNumberMetricForCopy(metric, {
    totalLabel: 'Total duration',
    runLabel: 'Run',
    formatValue: formatSubGraphDurationMs,
  });
}

export function formatSubGraphCostMetricForCopy(metric: SubGraphCostMetric): string | undefined {
  return formatSubGraphNumberMetricForCopy(metric, {
    totalLabel: 'Total cost',
    runLabel: 'Run',
    formatValue: formatSubGraphCost,
  });
}

function formatSubGraphNumberMetricForCopy(
  metric: SubGraphNumberMetric,
  options: {
    totalLabel: string;
    runLabel: string;
    formatValue(value: number): string;
  },
): string | undefined {
  if (metric.kind === 'none') {
    return undefined;
  }

  if (metric.kind === 'single') {
    return options.formatValue(metric.value);
  }

  return [
    `${options.totalLabel}: ${options.formatValue(metric.totalValue)}`,
    ...metric.runValues.map((value, index) => `${options.runLabel} ${index + 1}: ${options.formatValue(value)}`),
  ].join('\n');
}

function isValidMetricValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
