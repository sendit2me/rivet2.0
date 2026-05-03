import type { LooseDataValue } from '@valerypopoff/rivet2-node';

function isInputRecord(value: unknown): value is Record<string, LooseDataValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonInputRecord(text: string, source: string): Record<string, LooseDataValue> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmedText);
  } catch (error) {
    throw new Error(`${source} must be valid JSON.`, { cause: error });
  }

  if (!isInputRecord(parsed)) {
    throw new Error(`${source} must be a JSON object.`);
  }

  return parsed;
}

export function parseKeyValueInputRecord(values: string[], source: string): Record<string, LooseDataValue> {
  return Object.fromEntries(
    values.map((item) => {
      const separatorIndex = item.indexOf('=');

      if (separatorIndex <= 0) {
        throw new Error(`Invalid ${source} value "${item}". Expected key=value.`);
      }

      const key = item.slice(0, separatorIndex).trim();

      if (!key) {
        throw new Error(`Invalid ${source} value "${item}". Expected a non-empty key.`);
      }

      return [key, item.slice(separatorIndex + 1)];
    }),
  );
}
