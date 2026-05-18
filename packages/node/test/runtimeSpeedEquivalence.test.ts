import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProcessor,
  createGraphRunner,
  runGraph,
  type DataValue,
  type LooseDataValue,
  type NodeRunGraphOptions,
} from '../src/index.js';
import {
  makeAbortSignalProject,
  makeAsyncDelayProject,
  makeBranchingTextProject,
  makeCodeChainProject,
  makeControlFlowExclusionProject,
  makeExpressionChainProject,
  makeGlobalStateProject,
  makeInputContextTextProject,
  makeMissingRequiredInputProject,
  makeThrowingCodeProject,
  runRuntimeSpeedProcessor,
  type RuntimeSpeedProjectFixture,
} from './runtimeSpeedFixtures.js';

type RunOptions = {
  context?: Record<string, LooseDataValue>;
  inputs?: Record<string, LooseDataValue>;
};

type RuntimeMode = {
  name: string;
  run: (fixture: RuntimeSpeedProjectFixture, options?: RunOptions) => Promise<Record<string, DataValue>>;
};

const publicRuntimeModes: RuntimeMode[] = [
  {
    name: 'runGraph',
    run: (fixture, options = {}) =>
      runGraph(fixture.project, {
        graph: fixture.graphId,
        ...options,
      }),
  },
  {
    name: 'createProcessor.run',
    run: async (fixture, options = {}) => {
      const processor = createProcessor(fixture.project, {
        graph: fixture.graphId,
        ...options,
      });
      return processor.run();
    },
  },
  {
    name: 'createGraphRunner.run',
    run: async (fixture, options = {}) => {
      const {
        abortSignal,
        context,
        inputs,
        ...runnerOptions
      } = options as NodeRunGraphOptions;
      const runner = createGraphRunner(fixture.project, {
        graph: fixture.graphId,
        ...runnerOptions,
      });
      return runner.run({
        abortSignal,
        context,
        inputs,
      });
    },
  },
];

const allRuntimeModes: RuntimeMode[] = [
  ...publicRuntimeModes,
  {
    name: 'direct GraphProcessor',
    run: runRuntimeSpeedProcessor,
  },
];

async function collectOutputs(
  fixture: RuntimeSpeedProjectFixture,
  options: RunOptions = {},
  modes = allRuntimeModes,
): Promise<Record<string, Record<string, DataValue>>> {
  const outputsByMode: Record<string, Record<string, DataValue>> = {};

  for (const mode of modes) {
    outputsByMode[mode.name] = await mode.run(fixture, options);
  }

  return outputsByMode;
}

function assertModeOutputsEqual(
  outputsByMode: Record<string, Record<string, DataValue>>,
  expected: Record<string, DataValue>,
  label = 'outputs',
): void {
  for (const [modeName, outputs] of Object.entries(outputsByMode)) {
    assert.deepEqual(outputs, expected, `${label}: ${modeName}`);
  }
}

async function runPublicModeError(
  mode: RuntimeMode,
  fixture: RuntimeSpeedProjectFixture,
  options: NodeRunGraphOptions,
): Promise<Error> {
  try {
    await mode.run(fixture, options);
  } catch (error) {
    assert.ok(error instanceof Error, `${mode.name} should reject with an Error`);
    return error;
  }

  throw new Error(`${mode.name} unexpectedly resolved`);
}

