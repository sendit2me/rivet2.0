import type { NativeWindowHandle, NativeWindowListener } from './core.js';
import { isInTauri } from './core.js';

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
