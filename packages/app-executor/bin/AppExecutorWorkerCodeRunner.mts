import type { CodeRunner, CodeRunnerOptions, DataValue, Inputs, Outputs } from '@ironclad/rivet-core';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as process from 'node:process';
import { Worker } from 'node:worker_threads';

type SerializedWorkerError = {
  message: string;
  name?: string;
  stack?: string;
};

type WorkerResponse =
  | {
      ok: true;
      outputs: Outputs;
    }
  | {
      error: SerializedWorkerError;
      ok: false;
    };

const runtimeRequire = createRequire(join(process.cwd(), '__rivet_node_code_runner__.cjs'));

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
const { join } = require('node:path');

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

async function runCode() {
  const { code, contextValues, graphInputs, inputs, options } = workerData;
  const argNames = ['inputs'];
  const args = [inputs];

  if (options.includeConsole) {
    argNames.push('console');
    args.push(console);
  }

  if (options.includeRequire) {
    argNames.push('require');
    args.push(createRequire(join(process.cwd(), '__rivet_node_code_runner__.cjs')));
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
      parentPort.postMessage({ ok: true, outputs });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: serializeError(error) });
    }
  },
  (error) => parentPort.postMessage({ ok: false, error: serializeError(error) }),
);
`;

export class AppExecutorWorkerCodeRunner implements CodeRunner {
  async runCode(
    code: string,
    inputs: Inputs,
    options: CodeRunnerOptions,
    graphInputs?: Record<string, DataValue>,
    contextValues?: Record<string, DataValue>,
  ): Promise<Outputs> {
    if (options.includeRivet) {
      return runCodeInCurrentThread(code, inputs, options, graphInputs, contextValues);
    }

    return runCodeInWorker(code, inputs, options, graphInputs, contextValues);
  }
}

async function runCodeInWorker(
  code: string,
  inputs: Inputs,
  options: CodeRunnerOptions,
  graphInputs?: Record<string, DataValue>,
  contextValues?: Record<string, DataValue>,
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
      },
    });
    let settled = false;

    const cleanup = () => {
      worker.removeAllListeners();
      void worker.terminate();
    };

    worker.once('message', (response: WorkerResponse) => {
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
  graphInputs?: Record<string, DataValue>,
  contextValues?: Record<string, DataValue>,
): Promise<Outputs> {
  const argNames = ['inputs'];
  const args: unknown[] = [inputs];

  if (options.includeConsole) {
    argNames.push('console');
    args.push(console);
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
    const Rivet = await import('@ironclad/rivet-node');

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
