import { Output, jsonSchema } from 'ai';
import { coerceTypeOptional } from '../../utils/coerceType.js';
import { getInputOrData } from '../../utils/inputs.js';
import type { GptFunction } from '../DataValue.js';
import type { Inputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import type { ChatV2ResponseOutput } from './chatV2Types.js';

export type ChatV2ResponseFormat = '' | 'text' | 'json' | 'json_schema';

export type ChatV2ResponseFormatData = {
  responseFormat?: ChatV2ResponseFormat;
  responseSchemaName?: string;
  useResponseSchemaNameInput?: boolean;
  responseSchemaDescription?: string;
  useResponseSchemaDescriptionInput?: boolean;
};

export type ChatV2ResponseFormatParameters =
  | undefined
  | {
      responseFormat: 'text';
    }
  | {
      responseFormat: 'json';
      schemaName?: string;
      schemaDescription?: string;
    }
  | {
      responseFormat: 'json_schema';
      schema: unknown;
      schemaName: string;
      schemaDescription?: string;
    };

function getResponseSchema(inputs: Inputs): unknown {
  const responseSchemaInput = inputs['responseSchema' as PortId];

  if (responseSchemaInput?.type === 'gpt-function') {
    return (responseSchemaInput.value as GptFunction).parameters;
  }

  return responseSchemaInput != null ? coerceTypeOptional(responseSchemaInput, 'object') ?? {} : {};
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveChatV2ResponseFormatParameters(
  data: ChatV2ResponseFormatData,
  inputs: Inputs,
): ChatV2ResponseFormatParameters {
  const responseFormat = data.responseFormat ?? '';

  if (!responseFormat) {
    return undefined;
  }

  if (responseFormat === 'text') {
    return { responseFormat };
  }

  const schemaName = normalizeOptionalString(getInputOrData(data, inputs, 'responseSchemaName', 'string'));
  const schemaDescription = normalizeOptionalString(
    getInputOrData(data, inputs, 'responseSchemaDescription', 'string'),
  );

  if (responseFormat === 'json') {
    return {
      responseFormat,
      schemaName,
      schemaDescription,
    };
  }

  return {
    responseFormat,
    schema: getResponseSchema(inputs),
    schemaName: schemaName ?? 'response_schema',
    schemaDescription,
  };
}

export function createChatV2ResponseOutput(
  parameters: ChatV2ResponseFormatParameters,
): ChatV2ResponseOutput | undefined {
  if (parameters == null) {
    return undefined;
  }

  if (parameters.responseFormat === 'text') {
    return Output.text();
  }

  if (parameters.responseFormat === 'json') {
    return Output.json({
      name: parameters.schemaName,
      description: parameters.schemaDescription,
    });
  }

  return Output.object({
    schema: jsonSchema(parameters.schema as any),
    name: parameters.schemaName,
    description: parameters.schemaDescription,
  });
}
