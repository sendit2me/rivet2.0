import { useEffect } from 'react';
import { useStableCallback } from './useStableCallback.js';
import { registerGlobalShortcut } from '../utils/platform/window.js';

export function useGlobalShortcut(shortcut: string, handler: () => void) {
  const handlerStable = useStableCallback(() => {
    handler();
  });

  useEffect(() => {
    let unregisterShortcut: (() => void | Promise<void>) | undefined;

    void registerGlobalShortcut(shortcut, handlerStable).then((unregister) => {
      unregisterShortcut = unregister;
    });

    return () => {
      void unregisterShortcut?.();
    };
  }, [handlerStable, shortcut]);
}
