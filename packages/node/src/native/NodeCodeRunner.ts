import type { CodeRunner, CodeRunnerOptions, DataValue, Inputs, Outputs } from '@ironclad/rivet-core';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as process from 'node:process';

// Provide a CJS-style `require` to user-written Code Node scripts. Even though
// rivet-node is ESM, user code may need `require()` for third-party modules.
// The synthetic `.cjs` anchor tells Node to resolve from the current working dir.
const runtimeRequire = createRequire(join(process.cwd(), '__rivet_node_code_runner__.cjs'));

export class NodeCodeRunner implements CodeRunner {
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
    const outputs = await codeFunction(...args);

    return outputs;
  }
}
