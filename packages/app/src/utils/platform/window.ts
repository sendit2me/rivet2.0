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
    const popup = window.open(options.url, '_blank');
    const closeIntervals = new Set<ReturnType<typeof globalThis.setInterval>>();
    const closeHandlers = new Set<() => void>();
    let closeNotified = false;

    const notifyClosed = () => {
      if (closeNotified) {
        return;
      }

      closeNotified = true;

      for (const intervalId of closeIntervals) {
        globalThis.clearInterval(intervalId);
      }
      closeIntervals.clear();

      for (const handler of closeHandlers) {
        void handler();
      }
    };

    return {
      close: async () => {
        popup?.close();
        notifyClosed();
      },
      onCloseRequested: async (handler) => {
        closeHandlers.add(handler);

        const intervalId = globalThis.setInterval(() => {
          if (popup == null || popup.closed) {
            notifyClosed();
          }
        }, 250);

        closeIntervals.add(intervalId);

        return async () => {
          globalThis.clearInterval(intervalId);
          closeIntervals.delete(intervalId);
          closeHandlers.delete(handler);
        };
      },
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
