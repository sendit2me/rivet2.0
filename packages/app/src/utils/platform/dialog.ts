import { isInTauri, unsupported } from './core.js';

export async function openDialog(options: Record<string, unknown>): Promise<string | string[] | null> {
  if (!isInTauri()) {
    unsupported('Open dialog');
  }

  const { open } = await import('@tauri-apps/api/dialog');
  return await open(options);
}

export async function saveDialog(options: Record<string, unknown>): Promise<string | null> {
  if (!isInTauri()) {
    unsupported('Save dialog');
  }

  const { save } = await import('@tauri-apps/api/dialog');
  return await save(options);
}
