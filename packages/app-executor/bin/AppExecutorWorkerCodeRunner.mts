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

type SerializedWorkerError = {
  message: string;
  name?: string;
  stack?: string;
};

type WorkerResponse =
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
const { parentPort, workerData } = require('node:worker_threads');
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

async function runCode() {
  const { code, contextValues, graphInputs, inputs, options, requireAnchorPath } = workerData;
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

runCode().then(
  (outputs) => {
    try {
      parentPort.postMessage({ type: 'result', ok: true, outputs });
    } catch (error) {
      parentPort.postMessage({ type: 'result', ok: false, error: serializeError(error) });
    }
  },
  (error) => parentPort.postMessage({ type: 'result', ok: false, error: serializeError(error) }),
);
`;

export class AppExecutorWorkerCodeRunner implements CodeRunner {
  private readonly runtimeRequire = createCodeRunnerRequire();

  constructor(private readonly onConsole?: (message: CodeConsoleMessage) => void) {}

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
      // The app sidecar isolates ordinary Code node JavaScript in workers, but
      // Rivet-capable code imports @valerypopoff/rivet2-node. Keep that path on the
      // current thread so packaged sidecar module resolution stays compatible.
      return runCodeInCurrentThread(code, inputs, options, graphInputs, contextValues, this.runtimeRequire, this.onConsole);
    }

    return runCodeInWorker(code, inputs, options, graphInputs, contextValues, this.onConsole);
  }
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
): Promise<Outputs> {
  return await new Promise<Outputs>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        code,
        contextValues,
        graphInputs,
        inputs,
        options,
        requireAnchorPath: getCodeRunnerRequireAnchorPath(),
      },
    });
    let settled = false;

    const cleanup = () => {
      worker.removeAllListeners();
      void worker.terminate();
    };

    worker.on('message', (response: WorkerResponse) => {
      if (response.type === 'console') {
        emitConsoleMessage(onConsole, response.message);
        return;
      }

      settled = true;
      cleanup();

      if (response.ok) {
        resolve(response.outputs);
      } else {
        reject(deserializeWorkerError(response.error));
      }
    });

    worker.once('error', (error) => {
      settled = true;
      cleanup();
      reject(error);
    });

    worker.once('exit', (code) => {
      if (!settled) {
        reject(
          new Error(
            code === 0
              ? 'Code worker exited before returning outputs.'
              : `Code worker exited before returning outputs with exit code ${code}.`,
          ),
        );
      }
    });
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
    // Console forwarding is observability-only and must not change Code node execution.
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
