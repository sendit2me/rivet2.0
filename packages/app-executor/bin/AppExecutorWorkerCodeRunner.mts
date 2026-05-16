import type {
  CodeConsoleLevel,
  CodeConsoleMessage,
  CodeRunner,
  CodeRunnerOptions,
  DataValue,
  Inputs,
  Outputs,
} from '@valerypopoff/rivet2-core';
import * as process from 'node:process';
import { inspect } from 'node:util';
import { Worker } from 'node:worker_threads';
import { createCodeRunnerRequire, getCodeRunnerRequireAnchorPath } from './codeRunnerRequire.mjs';

const DEFAULT_CODE_WORKER_POOL_SIZE = 2;
const CODE_WORKER_POOL_SIZE_ENV = 'RIVET_CODE_RUNNER_WORKER_POOL_SIZE';

type SerializedWorkerError = {
  message: string;
  name?: string;
  stack?: string;
};

type WorkerResponse =
  | {
      type: 'ready';
    }
  | {
      type: 'result';
      ok: true;
      outputs: Outputs;
    }
  | {
      type: 'result';
      error: SerializedWorkerError;
      ok: false;
    }
  | {
      type: 'console';
      message: CodeConsoleMessage;
    };

const WORKER_SOURCE = String.raw`
const { parentPort } = require('node:worker_threads');
const { createRequire } = require('node:module');
const { inspect } = require('node:util');

const CONSOLE_LEVELS = ['debug', 'error', 'info', 'log', 'warn'];

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function serializeConsoleArg(arg) {
  if (typeof arg === 'string') {
    return arg;
  }

  return inspect(arg, {
    breakLength: 120,
    depth: 6,
    maxArrayLength: 100,
    maxStringLength: 10000,
  });
}

function createBridgedConsole() {
  const bridgedConsole = Object.create(console);

  for (const level of CONSOLE_LEVELS) {
    bridgedConsole[level] = (...args) => {
      parentPort.postMessage({
        type: 'console',
        message: {
          level,
          args: args.map(serializeConsoleArg),
        },
      });
    };
  }

  return bridgedConsole;
}

async function runCode(request) {
  const { code, contextValues, graphInputs, inputs, options, requireAnchorPath } = request;
  const argNames = ['inputs'];
  const args = [inputs];

  if (options.includeConsole) {
    argNames.push('console');
    args.push(createBridgedConsole());
  }

  if (options.includeRequire) {
    argNames.push('require');
    args.push(createRequire(requireAnchorPath));
  }

  if (options.includeProcess) {
    argNames.push('process');
    args.push(process);
  }

  if (options.includeFetch) {
    argNames.push('fetch');
    args.push(fetch);
  }

  if (graphInputs) {
    argNames.push('graphInputs');
    args.push(graphInputs);
  }

  if (contextValues) {
    argNames.push('context');
    args.push(contextValues);
  }

  argNames.push(code);

  const AsyncFunction = async function () {}.constructor;
  const codeFunction = new AsyncFunction(...argNames);
  return await codeFunction(...args);
}

parentPort.postMessage({ type: 'ready' });

parentPort.once('message', (request) => {
  if (!request || request.type !== 'run') {
    parentPort.postMessage({
      type: 'result',
      ok: false,
      error: serializeError(new Error('Code worker received an invalid run request.')),
    });
    return;
  }

  runCode(request).then(
    (outputs) => {
      try {
        parentPort.postMessage({ type: 'result', ok: true, outputs });
      } catch (error) {
        parentPort.postMessage({ type: 'result', ok: false, error: serializeError(error) });
      }
    },
    (error) => parentPort.postMessage({ type: 'result', ok: false, error: serializeError(error) }),
  );
});
`;

type AppExecutorCodeWorkerPoolOptions = {
  size?: number;
};

