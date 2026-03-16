import { isInTauri, unsupported } from './core.js';

export async function nativeAppLocalDataDir(): Promise<string> {
  if (!isInTauri()) {
    unsupported('App local data directory');
  }

  const { appLocalDataDir } = await import('@tauri-apps/api/path');
  return await appLocalDataDir();
}

export async function nativeAppLogDir(): Promise<string> {
  if (!isInTauri()) {
    unsupported('App log directory');
  }

  const { appLogDir } = await import('@tauri-apps/api/path');
  return await appLogDir();
}

export async function nativeJoinPath(...paths: string[]): Promise<string> {
  if (!isInTauri()) {
    return paths.join('/');
  }

  const { join } = await import('@tauri-apps/api/path');
  return await join(...paths);
}
