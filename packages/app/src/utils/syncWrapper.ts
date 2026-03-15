import { handleError } from './errorHandling';

export function syncWrapper<T extends (...args: any[]) => Promise<void>>(fn: T, context = 'Unexpected error'): () => void {
  return (...args: Parameters<T>) => {
    fn(...args).catch((err) => {
      handleError(err, context);
    });
  };
}
