import { useEffect } from 'react';
import { type NativeChildProcess } from '../utils/platform/core.js';
import { createNativeSidecarCommand } from '../utils/platform/shell.js';

let sidecarStarted = false;
let sidecarProcess: NativeChildProcess | null = null;
let sidecarStartPromise: Promise<void> | null = null;
let sidecarConsumerCount = 0;

async function runSidecar() {
  try {
    if (sidecarStarted) {
      return;
    }

    if (sidecarStartPromise) {
      await sidecarStartPromise;
      return;
    }

    sidecarStartPromise = (async () => {
      const command = await createNativeSidecarCommand('../../app-executor/dist/app-executor');

      command.stdout.on('data', (data) => {
        console.log('sidecar stdout', data);
      });

      command.stderr.on('data', (data) => {
        console.error('sidecar stderr', data);
      });

      sidecarStarted = true;

      // TODO better API
      sidecarProcess = await command.spawn();

      if (sidecarConsumerCount === 0 && sidecarProcess) {
        const proc = sidecarProcess;
        sidecarProcess = null;
        sidecarStarted = false;
        await proc.kill();
      }
    })();

    await sidecarStartPromise;
    sidecarStartPromise = null;
  } catch (err) {
    sidecarStartPromise = null;
    sidecarStarted = false;
    sidecarProcess = null;
    console.error('Error running sidecar', err);
  }
}

async function stopSidecar() {
  if (sidecarConsumerCount > 0) {
    return;
  }

  const proc = sidecarProcess;
  sidecarProcess = null;
  sidecarStarted = false;
  sidecarStartPromise = null;

  if (proc) {
    await proc.kill();
  }
}

export function useExecutorSidecar(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    sidecarConsumerCount += 1;

    void runSidecar();

    return () => {
      sidecarConsumerCount = Math.max(0, sidecarConsumerCount - 1);
      void stopSidecar();
    };
  }, [enabled]);
}
