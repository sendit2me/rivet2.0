import { isInTauri } from './core.js';

export async function getAppVersion(): Promise<string> {
  if (!isInTauri()) {
    return '';
  }

  const { getVersion } = await import('@tauri-apps/api/app');
  return await getVersion();
}

export async function relaunchApp(): Promise<void> {
  if (!isInTauri()) {
    window.location.reload();
    return;
  }

  const { relaunch } = await import('@tauri-apps/api/process');
  await relaunch();
}
