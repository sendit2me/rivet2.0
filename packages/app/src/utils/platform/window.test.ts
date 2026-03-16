import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebviewWindowHandle } from './window.js';

test('createWebviewWindowHandle browser fallback reports popup closure and can close the popup', async () => {
  const originalWindow = globalThis.window;

  let closed = false;
  const popup = {
    get closed() {
      return closed;
    },
    close() {
      closed = true;
    },
  };

  globalThis.window = {
    open: () => popup,
  } as typeof window;

  try {
    const handle = await createWebviewWindowHandle('login', { url: 'https://example.com', alwaysOnTop: true, center: true });

    let closeRequested = 0;
    const unsubscribe = await handle.onCloseRequested?.(() => {
      closeRequested += 1;
    });

    await handle.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(closed, true);
    assert.equal(closeRequested, 1);

    await unsubscribe?.();
  } finally {
    globalThis.window = originalWindow;
  }
});
