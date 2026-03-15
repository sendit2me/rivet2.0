export type NativeCommandResult = {
  code: number | null;
  stderr: string;
  stdout: string;
};

export type NativeDataStream = {
  on(event: 'data', handler: (data: string) => void): void;
};

export type NativeChildProcess = {
  kill(): void | Promise<void>;
};

export type NativeCommand = {
  execute(): Promise<NativeCommandResult>;
  spawn(): Promise<NativeChildProcess>;
  stderr: NativeDataStream;
  stdout: NativeDataStream;
};

type CommandLike = {
  execute(): Promise<{ code: number | null; stderr: string; stdout: string }>;
  spawn(): Promise<NativeChildProcess>;
  stderr: NativeDataStream;
  stdout: NativeDataStream;
};

export type NativeWindowListener = () => void | Promise<void>;

export type NativeWindowHandle = {
  close(): Promise<void>;
  onCloseRequested?(handler: () => void): Promise<NativeWindowListener>;
  onMenuClicked?(handler: (event: { payload: string }) => void): Promise<NativeWindowListener>;
  once?(event: string, handler: (event: unknown) => void): Promise<NativeWindowListener>;
  setTitle?(title: string): Promise<void>;
};

export type NativeUpdaterEvent = {
  error?: string;
  status: string;
};

export function isInTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

function unsupported(feature: string): never {
  throw new Error(`${feature} is only available in the desktop app`);
}

export async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isInTauri()) {
    unsupported(`Native command "${command}"`);
  }

  const { invoke } = await import('@tauri-apps/api/tauri');
  return await invoke<T>(command, args);
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isInTauri()) {
    window.open(url, '_blank');
    return;
  }

  const { open } = await import('@tauri-apps/api/shell');
  await open(url);
}

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

export async function getCurrentWindowHandle(): Promise<NativeWindowHandle | null> {
  if (!isInTauri()) {
    return null;
  }

  const { window } = await import('@tauri-apps/api');
  return window.getCurrent();
}

export async function getAppWindowHandle(): Promise<NativeWindowHandle | null> {
  if (!isInTauri()) {
    return null;
  }

  const { appWindow } = await import('@tauri-apps/api/window');
  return appWindow;
}

export async function createWebviewWindowHandle(
  label: string,
  options: { alwaysOnTop?: boolean; center?: boolean; url: string },
): Promise<NativeWindowHandle> {
  if (!isInTauri()) {
    window.open(options.url, '_blank');
    return {
      close: async () => {},
      onCloseRequested: async () => () => {},
      once: async () => () => {},
    };
  }

  const { WebviewWindow } = await import('@tauri-apps/api/window');
  return new WebviewWindow(label, options);
}

export async function registerGlobalShortcut(shortcut: string, handler: () => void): Promise<NativeWindowListener> {
  if (!isInTauri()) {
    return () => {};
  }

  const { register, unregister } = await import('@tauri-apps/api/globalShortcut');
  await register(shortcut, handler);
  return async () => {
    await unregister(shortcut);
  };
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
