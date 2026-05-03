import { getError, type Project } from '@valerypopoff/rivet2-core';
import { nanoid } from 'nanoid';
import { handleError } from './errorHandling.js';

const worker = new Worker(new URL('./deserializeProject.worker.ts', import.meta.url), { type: 'module' });

worker.addEventListener('error', (event) => {
  handleError(event, 'Project deserialization worker error', {
    toastError: false,
  });
});

worker.addEventListener('message', (event) => {
  const { id, type, result, error } = event.data;

  if (type !== 'deserializeProject:result') {
    return;
  }

  const resolvers = waiting.get(id);

  if (resolvers) {
    if (error) {
      resolvers.reject(getError(error));
    } else {
      resolvers.resolve(result);
    }
    waiting.delete(id);
  } else {
    handleError(new Error(`No resolvers found for id: ${id}`), 'Unexpected deserialization worker response', {
      metadata: {
        id,
      },
      toastError: false,
    });
  }
});

type PromiseResolvers<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const waiting = new Map<string, PromiseResolvers<Project>>();

export function deserializeProjectAsync(serializedProject: unknown): Promise<Project> {
  const id = nanoid();

  const resolvers: PromiseResolvers<Project> = { resolve: undefined!, reject: undefined! };
  const promise = new Promise<Project>((res, rej) => {
    resolvers.resolve = res;
    resolvers.reject = rej;
  });

  waiting.set(id, resolvers);
  // worker.postMessage({ id, type: 'deserializeProject', data: serializedProject });

  return promise;
}
