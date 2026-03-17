import join from 'url-join';
import { type CheckerReturnType, type Checker } from '@recoiljs/refine';
import { handleError } from './errorHandling.js';

export function getCommunityHost() {
  if (import.meta.env.MODE === 'production') {
    throw new Error('Not implemented yet');
  } else {
    return 'http://localhost:3000';
  }
}

export function getCommunityApi(path?: string) {
  const url = getCommunityHost();

  return join(url, 'api', path || '');
}

export function getCommunityLoginUrl() {
  const url = getCommunityHost();

  return join(url, 'auth/signin');
}

export async function fetchCommunity<T extends Checker<any>>(
  path: string,
  bodyChecker: T,
  init?: RequestInit,
): Promise<CheckerReturnType<T>> {
  const url = getCommunityApi(path);

  const result = await fetch(url, {
    credentials: 'include',
    ...init,
  });

  if (result.status === 401) {
    throw new Error('Unauthorized');
  }

  const data = await result.json();

  const checkerResult = bodyChecker(data);

  if (checkerResult.type === 'failure') {
    handleError(new Error(checkerResult.message), 'Failed to validate community API response', {
      metadata: {
        path,
      },
    });
    throw new Error(checkerResult.message);
  }

  return checkerResult.value;
}
