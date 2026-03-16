import type Emittery from 'emittery';

/**
 * Intentionally fire-and-forget an Emittery event emission.
 *
 * Use this instead of inline `// eslint-disable-next-line @typescript-eslint/no-floating-promises`
 * to make the "detached async" intent explicit and auditable.
 *
 * The returned promise is intentionally discarded. Listener errors are swallowed
 * by Emittery's default behavior (logged to console).
 */
export function emitDetached<T extends Record<string, unknown>>(
  emitter: Emittery<T>,
  event: keyof T & string,
  data: T[keyof T & string],
): void {
  void emitter.emit(event, data);
}
