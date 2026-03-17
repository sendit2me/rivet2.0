import { wrapAsync } from './errorHandling';

export function syncWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  context = 'Unexpected error',
): (...args: TArgs) => void {
  return wrapAsync(fn, context);
}
