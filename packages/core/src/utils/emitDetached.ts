import type Emittery from 'emittery';

/**
 * Intentionally fire-and-forget an Emittery event emission.
 *
 * Use this instead of inline `// eslint-disable-next-line @typescript-eslint/no-floating-promises`
 * to make the "detached async" intent explicit and auditable.
 *
 * The returned promise is intentionally discarded. Call this only for events
 * where listener completion does not affect processor ordering.
 */
export function emitDetached<T extends Record<string, unknown>>(
  emitter: Emittery<T>,
  event: keyof T & string,
  data: T[keyof T & string],
): void {
  void emitter.emit(event, data);
}
