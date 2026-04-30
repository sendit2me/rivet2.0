import type { CodeRunner, CodeRunnerOptions, DataValue, Inputs, Outputs } from '@ironclad/rivet-core';
import * as process from 'node:process';
import { createCodeRunnerRequire } from './codeRunnerRequire.js';

export class NodeCodeRunner implements CodeRunner {
  private readonly runtimeRequire = createCodeRunnerRequire();

  async runCode(
    code: string,
    inputs: Inputs,
    options: CodeRunnerOptions,
    graphInputs?: Record<string, DataValue>,
    contextValues?: Record<string, DataValue>,
  ): Promise<Outputs> {
    const argNames = ['inputs'];
    const args: any[] = [inputs];

    if (options.includeConsole) {
      argNames.push('console');
      args.push(console);
    }

    if (options.includeRequire) {
      argNames.push('require');
      args.push(this.runtimeRequire);
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
    const outputs = await codeFunction(...args);

    return outputs;
  }
}
