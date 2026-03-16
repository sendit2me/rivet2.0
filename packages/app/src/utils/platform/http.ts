import { isInTauri } from './core.js';

export const NativeResponseType = {
  Binary: 'Binary',
} as const;

export async function nativeFetch<T>(url: string, options?: Record<string, unknown>) {
  if (!isInTauri()) {
    const response = await fetch(url, options as RequestInit | undefined);
    const data = (await response.json()) as T;
    return { data, status: response.status };
  }

  const { fetch: tauriFetch } = await import('@tauri-apps/api/http');
  return await tauriFetch<T>(url, options as Parameters<typeof tauriFetch<T>>[1]);
}

export async function nativeHttpClientGet<T>(
  url: string,
  options?: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
  if (!isInTauri()) {
    const response = await fetch(url, { headers: options?.headers as HeadersInit | undefined });
    const buffer = await response.arrayBuffer();
    return { data: Array.from(new Uint8Array(buffer)) as T, status: response.status };
  }

  const { getClient } = await import('@tauri-apps/api/http');
  const client = await getClient();
  return await client.get<T>(url, options);
}
