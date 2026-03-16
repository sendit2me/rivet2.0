import type { NativeUpdaterEvent, NativeWindowListener } from './core.js';
import { isInTauri, unsupported } from './core.js';

export async function checkForAppUpdate(): Promise<{
  manifest?: { body: string; version: string } | null;
  shouldUpdate: boolean;
}> {
  if (!isInTauri()) {
    return { shouldUpdate: false, manifest: null };
  }

  const { checkUpdate } = await import('@tauri-apps/api/updater');
  return await checkUpdate();
}

export async function installAppUpdate(): Promise<void> {
  if (!isInTauri()) {
    unsupported('App updates');
  }

  const { installUpdate } = await import('@tauri-apps/api/updater');
  await installUpdate();
}

export async function onAppUpdaterEvent(
  handler: (event: NativeUpdaterEvent) => void,
): Promise<NativeWindowListener> {
  if (!isInTauri()) {
    return () => {};
  }

  const { onUpdaterEvent } = await import('@tauri-apps/api/updater');
  return await onUpdaterEvent((event) => handler({ error: event.error, status: event.status }));
}
