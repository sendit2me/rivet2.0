import { addWarning } from '../../utils/outputs.js';
import type { Outputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';

export function clampMaxTokensToModelLimit(
  output: Outputs,
  model: string,
  inputTokenCount: number,
  maxTokens: number,
  modelMaxTokens: number,
) {
  if (inputTokenCount >= modelMaxTokens) {
    throw new Error(
      `The model ${model} can only handle ${modelMaxTokens} tokens, but ${inputTokenCount} were provided in the prompts alone.`,
    );
  }

  if (inputTokenCount + maxTokens <= modelMaxTokens) {
    return maxTokens;
  }

  const message = `The model can only handle a maximum of ${
    modelMaxTokens
  } tokens, but the prompts and max tokens together exceed this limit. The max tokens has been reduced to ${
    modelMaxTokens - inputTokenCount
  }.`;
  addWarning(output, message);

  return Math.floor((modelMaxTokens - inputTokenCount) * 0.95);
}

export function setRequestAndResponseTokenOutputs(
  output: Outputs,
  requestTokens: number,
  responseTokens: number,
) {
  output['requestTokens' as PortId] = { type: 'number', value: requestTokens };
  output['responseTokens' as PortId] = { type: 'number', value: responseTokens };
}
