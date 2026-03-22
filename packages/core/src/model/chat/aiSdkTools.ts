import type { Tool } from 'ai';
import { jsonSchema } from 'ai';
import type { GptFunction } from '../DataValue.js';

export function rivetToolsToAiSdk(
  functions: GptFunction[],
): Record<string, Tool<any, never>> {
  return Object.fromEntries(
    functions.map((fn) => [
      fn.name,
      {
        description: fn.description,
        inputSchema: jsonSchema(fn.parameters),
      } satisfies Tool<any, never>,
    ]),
  );
}
