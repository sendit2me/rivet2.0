import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createGraphRunner,
  type CodeRunner,
  type DataValue,
  type Inputs,
  type Outputs,
} from '../src/index.js';
import {
  makeAbortSignalProject,
  makeAsyncDelayProject,
  makeCodeChainProject,
  makeGlobalStateProject,
  makeInputContextTextProject,
  makeTextChainProject,
} from './runtimeSpeedFixtures.js';

class CountingCodeRunner implements CodeRunner {
  calls = 0;

  async runCode(_code: string, inputs: Inputs): Promise<Outputs> {
    this.calls += 1;
    const inputValue = Number(inputs.input?.value ?? 0);

    return {
      output: { type: 'any', value: inputValue + this.calls },
    } satisfies Outputs;
  }
}

void describe('createGraphRunner', () => {
  void it('reuses stable Node setup while accepting per-run inputs and context', async () => {
    const fixture = makeInputContextTextProject();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
    });

    const firstOutputs = await runner.run({
      context: { suffix: 'first' },
      inputs: { input: 'a' },
    });
    const secondOutputs = await runner.run({
      context: { suffix: 'second' },
      inputs: { input: 'b' },
    });

    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'a first' },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'b second' },
    } satisfies Record<string, DataValue>);
  });

  void it('runs overlapping calls without sharing a running processor', async () => {
    const fixture = makeAsyncDelayProject(20);
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
    });

    const [firstOutputs, secondOutputs] = await Promise.all([
      runner.run({ inputs: { input: 'first' } }),
      runner.run({ inputs: { input: 'second' } }),
    ]);

    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'first' },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'second' },
    } satisfies Record<string, DataValue>);
  });

  void it('honors per-run abort signals', async () => {
    const fixture = makeAbortSignalProject(20);
    const controller = new AbortController();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      onNodeStart: () => {
        controller.abort();
      },
    });

    await assert.rejects(
      () =>
        runner.run({
          abortSignal: controller.signal,
          inputs: { input: 'abort seed' },
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /failed to process due to errors in nodes/);
        assert.ok(error.cause instanceof Error);
        assert.match(error.cause.message, /Aborted|Processing aborted/);
        return true;
      },
    );
  });

  void it('rejects future runs after dispose', async () => {
    const fixture = makeInputContextTextProject();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
    });

    runner.dispose();

    await assert.rejects(() => runner.run(), /Cannot run a disposed graph runner/);
  });

  void it('does not leak GraphProcessor globals between runs', async () => {
    const fixture = makeGlobalStateProject();
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
    });

    const firstOutputs = await runner.run({
      inputs: { input: 'first' },
    });
    const secondOutputs = await runner.run({
      inputs: { input: 'second' },
    });

    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      previousResult: { type: 'string', value: '' },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      previousResult: { type: 'string', value: '' },
    } satisfies Record<string, DataValue>);
  });

  void it('prefers custom runtime providers', async () => {
    const fixture = makeCodeChainProject(1);
    const codeRunner = new CountingCodeRunner();
    const runner = createGraphRunner(fixture.project, {
      codeRunner,
      graph: fixture.graphId,
    });

    const firstOutputs = await runner.run({
      inputs: { input: 10 },
    });
    const secondOutputs = await runner.run({
      inputs: { input: 20 },
    });

    assert.equal(codeRunner.calls, 2);
    assert.deepEqual(firstOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'any', value: 11 },
    } satisfies Record<string, DataValue>);
    assert.deepEqual(secondOutputs, {
      cost: { type: 'number', value: 0 },
      result: { type: 'any', value: 22 },
    } satisfies Record<string, DataValue>);
  });

  void it('ignores removed runtime-profile values from untyped callers', async () => {
    const fixture = makeTextChainProject(1);
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      runtimeProfile: 'removed-runtime-profile',
    } as Parameters<typeof createGraphRunner>[1] & { runtimeProfile: string });

    assert.deepEqual(await runner.run({ inputs: { input: 'a' } }), {
      cost: { type: 'number', value: 0 },
      result: { type: 'string', value: 'ax' },
    } satisfies Record<string, DataValue>);
  });
});