void describe('runtime speed equivalence guards', () => {
  void it('pins repeated per-run input and context conversion across compatible runtime paths', async () => {
    const fixture = makeInputContextTextProject();

    const firstOutputs = await collectOutputs(fixture, {
      context: {
        suffix: 'first',
      },
      inputs: {
        input: 'a',
      },
    });
    const secondOutputs = await collectOutputs(fixture, {
      context: {
        suffix: 'second',
      },
      inputs: {
        input: 'b',
      },
    });

    assertModeOutputsEqual(
      firstOutputs,
      {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'a first' },
      },
      'first run',
    );
    assertModeOutputsEqual(
      secondOutputs,
      {
        cost: { type: 'number', value: 0 },
        result: { type: 'string', value: 'b second' },
      },
      'second run',
    );
  });

  void it('pins repeated runs with processor globals as run-scoped public API behavior', async () => {
    const fixture = makeGlobalStateProject();

    const firstOutputs = await collectOutputs(fixture, {
      inputs: {
        input: 'first',
      },
    });
    const secondOutputs = await collectOutputs(fixture, {
      inputs: {
        input: 'second',
      },
    });

    assertModeOutputsEqual(
      firstOutputs,
      {
        cost: { type: 'number', value: 0 },
        previousResult: { type: 'string', value: '' },
      },
      'first global run',
    );
    assertModeOutputsEqual(
      secondOutputs,
      {
        cost: { type: 'number', value: 0 },
        previousResult: { type: 'string', value: '' },
      },
      'second global run',
    );
  });

  void it('pins branching DAG, async node, missing required input, and control-flow exclusion outputs', async () => {
    const cases: Array<{
      expected: Record<string, DataValue>;
      fixture: RuntimeSpeedProjectFixture;
      name: string;
      options?: RunOptions;
    }> = [
      {
        expected: {
          cost: { type: 'number', value: 0 },
          leftResult: { type: 'string', value: 'seed left' },
          rightResult: { type: 'string', value: 'seed right' },
        },
        fixture: makeBranchingTextProject(),
        name: 'branching DAG',
        options: {
          inputs: {
            input: 'seed',
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'async seed' },
        },
        fixture: makeAsyncDelayProject(1),
        name: 'async Delay node',
        options: {
          inputs: {
            input: 'async seed',
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'control-flow-excluded', value: undefined },
        },
        fixture: makeMissingRequiredInputProject(),
        name: 'missing required input',
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'control-flow-excluded', value: undefined },
        },
        fixture: makeControlFlowExclusionProject(),
        name: 'control-flow exclusion',
        options: {
          inputs: {
            input: { type: 'object', value: { present: true } },
          },
        },
      },
    ];

    for (const testCase of cases) {
      const outputsByMode = await collectOutputs(testCase.fixture, testCase.options);
      assertModeOutputsEqual(outputsByMode, testCase.expected, testCase.name);
    }
  });

  void it('pins Code and Expression output equivalence across compatible runtime paths', async () => {
    const cases: Array<{
      expected: Record<string, DataValue>;
      fixture: RuntimeSpeedProjectFixture;
      name: string;
    }> = [
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'any', value: 8 },
        },
        fixture: makeExpressionChainProject(3),
        name: 'Expression chain',
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'any', value: 8 },
        },
        fixture: makeCodeChainProject(3),
        name: 'Code chain',
      },
    ];

    for (const testCase of cases) {
      const outputsByMode = await collectOutputs(testCase.fixture, {
        inputs: {
          input: 5,
        },
      });
      assertModeOutputsEqual(outputsByMode, testCase.expected, testCase.name);
    }
  });

  void it('pins thrown Code errors across public Node APIs', async () => {
    const fixture = makeThrowingCodeProject();
    const errors = await Promise.all(
      publicRuntimeModes.map((mode) => runPublicModeError(mode, fixture, { graph: fixture.graphId })),
    );

    assert.equal(errors.length, publicRuntimeModes.length);
    for (const error of errors) {
      assert.match(error.message, /failed to process due to errors in nodes/);
      assert.ok(error.cause instanceof Error);
      assert.match(error.cause.message, /runtime speed guard failure/);
    }
    for (const error of errors.slice(1)) {
      assert.equal(errors[0]!.message, error.message);
      assert.equal((errors[0]!.cause as Error).message, (error.cause as Error).message);
    }
  });

  void it('pins abort signal behavior across public Node APIs', async () => {
    const fixture = makeAbortSignalProject(20);

    for (const mode of publicRuntimeModes) {
      const controller = new AbortController();
      const error = await runPublicModeError(mode, fixture, {
        graph: fixture.graphId,
        inputs: {
          input: 'abort seed',
        },
        abortSignal: controller.signal,
        onNodeStart: () => {
          controller.abort();
        },
      });

      assert.match(error.message, /failed to process due to errors in nodes/, mode.name);
      assert.ok(error.cause instanceof Error, mode.name);
      assert.match(error.cause.message, /Aborted|Processing aborted/, mode.name);
    }
  });
});