type CodeWorkerRunRequest = {
  code: string;
  contextValues: Record<string, DataValue> | undefined;
  graphInputs: Record<string, DataValue> | undefined;
  inputs: Inputs;
  options: CodeRunnerOptions;
  requireAnchorPath: string;
  type: 'run';
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
    return createReadyWorker();
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

export class AppExecutorWorkerCodeRunner implements CodeRunner {
  private readonly runtimeRequire = createCodeRunnerRequire();

  constructor(
    private readonly onConsole?: (message: CodeConsoleMessage) => void,
    private readonly options: { workerPool?: AppExecutorCodeWorkerPool } = {},
  ) {}

  async runCode(
    code: string,
    inputs: Inputs,
    options: CodeRunnerOptions,
    graphInputs?: Record<string, DataValue>,
    contextValues?: Record<string, DataValue>,
  ): Promise<Outputs> {
    if (options.includeRequire || options.includeRivet) {
      await prepareRuntimeLibrariesForCodeRunner();
    }

    if (options.includeRivet) {
      // The app sidecar isolates ordinary Code-family JavaScript in workers, but
      // Rivet-capable code imports @valerypopoff/rivet2-node. Keep that path on the
      // current thread so packaged sidecar module resolution stays compatible.
      return runCodeInCurrentThread(code, inputs, options, graphInputs, contextValues, this.runtimeRequire, this.onConsole);
    }

    return runCodeInWorker(
      code,
      inputs,
      options,
      graphInputs,
      contextValues,
      this.onConsole,
      this.options.workerPool ?? getSharedCodeWorkerPool(),
    );
  }
}

export async function prewarmSharedAppExecutorCodeWorkerPool(): Promise<void> {
  await getSharedCodeWorkerPool().prewarm();
}

export async function shutdownSharedAppExecutorCodeWorkerPool(): Promise<void> {
  await sharedCodeWorkerPool?.shutdown();
  sharedCodeWorkerPool = undefined;
}

async function prepareRuntimeLibrariesForCodeRunner() {
  const prepare = (
    globalThis as typeof globalThis & {
      __RIVET_PREPARE_RUNTIME_LIBRARIES__?: (force?: boolean) => Promise<void> | void;
    }
  ).__RIVET_PREPARE_RUNTIME_LIBRARIES__;

  if (typeof prepare === 'function') {
    await prepare(true);
  }
}

async function runCodeInWorker(
  code: string,
  inputs: Inputs,
  options: CodeRunnerOptions,
  graphInputs: Record<string, DataValue> | undefined,
  contextValues: Record<string, DataValue> | undefined,
  onConsole?: (message: CodeConsoleMessage) => void,
  workerPool = getSharedCodeWorkerPool(),
): Promise<Outputs> {
  return workerPool.run(
    {
      code,
      contextValues,
      graphInputs,
      inputs,
      options,
      requireAnchorPath: getCodeRunnerRequireAnchorPath(),
      type: 'run',
    },
    onConsole,
  );
}

function getSharedCodeWorkerPool(): AppExecutorCodeWorkerPool {
  sharedCodeWorkerPool ??= new AppExecutorCodeWorkerPool();
  return sharedCodeWorkerPool;
}

function createReadyWorker(): Promise<Worker> {
  const worker = new Worker(WORKER_SOURCE, { eval: true });

  return new Promise<Worker>((resolve, reject) => {
    let ready = false;

    const cleanup = () => {
      worker.off('message', handleMessage);
      worker.off('error', handleError);
      worker.off('exit', handleExit);
    };

    const fail = (error: Error) => {
      cleanup();
      void worker.terminate();
      reject(error);
    };

    const handleMessage = (response: WorkerResponse) => {
      if (response.type !== 'ready') {
        return;
      }

      ready = true;
      cleanup();
      resolve(worker);
    };

    const handleError = (error: Error) => {
      fail(error);
    };

    const handleExit = (code: number) => {
      if (!ready) {
        fail(
          new Error(
            code === 0
              ? 'Code worker exited before becoming ready.'
              : `Code worker exited before becoming ready with exit code ${code}.`,
          ),
        );
      }
    };

    worker.on('message', handleMessage);
    worker.once('error', handleError);
    worker.once('exit', handleExit);
  });
}

async function runCodeOnReadyWorker(
  worker: Worker,
  request: CodeWorkerRunRequest,
  onConsole?: (message: CodeConsoleMessage) => void,
): Promise<Outputs> {
  worker.ref();

  return await new Promise<Outputs>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      worker.off('message', handleMessage);
      worker.off('error', handleError);
      worker.off('exit', handleExit);
      void worker.terminate();
    };

    const handleMessage = (response: WorkerResponse) => {
      if (response.type === 'console') {
        emitConsoleMessage(onConsole, response.message);
        return;
      }
      if (response.type !== 'result') {
        return;
      }

      settled = true;
      cleanup();

      if (response.ok) {
        resolve(response.outputs);
      } else {
        reject(deserializeWorkerError(response.error));
      }
    };

    const handleError = (error: Error) => {
      settled = true;
      cleanup();
      reject(error);
    };

    const handleExit = (code: number) => {
      if (!settled) {
        cleanup();
        reject(
          new Error(
            code === 0
              ? 'Code worker exited before returning outputs.'
              : `Code worker exited before returning outputs with exit code ${code}.`,
          ),
        );
      }
    };

    worker.on('message', handleMessage);
    worker.once('error', handleError);
    worker.once('exit', handleExit);

    try {
      worker.postMessage(request);
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

async function runCodeInCurrentThread(
  code: string,
  inputs: Inputs,
  options: CodeRunnerOptions,
  graphInputs: Record<string, DataValue> | undefined,
  contextValues: Record<string, DataValue> | undefined,
  runtimeRequire: NodeJS.Require,
  onConsole?: (message: CodeConsoleMessage) => void,
): Promise<Outputs> {
  const argNames = ['inputs'];
  const args: unknown[] = [inputs];

  if (options.includeConsole) {
    argNames.push('console');
    args.push(createBridgedConsole(onConsole));
  }

  if (options.includeRequire) {
    argNames.push('require');
    args.push(runtimeRequire);
  }

  if (options.includeProcess) {
    argNames.push('process');
    args.push(process);
  }

  if (options.includeFetch) {
    argNames.push('fetch');
    args.push(fetch);
  }

  if (options.includeRivet) {
    const Rivet = await import('@valerypopoff/rivet2-node');

    argNames.push('Rivet');
    args.push(Rivet);
  }

  if (graphInputs) {
    argNames.push('graphInputs');
    args.push(graphInputs);
  }

  if (contextValues) {
    argNames.push('context');
    args.push(contextValues);
  }

  argNames.push(code);

  const AsyncFunction = async function () {}.constructor as new (...args: string[]) => Function;
  const codeFunction = new AsyncFunction(...argNames);
  return (await codeFunction(...args)) as Outputs;
}

const CONSOLE_LEVELS: CodeConsoleLevel[] = ['debug', 'error', 'info', 'log', 'warn'];

function createBridgedConsole(onConsole?: (message: CodeConsoleMessage) => void) {
  const bridgedConsole = Object.create(console) as Pick<Console, CodeConsoleLevel>;

  for (const level of CONSOLE_LEVELS) {
    bridgedConsole[level] = (...args: unknown[]) => {
      emitConsoleMessage(onConsole, {
        level,
        args: args.map(serializeConsoleArg),
      });
    };
  }

  return bridgedConsole;
}

function emitConsoleMessage(onConsole: ((message: CodeConsoleMessage) => void) | undefined, message: CodeConsoleMessage) {
  try {
    onConsole?.(message);
  } catch {
    // Console forwarding is observability-only and must not change Code-family execution.
  }
}

function serializeConsoleArg(arg: unknown): unknown {
  if (typeof arg === 'string') {
    return arg;
  }

  return inspect(arg, {
    breakLength: 120,
    depth: 6,
    maxArrayLength: 100,
    maxStringLength: 10000,
  });
}

function deserializeWorkerError(error: SerializedWorkerError): Error {
  const ErrorCtor = getErrorConstructor(error.name);
  const deserialized = new ErrorCtor(error.message);
  if (error.name) {
    deserialized.name = error.name;
  }
  if (error.stack) {
    deserialized.stack = error.stack;
  }

  return deserialized;
}

function getErrorConstructor(name?: string): ErrorConstructor {
  switch (name) {
    case 'EvalError':
      return EvalError;
    case 'RangeError':
      return RangeError;
    case 'ReferenceError':
      return ReferenceError;
    case 'SyntaxError':
      return SyntaxError;
    case 'TypeError':
      return TypeError;
    case 'URIError':
      return URIError;
    default:
      return Error;
  }
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
