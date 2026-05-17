import type { CodeConsoleMessage, Outputs } from '@valerypopoff/rivet2-core';
import * as process from 'node:process';
import type { Worker } from 'node:worker_threads';
import {
  createReadyCodeWorker,
  runCodeOnReadyWorker,
  type CodeWorkerRunRequest,
} from './codeRunnerWorkerHost.mjs';

const DEFAULT_CODE_WORKER_POOL_SIZE = 2;
const CODE_WORKER_POOL_SIZE_ENV = 'RIVET_CODE_RUNNER_WORKER_POOL_SIZE';

type AppExecutorCodeWorkerPoolOptions = {
  size?: number;
};

type IdleWorkerEntry = {
  promise: Promise<Worker>;
  worker?: Worker;
  idleErrorHandler?: (error: Error) => void;
  idleExitHandler?: () => void;
  failed?: boolean;
};

export type AppExecutorCodeWorkerPoolStats = {
  acquiredColdWorkers: number;
  acquiredReadyWorkers: number;
  createdWorkers: number;
};

export class AppExecutorCodeWorkerPool {
  readonly #poolSize: number;
  readonly #idleWorkers: IdleWorkerEntry[] = [];
  #acquiredColdWorkers = 0;
  #acquiredReadyWorkers = 0;
  #createdWorkers = 0;
  #shutDown = false;

  constructor(options: AppExecutorCodeWorkerPoolOptions = {}) {
    this.#poolSize = normalizeWorkerPoolSize(options.size ?? getConfiguredWorkerPoolSize());
    this.#fillIdleWorkers();
  }

  getStats(): AppExecutorCodeWorkerPoolStats {
    return {
      acquiredColdWorkers: this.#acquiredColdWorkers,
      acquiredReadyWorkers: this.#acquiredReadyWorkers,
      createdWorkers: this.#createdWorkers,
    };
  }

  async prewarm(): Promise<void> {
    await Promise.all(this.#idleWorkers.map((entry) => entry.promise));
  }

  async run(request: CodeWorkerRunRequest, onConsole?: (message: CodeConsoleMessage) => void): Promise<Outputs> {
    const worker = await this.#acquireWorker();
    this.#fillIdleWorkers();

    return runCodeOnReadyWorker(worker, request, onConsole);
  }

  async shutdown(): Promise<void> {
    this.#shutDown = true;
    const idleWorkers = this.#idleWorkers.splice(0);
    const settledWorkers = await Promise.allSettled(idleWorkers.map((entry) => entry.promise));

    await Promise.allSettled(
      settledWorkers
        .filter((result): result is PromiseFulfilledResult<Worker> => result.status === 'fulfilled')
        .map((result) => {
          const entry = idleWorkers.find((candidate) => candidate.worker === result.value);
          if (entry) {
            this.#detachIdleWorker(entry);
          }
          return result.value.terminate();
        }),
    );
  }

  async #acquireWorker(): Promise<Worker> {
    while (this.#idleWorkers.length > 0) {
      const entry = this.#idleWorkers.shift()!;

      try {
        const worker = await entry.promise;
        if (entry.failed) {
          continue;
        }
        this.#detachIdleWorker(entry);
        this.#acquiredReadyWorkers += 1;
        return worker;
      } catch {
        // Drop failed prewarmed workers and try the next available entry.
      }
    }

    this.#acquiredColdWorkers += 1;
    return this.#createReadyWorker();
  }

  #fillIdleWorkers(): void {
    if (this.#shutDown) {
      return;
    }

    while (this.#idleWorkers.length < this.#poolSize) {
      const entry = this.#createIdleWorkerEntry();
      this.#idleWorkers.push(entry);
    }
  }

  #createReadyWorker(): Promise<Worker> {
    this.#createdWorkers += 1;
    return createReadyCodeWorker();
  }

  #createIdleWorkerEntry(): IdleWorkerEntry {
    const entry: IdleWorkerEntry = {
      promise: this.#createReadyWorker().then((worker) => {
        if (this.#shutDown) {
          void worker.terminate();
          throw new Error('Code worker pool shut down before worker became idle.');
        }

        entry.worker = worker;
        entry.idleErrorHandler = () => this.#removeFailedIdleWorker(entry);
        entry.idleExitHandler = () => this.#removeFailedIdleWorker(entry);
        worker.once('error', entry.idleErrorHandler);
        worker.once('exit', entry.idleExitHandler);
        worker.unref();
        return worker;
      }),
    };

    void entry.promise.catch(() => this.#removeFailedIdleWorker(entry, false));
    return entry;
  }

  #removeFailedIdleWorker(entry: IdleWorkerEntry, refill = true): void {
    entry.failed = true;
    this.#detachIdleWorker(entry);

    const index = this.#idleWorkers.indexOf(entry);
    if (index !== -1) {
      this.#idleWorkers.splice(index, 1);
      if (refill) {
        this.#fillIdleWorkers();
      }
    }
  }

  #detachIdleWorker(entry: IdleWorkerEntry): void {
    if (!entry.worker) {
      return;
    }

    if (entry.idleErrorHandler) {
      entry.worker.off('error', entry.idleErrorHandler);
    }
    if (entry.idleExitHandler) {
      entry.worker.off('exit', entry.idleExitHandler);
    }
    entry.idleErrorHandler = undefined;
    entry.idleExitHandler = undefined;
  }
}

let sharedCodeWorkerPool: AppExecutorCodeWorkerPool | undefined;

export function getSharedCodeWorkerPool(): AppExecutorCodeWorkerPool {
  sharedCodeWorkerPool ??= new AppExecutorCodeWorkerPool();
  return sharedCodeWorkerPool;
}

export async function prewarmSharedAppExecutorCodeWorkerPool(): Promise<void> {
  await getSharedCodeWorkerPool().prewarm();
}

export async function shutdownSharedAppExecutorCodeWorkerPool(): Promise<void> {
  await sharedCodeWorkerPool?.shutdown();
  sharedCodeWorkerPool = undefined;
}

function getConfiguredWorkerPoolSize(): number {
  const configuredValue = process.env[CODE_WORKER_POOL_SIZE_ENV];
  if (configuredValue == null || configuredValue.trim() === '') {
    return DEFAULT_CODE_WORKER_POOL_SIZE;
  }

  return normalizeWorkerPoolSize(Number(configuredValue));
}

function normalizeWorkerPoolSize(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_CODE_WORKER_POOL_SIZE;
}
