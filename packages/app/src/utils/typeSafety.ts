export const entries = <K extends string, V>(
  object: Record<K, V> | Partial<Record<K, V>> | undefined | null,
): [K, V][] => (object == null ? [] : (Object.entries(object) as [K, V][]));

export function keys<K extends string>(o: Record<K, unknown>): K[];
export function keys<T>(o: T): (keyof T)[];
export function keys(o: object) {
  return Object.keys(o);
}

export function values<V extends string>(o: Record<keyof any, V>): V[];
export function values<T>(o: T): T[keyof T][];
export function values(o: object) {
  return Object.values(o);
}
