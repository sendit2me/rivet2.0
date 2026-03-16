import { isInTauri, unsupported } from './core.js';

export async function nativeReadDir(path: string, options?: Record<string, unknown>) {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { readDir } = await import('@tauri-apps/api/fs');
  return await readDir(path, options);
}

export async function nativeReadTextFile(path: string, options?: Record<string, unknown>): Promise<string> {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { readTextFile } = await import('@tauri-apps/api/fs');
  return await readTextFile(path, options);
}

export async function nativeReadBinaryFile(path: string, options?: Record<string, unknown>): Promise<Uint8Array> {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { readBinaryFile } = await import('@tauri-apps/api/fs');
  return await readBinaryFile(path, options);
}

export async function nativeWriteFile(pathOrOptions: unknown, data?: string, options?: Record<string, unknown>) {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { writeFile } = await import('@tauri-apps/api/fs');
  if (typeof pathOrOptions === 'string') {
    await writeFile(pathOrOptions, data ?? '', options);
  } else {
    await writeFile(pathOrOptions as Parameters<typeof writeFile>[0]);
  }
}

export async function nativeWriteTextFile(path: string, data: string, options?: Record<string, unknown>) {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { writeTextFile } = await import('@tauri-apps/api/fs');
  await writeTextFile(path, data, options);
}

export async function nativeWriteBinaryFile(path: string, data: Uint8Array, options?: Record<string, unknown>) {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { writeBinaryFile } = await import('@tauri-apps/api/fs');
  await writeBinaryFile(path, data, options);
}

export async function nativeCreateDir(path: string, options?: Record<string, unknown>) {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { createDir } = await import('@tauri-apps/api/fs');
  await createDir(path, options);
}

export async function nativeRemoveDir(path: string, options?: Record<string, unknown>) {
  if (!isInTauri()) {
    unsupported('Filesystem access');
  }

  const { removeDir } = await import('@tauri-apps/api/fs');
  await removeDir(path, options);
}

export async function nativeExists(path: string, options?: Record<string, unknown>): Promise<boolean> {
  if (!isInTauri()) {
    return false;
  }

  const { exists } = await import('@tauri-apps/api/fs');
  return await exists(path, options);
}
