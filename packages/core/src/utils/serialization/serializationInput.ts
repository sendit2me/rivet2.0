import * as YAML from 'yaml';

type PreparedSerializationVersion = 1 | 2 | 3 | 4;

export type PreparedSerializedInput = {
  deserializerInput: unknown;
  version: PreparedSerializationVersion;
};

export function prepareSerializedInput(data: unknown): PreparedSerializedInput {
  if (typeof data !== 'string') {
    return {
      deserializerInput: data,
      version: 1,
    };
  }

  const trimmed = data.trim();
  if (!trimmed) {
    return {
      deserializerInput: data,
      version: 1,
    };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const version = getParsedSerializationVersion(parsed);

      return {
        deserializerInput: version === 1 ? data : parsed,
        version,
      };
    } catch {
      return {
        deserializerInput: data,
        version: 1,
      };
    }
  }

  const parsed = YAML.parse(trimmed);
  const version = getParsedSerializationVersion(parsed);

  return {
    deserializerInput: version === 1 ? data : parsed,
    version,
  };
}

function getParsedSerializationVersion(parsed: unknown): PreparedSerializationVersion {
  if (!parsed || typeof parsed !== 'object') {
    return 1;
  }

  const version = (parsed as { version?: unknown }).version;
  if (version === 2 || version === 3 || version === 4) {
    return version;
  }

  return 1;
}
