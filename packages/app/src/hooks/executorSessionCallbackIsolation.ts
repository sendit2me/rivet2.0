import { handleError } from '../utils/errorHandling.js';

type MaybePromise<T> = T | Promise<T>;

export type ExecutorSessionCallback<TEvent> = (event: TEvent) => MaybePromise<void>;

export function notifyExecutorSessionCallbacks<TEvent>(options: {
  callbacks: Set<ExecutorSessionCallback<TEvent>>;
  context: string;
  event: TEvent;
  metadata: Record<string, unknown>;
}): void {
  const { callbacks, context, event, metadata } = options;

  for (const callback of [...callbacks]) {
    runExecutorSessionCallback(() => callback(event), context, metadata);
  }
}

export function runExecutorSessionCallback(
  callback: () => MaybePromise<void>,
  context: string,
  metadata: Record<string, unknown>,
): void {
  try {
    void Promise.resolve(callback()).catch((error) => {
      reportExecutorSessionCallbackError(error, context, metadata);
    });
  } catch (error) {
    reportExecutorSessionCallbackError(error, context, metadata);
  }
}

function reportExecutorSessionCallbackError(error: unknown, context: string, metadata: Record<string, unknown>) {
  handleError(error, context, {
    metadata,
    toastError: false,
  });
}
