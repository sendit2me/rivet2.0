import { isInTauri, unsupported } from './core.js';

export function getPathDirname(path: string): string {
  const trimmedPath = path.replace(/[\\/]+$/, '');
  const lastSeparatorIndex = Math.max(trimmedPath.lastIndexOf('/'), trimmedPath.lastIndexOf('\\'));

  if (lastSeparatorIndex < 0) {
    return '';
  }

  if (lastSeparatorIndex === 0) {
    return trimmedPath.slice(0, 1);
  }

  if (lastSeparatorIndex === 2 && /^[A-Za-z]:/.test(trimmedPath)) {
    return trimmedPath.slice(0, 3);
  }

  return trimmedPath.slice(0, lastSeparatorIndex);
}

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
