import type { CodeRunner, CodeRunnerOptions, DataValue, Inputs, Outputs } from '@valerypopoff/rivet2-core';
import { createCodeRunnerRequire } from './codeRunnerRequire.js';
import { buildNodeCodeRunnerInvocation, compileNodeCodeRunnerFunction } from './nodeCodeRunnerInvocation.js';

export class NodeCodeRunner implements CodeRunner {
  private readonly runtimeRequire = createCodeRunnerRequire();

  async runCode(
    code: string,
    inputs: Inputs,
    options: CodeRunnerOptions,
    graphInputs?: Record<string, DataValue>,
    contextValues?: Record<string, DataValue>,
  ): Promise<Outputs> {
    const { argNames, args } = await buildNodeCodeRunnerInvocation({
      contextValues,
      graphInputs,
      inputs,
      loadRivet: () => import('@valerypopoff/rivet2-node'),
      options,
      runtimeRequire: this.runtimeRequire,
    });
    const codeFunction = compileNodeCodeRunnerFunction(argNames, code);
    const outputs = await codeFunction(...args);

    return outputs;
  }
}
