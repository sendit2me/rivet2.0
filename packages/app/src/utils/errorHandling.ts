import { getError } from '@rivet2/rivet-core';
import { toast } from 'react-toastify';

const recentErrorTimestamps = new Map<string, number>();
const ERROR_DEDUPE_WINDOW_MS = 5_000;

export type HandleErrorOptions = {
  metadata?: Record<string, unknown>;
  toastError?: boolean;
};

type HandleErrorOptionsResolver<TArgs extends unknown[]> =
  | HandleErrorOptions
  | ((...args: TArgs) => HandleErrorOptions);

export function handleError(error: unknown, context: string, options: HandleErrorOptions = {}): void {
  const normalizedError = getError(error);
  const message = `${context}: ${normalizedError.message}`;

  if (options.metadata) {
    console.error(`[${context}]`, {
      error: normalizedError,
      metadata: options.metadata,
    });
  } else {
    console.error(`[${context}]`, normalizedError);
  }

  if (options.toastError === false) {
    return;
  }

  const now = Date.now();
  const lastShownAt = recentErrorTimestamps.get(message) ?? 0;
  if (now - lastShownAt < ERROR_DEDUPE_WINDOW_MS) {
    return;
  }

  recentErrorTimestamps.set(message, now);
  toast.error(message);
}

export function wrapAsync<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  context: string,
  options?: HandleErrorOptionsResolver<TArgs>,
): (...args: TArgs) => void {
  return (...args: TArgs) => {
    void fn(...args).catch((error) => {
      handleError(error, context, typeof options === 'function' ? options(...args) : options);
    });
  };
}

export function syncWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  context = 'Unexpected error',
): (...args: TArgs) => void {
  return wrapAsync(fn, context);
}

export function installGlobalErrorHandlers(): void {
  const windowWithFlag = window as Window & { __rivetGlobalErrorHandlersInstalled?: boolean };
  if (windowWithFlag.__rivetGlobalErrorHandlersInstalled) {
    return;
  }

  windowWithFlag.__rivetGlobalErrorHandlersInstalled = true;

  window.addEventListener('unhandledrejection', (event) => {
    handleError(event.reason, 'Unhandled promise rejection');
  });

  window.addEventListener('error', (event) => {
    handleError(event.error ?? event.message, 'Unhandled error');
  });
}
