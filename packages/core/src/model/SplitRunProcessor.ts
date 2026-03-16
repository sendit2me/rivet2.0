import { max, range } from 'lodash-es';
import {
  type DataValue,
  type ArrayDataValue,
  type AnyDataValue,
  isArrayDataValue,
  arrayizeDataValue,
} from './DataValue.js';
import { type ChartNode, type PortId } from './NodeBase.js';
import type { ProcessId } from './ProcessContext.js';
import type { Inputs, Outputs } from './GraphProcessor.js';
import { getError } from '../utils/errors.js';
import { entries, fromEntries, values } from '../utils/typeSafety.js';

export type SplitRunDeps = {
  getInputValues(node: ChartNode): Inputs;
  isExcludedDueToControlFlow(node: ChartNode, inputValues: Inputs, processId: ProcessId): boolean;
  processNodeWithInputData(
    node: ChartNode,
    inputs: Inputs,
    index: number,
    processId: ProcessId,
    partialOutput?: (node: ChartNode, partialOutputs: Outputs, index: number) => void,
  ): Promise<Outputs>;
  accumulateCost(output: Outputs): void;
  setNodeResults(nodeId: ChartNode['id'], outputs: Outputs): void;
  markNodeVisited(nodeId: ChartNode['id']): void;
  nodeErrored(node: ChartNode, error: unknown, processId: ProcessId): void;
  isAborted(): boolean;
  emit(event: 'nodeStart', data: { node: ChartNode; inputs: Inputs; processId: ProcessId }): void;
  emit(event: 'nodeFinish', data: { node: ChartNode; outputs: Outputs; processId: ProcessId }): void;
  emit(
    event: 'partialOutput',
    data: { node: ChartNode; outputs: Outputs; index: number; processId: ProcessId },
  ): void;
};

type SplitResult =
  | { type: 'output'; output: Outputs; error?: Error }
  | { type: 'error'; error: Error; output?: Outputs };

export async function processSplitRunNode(
  node: ChartNode,
  processId: ProcessId,
  deps: SplitRunDeps,
): Promise<void> {
  const inputValues = deps.getInputValues(node);

  if (deps.isExcludedDueToControlFlow(node, inputValues, processId)) {
    return;
  }

  const splittingAmount = Math.min(
    max(values(inputValues).map((value) => (Array.isArray(value?.value) ? value?.value.length : 1))) ?? 1,
    node.splitRunMax ?? 10,
  );

  deps.emit('nodeStart', { node, inputs: inputValues, processId });

  try {
    let results: SplitResult[];

    if (node.isSplitSequential) {
      results = await runSequential(node, inputValues, splittingAmount, processId, deps);
    } else {
      results = await runParallel(node, inputValues, splittingAmount, processId, deps);
    }

    const errors = results.filter((r) => r.type === 'error').map((r) => r.error!);
    if (errors.length === 1) {
      throw errors[0]!;
    } else if (errors.length > 0) {
      throw new AggregateError(errors);
    }

    const aggregateResults = aggregateOutputs(results);

    deps.setNodeResults(node.id, aggregateResults);
    deps.markNodeVisited(node.id);
    deps.emit('nodeFinish', { node, outputs: aggregateResults, processId });
  } catch (error) {
    deps.nodeErrored(node, error, processId);
  }
}

async function runSequential(
  node: ChartNode,
  inputValues: Inputs,
  splittingAmount: number,
  processId: ProcessId,
  deps: SplitRunDeps,
): Promise<SplitResult[]> {
  const results: SplitResult[] = [];

  for (let i = 0; i < splittingAmount; i++) {
    if (deps.isAborted()) {
      throw new Error('Processing aborted');
    }

    const inputs = splitInputsAtIndex(inputValues, i);

    try {
      const output = await deps.processNodeWithInputData(node, inputs, i, processId, (n, partialOutputs, index) => {
        deps.emit('partialOutput', { node: n, outputs: partialOutputs, index, processId });
      });

      deps.accumulateCost(output);
      results.push({ type: 'output', output });
    } catch (error) {
      results.push({ type: 'error', error: getError(error) });
    }
  }

  return results;
}

async function runParallel(
  node: ChartNode,
  inputValues: Inputs,
  splittingAmount: number,
  processId: ProcessId,
  deps: SplitRunDeps,
): Promise<SplitResult[]> {
  return Promise.all(
    range(0, splittingAmount).map(async (i) => {
      const inputs = splitInputsAtIndex(inputValues, i);

      try {
        const output = await deps.processNodeWithInputData(node, inputs, i, processId, (n, partialOutputs, index) => {
          deps.emit('partialOutput', { node: n, outputs: partialOutputs, index, processId });
        });

        deps.accumulateCost(output);
        return { type: 'output' as const, output };
      } catch (error) {
        return { type: 'error' as const, error: getError(error) };
      }
    }),
  );
}

function splitInputsAtIndex(inputValues: Inputs, index: number): Inputs {
  return fromEntries(
    entries(inputValues).map(([port, value]) => [
      port as PortId,
      isArrayDataValue(value) ? arrayizeDataValue(value)[index] ?? undefined : value,
    ]),
  ) as Inputs;
}

function aggregateOutputs(results: SplitResult[]): Outputs {
  return results.reduce((acc, result) => {
    for (const [portId, value] of entries(result.output!)) {
      acc[portId as PortId] ??= { type: (value?.type + '[]') as DataValue['type'], value: [] } as DataValue;
      (acc[portId as PortId] as ArrayDataValue<AnyDataValue>).value.push(value?.value);
    }
    return acc;
  }, {} as Outputs);
}
