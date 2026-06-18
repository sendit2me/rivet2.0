import { coerceType, coerceTypeOptional } from '../../utils/coerceType.js';
import { getInputOrData } from '../../utils/inputs.js';
import type { ChatCompletionOptions, ChatCompletionTool } from '../../utils/openai.js';
import type { Inputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import type { ChatNodeData } from '../nodes/ChatNodeBase.js';
import { deepMerge } from '../../utils/deepMerge.js';

/**
 * Connection/transport keys in the assembled request `options` that the node always controls;
 * `extraBody` (Feature 004) contributes **body params only** and may never set these. `model` /
 * `messages` / `endpoint` are re-asserted from the node; `stream` is dropped (it isn't a real
 * `options` key — streaming is chosen by which request function runs). `apiKey` / `organization` /
 * `headers` are passed as separate `auth`/`headers` args, not in `options`, so they're already
 * out of reach.
 */
const EXTRA_BODY_PROTECTED_KEYS = ['model', 'messages', 'endpoint'] as const;

/**
 * Apply the merged `extraBody` to the assembled request options as the final body step (SPEC 004
 * §3, D2). Deep-merges `extraBody` over `options` so it wins over managed optional params
 * (temperature, response_format, sampling, additionalParameters, …), then re-asserts the
 * connection/transport essentials from the node so `extraBody` can never redirect or break the call.
 *
 * Pure. Returns `options` **unchanged (same reference)** when `extraBody` is empty — the
 * byte-identical rail.
 */
export function applyExtraBody<T extends object>(options: T, extraBody: Record<string, unknown> | undefined): T {
  if (!extraBody || Object.keys(extraBody).length === 0) {
    return options;
  }
  const source = options as Record<string, unknown>;
  const merged = deepMerge(source, extraBody);
  for (const key of EXTRA_BODY_PROTECTED_KEYS) {
    if (key in source) {
      merged[key] = source[key];
    } else {
      delete merged[key];
    }
  }
  delete merged['stream'];
  return merged as T;
}

export function resolveChatToolChoice(data: ChatNodeData, inputs: Inputs): ChatCompletionOptions['tool_choice'] {
  const toolChoiceMode = getInputOrData(data, inputs, 'toolChoice', 'string') as 'none' | 'auto' | 'function';

  if (!toolChoiceMode || !data.enableFunctionUse) {
    return undefined;
  }

  if (toolChoiceMode === 'function') {
    return {
      type: 'function',
      function: {
        name: getInputOrData(data, inputs, 'toolChoiceFunction', 'string'),
      },
    };
  }

  return toolChoiceMode;
}

export function resolveChatResponseSchema(inputs: Inputs) {
  const responseSchemaInput = inputs['responseSchema' as PortId];

  if (responseSchemaInput?.type === 'gpt-function') {
    return responseSchemaInput.value.parameters;
  }

  if (responseSchemaInput != null) {
    return coerceType(responseSchemaInput, 'object');
  }

  return undefined;
}

export function resolveOpenAIResponseFormat(data: ChatNodeData, inputs: Inputs) {
  const responseFormat = getInputOrData(data, inputs, 'responseFormat') as 'text' | 'json' | 'json_schema' | '';

  if (!responseFormat?.trim()) {
    return undefined;
  }

  if (responseFormat === 'json') {
    return { type: 'json_object' } as const;
  }

  if (responseFormat === 'json_schema') {
    return {
      type: 'json_schema' as const,
      json_schema: {
        name: getInputOrData(data, inputs, 'responseSchemaName', 'string') || 'response_schema',
        strict: true,
        schema: resolveChatResponseSchema(inputs) ?? {},
      },
    };
  }

  return {
    type: 'text',
  } as const;
}

export function resolveAdditionalHeaders(data: ChatNodeData, inputs: Inputs) {
  const headersFromData = (data.headers ?? []).reduce(
    (acc, header) => {
      acc[header.key] = header.value;
      return acc;
    },
    {} as Record<string, string>,
  );

  return data.useHeadersInput
    ? (coerceTypeOptional(inputs['headers' as PortId], 'object') as Record<string, string> | undefined) ?? headersFromData
    : headersFromData;
}

export function resolveAdditionalParameters(data: ChatNodeData, inputs: Inputs) {
  const additionalParametersFromData = (data.additionalParameters ?? []).reduce(
    (acc, param) => {
      acc[param.key] = Number.isNaN(parseFloat(param.value)) ? param.value : parseFloat(param.value);
      return acc;
    },
    {} as Record<string, string | number>,
  );

  return data.useAdditionalParametersInput
    ? (coerceTypeOptional(inputs['additionalParameters' as PortId], 'object') as Record<string, string> | undefined) ??
        additionalParametersFromData
    : additionalParametersFromData;
}

export function resolveChatTools(inputs: Inputs): ChatCompletionTool[] {
  const functions = coerceTypeOptional(inputs['functions' as PortId], 'gpt-function[]');
  return (functions ?? []).map(
    (fn): ChatCompletionTool => ({
      function: fn,
      type: 'function',
    }),
  );
}

export function resolvePredictionObject(data: ChatNodeData, inputs: Inputs) {
  const predictedOutput = data.usePredictedOutput
    ? coerceTypeOptional(inputs['predictedOutput' as PortId], 'string[]')
    : undefined;

  if (!predictedOutput) {
    return undefined;
  }

  return predictedOutput.length === 1
    ? { type: 'content' as const, content: predictedOutput[0]! }
    : { type: 'content' as const, content: predictedOutput.map((part) => ({ type: 'text', text: part })) };
}

export function resolveAudioAndModalities(data: ChatNodeData, inputs: Inputs) {
  const voice = getInputOrData(data, inputs, 'audioVoice');

  let modalities: ('text' | 'audio')[] | undefined = [];
  if (data.modalitiesIncludeText) {
    modalities.push('text');
  }
  if (data.modalitiesIncludeAudio) {
    modalities.push('audio');

    if (!voice) {
      throw new Error('Audio voice must be specified if audio is enabled.');
    }
  }

  if (modalities.length === 0) {
    modalities = undefined;
  }

  const audio = modalities?.includes('audio')
    ? {
        voice,
        format:
          (getInputOrData(data, inputs, 'audioFormat') as 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16' | undefined) ??
          'wav',
      }
    : undefined;

  return { modalities, audio };
}
