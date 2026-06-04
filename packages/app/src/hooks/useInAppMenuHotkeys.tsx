import { useEffect } from 'react';
import { type MenuIds, useRunMenuCommand } from './useMenuCommands';
import { isMacOSPlatform, isWindowsPlatform } from '../utils/platform/os.js';
import { isInTauri } from '../utils/tauri.js';

interface InAppMenuHotkeyWindow extends Window {
  __rivetInAppMenuHotkeysCleanup?: () => void;
}
declare let window: InAppMenuHotkeyWindow;

const shouldUseInAppMenuHotkeys = isWindowsPlatform() || (isInTauri() && isMacOSPlatform());

const shortcutToMenuId: Record<string, MenuIds> = {
  F5: 'remote_debugger',
  'CmdOrCtrl+Shift+O': 'load_recording',
  'CmdOrCtrl+N': 'new_project',
  'CmdOrCtrl+O': 'open_project',
  'CmdOrCtrl+S': 'save_project',
  'CmdOrCtrl+Shift+E': 'export_graph',
  'CmdOrCtrl+Shift+S': 'save_project_as',
  'CmdOrCtrl+ENTER': 'run',
};

const hotkeyListenerOptions = { capture: true };

export const useInAppMenuHotkeys = () => {
  const runMenuCommandImpl = useRunMenuCommand();

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldUseInAppMenuHotkeys) {
      return;
    }

    window.__rivetInAppMenuHotkeysCleanup?.();

    const onKeyDown = (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey, shiftKey } = event;
      const code = `${ctrlKey || metaKey ? 'CmdOrCtrl+' : ''}${shiftKey ? 'Shift+' : ''}${key.toUpperCase()}`;
      const command = shortcutToMenuId[code];

      if (command) {
        event.preventDefault();
        event.stopPropagation();

        if (event.repeat) {
          return;
        }

        runMenuCommandImpl(command);
      }
    };

    window.addEventListener('keydown', onKeyDown, hotkeyListenerOptions);

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown, hotkeyListenerOptions);
    };

    window.__rivetInAppMenuHotkeysCleanup = cleanup;

    return () => {
      if (window.__rivetInAppMenuHotkeysCleanup === cleanup) {
        cleanup();
        delete window.__rivetInAppMenuHotkeysCleanup;
      }
    };
  }, [runMenuCommandImpl]);

  return shouldUseInAppMenuHotkeys;
};
