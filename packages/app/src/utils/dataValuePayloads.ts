export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function getStringProperty(value: unknown, property: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const propertyValue = value[property];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
}

export function getByteLength(value: unknown): number {
  if (value && typeof value === 'object') {
    if (typeof (value as { byteLength?: unknown }).byteLength === 'number') {
      return (value as { byteLength: number }).byteLength;
    }

    if (typeof (value as { length?: unknown }).length === 'number') {
      return (value as { length: number }).length;
    }
  }

  return 0;
}

export function getMediaData(value: unknown): Uint8Array | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return value.data instanceof Uint8Array ? value.data : undefined;
}

export function getMediaType(value: unknown): string | undefined {
  return getStringProperty(value, 'mediaType');
}

export function getMediaByteLength(value: unknown): number {
  return isRecord(value) ? getByteLength(value.data) : 0;
}

export function stringifyForDisplay(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return String(value);
  }
}
