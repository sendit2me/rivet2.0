import type { ScalarOrArrayDataValue } from './DataValue.js';
import type { GraphOutputs, Outputs } from './GraphProcessor.js';
import type { ChartNode, PortId } from './NodeBase.js';

export type FrozenSetGlobalEffect = {
  variableId: string;
  value: ScalarOrArrayDataValue;
};

export function ensureGraphCostOutput(graphOutputs: GraphOutputs, totalCost: number): void {
  const costPort = 'cost' as PortId;

  if (graphOutputs[costPort] == null) {
    graphOutputs[costPort] = {
      type: 'number',
      value: totalCost,
    };
  }
}

export function applyFrozenGraphBoundaryEffects(
  graphOutputs: GraphOutputs,
  node: ChartNode,
  outputValues: Outputs,
): FrozenSetGlobalEffect | undefined {
  if (node.type === 'graphOutput') {
    const outputId = (node.data as { id?: string } | undefined)?.id;
    const valueOutput = outputValues['valueOutput' as PortId];

    if (outputId && valueOutput) {
      graphOutputs[outputId] = valueOutput;
    }

    return undefined;
  }

  if (node.type !== 'setGlobal') {
    return undefined;
  }

  const savedValue = outputValues['saved-value' as PortId];
  const variableId = outputValues['variable_id_out' as PortId];
  const variableIdValue = variableId?.type === 'string' ? variableId.value : undefined;

  if (!variableIdValue || !savedValue) {
    return undefined;
  }

  return {
    variableId: variableIdValue,
    value: savedValue as ScalarOrArrayDataValue,
  };
}
