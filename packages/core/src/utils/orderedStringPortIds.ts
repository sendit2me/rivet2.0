export type LegacyOrderedPortIdPattern = {
  kind: 'prefix';
  prefix: string;
  startIndex: 0 | 1;
};

export function sanitizeIdentifierPortValue(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
}

export function resolveUniqueValueDerivedPortIds(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(sanitizeIdentifierPortValue))).filter(Boolean);
}

export function buildLegacyOrderedPortIds(length: number, pattern: LegacyOrderedPortIdPattern): string[] {
  return Array.from({ length }, (_, index) => `${pattern.prefix}${index + pattern.startIndex}`);
}

export function hasValidStoredOrderedPortIds(
  length: number,
  storedIds: readonly string[] | undefined,
): storedIds is readonly string[] {
  if (!Array.isArray(storedIds) || storedIds.length !== length) {
    return false;
  }

  const seenIds = new Set<string>();

  return storedIds.every((id) => {
    if (typeof id !== 'string' || id.length === 0 || seenIds.has(id)) {
      return false;
    }

    seenIds.add(id);
    return true;
  });
}

export function resolveStoredOrderedPortIds(
  length: number,
  storedIds: readonly string[] | undefined,
  legacyPattern: LegacyOrderedPortIdPattern,
): string[] {
  return hasValidStoredOrderedPortIds(length, storedIds)
    ? [...storedIds]
    : buildLegacyOrderedPortIds(length, legacyPattern);
}
