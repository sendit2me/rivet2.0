import type { NativeCommand } from './core.js';
import { isInTauri, unsupported } from './core.js';
import type { CommandLike } from './core.js';

export async function openExternalUrl(url: string): Promise<void> {
  if (!isInTauri()) {
    window.open(url, '_blank');
    return;
  }

  const { open } = await import('@tauri-apps/api/shell');
  await open(url);
}

export async function createNativeCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; encoding?: string },
): Promise<NativeCommand> {
  if (!isInTauri()) {
    unsupported(`Command "${command}"`);
  }

  const { Command } = await import('@tauri-apps/api/shell');
  const tauriCommand = new Command(command, args, options) as unknown as CommandLike;
  return {
    execute: () => tauriCommand.execute(),
    spawn: () => tauriCommand.spawn(),
    stderr: tauriCommand.stderr,
    stdout: tauriCommand.stdout,
  };
}

export async function createNativeSidecarCommand(
  command: string,
  args: string[] = [],
  options?: { cwd?: string; encoding?: string },
): Promise<NativeCommand> {
  if (!isInTauri()) {
    unsupported(`Sidecar "${command}"`);
  }

  const { Command } = await import('@tauri-apps/api/shell');
  const tauriCommand = Command.sidecar(command, args, options) as unknown as CommandLike;
  return {
    execute: () => tauriCommand.execute(),
    spawn: () => tauriCommand.spawn(),
    stderr: tauriCommand.stderr,
    stdout: tauriCommand.stdout,
  };
}
