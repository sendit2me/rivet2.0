import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGraphRunner, type DataValue, type LooseDataValue, type NodeRunGraphOptions } from '../src/index.js';
import { setNativeRuntimeModuleLoaderForTesting } from '../src/nativeGraphRunner.js';
import {
  makeCallGraphFanInProject,
  makeControlFlowExclusionProject,
  makeExpressionChainProject,
  makeNativeGraphInputDefaultProject,
  makeNativeGraphInputDefaultPortProject,
  makeNativeGraphInputUnconnectedDefaultPortProject,
  makeNativeObjectPipelineProject,
  makeNativeSubgraphInputDataProject,
  makeNativeTextProcessingProject,
  makeNativeTextQuoteProcessingProject,
  makeObjectArrayConstructionProject,
  makeReferencedGraphAliasFanInProject,
  type RuntimeSpeedProjectFixture,
} from './runtimeSpeedFixtures.js';
import { withLocalNativeFastAdapterEnv } from './testUtils.js';

type RunOptions = {
  context?: Record<string, LooseDataValue>;
  inputs?: Record<string, LooseDataValue>;
  projectReferenceLoader?: NodeRunGraphOptions['projectReferenceLoader'];
};

type NativeEquivalenceCase = {
  expected: Record<string, DataValue>;
  fixture: RuntimeSpeedProjectFixture;
  name: string;
  options?: RunOptions;
};

void describe('native-fast equivalence fixtures', () => {
  void it('matches compatible TypeScript outputs for supported real-ish graph patterns', async () => {
    const referencedAlias = makeReferencedGraphAliasFanInProject(2);
    const cases: NativeEquivalenceCase[] = [
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'Ada ADA  ada ...' },
        },
        fixture: makeNativeTextProcessingProject(),
        name: 'supported text processors',
        options: {
          inputs: {
            input: ' Ada ',
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: '> Ada\n> LovelaceAda\nLovelace> > Ada\n> > Lovelace' },
        },
        fixture: makeNativeTextQuoteProcessingProject(),
        name: 'text quote processor',
        options: {
          inputs: {
            input: 'Ada\nLovelace',
          },
        },
      },
      {
        expected: {
          allRoles: { type: 'any[]', value: ['builder'] },
          cost: { type: 'number', value: 0 },
          profile: {
            type: 'object',
            value: {
              count: 3,
              profile: {
                name: 'Ada',
                role: 'builder',
              },
              tags: ['static', 'fallback'],
            },
          },
          role: { type: 'any', value: 'builder' },
          selected: { type: 'string', value: 'fallback' },
          summary: { type: 'string', value: 'Adabuilderfallback' },
        },
        fixture: makeNativeObjectPipelineProject(),
        name: 'object, destructure, extract, coalesce pipeline',
        options: {
          context: {
            role: 'builder',
          },
          inputs: {
            count: 3,
            fallback: 'fallback',
            name: 'Ada',
            preferred: { type: 'any', value: undefined },
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: '7 true' },
        },
        fixture: makeNativeGraphInputDefaultProject(),
        name: 'graph input defaults',
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'dynamic' },
        },
        fixture: makeNativeGraphInputDefaultPortProject(),
        name: 'graph input connected default port',
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: '' },
        },
        fixture: makeNativeGraphInputUnconnectedDefaultPortProject(),
        name: 'graph input unconnected default port',
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'livestatic' },
        },
        fixture: makeNativeSubgraphInputDataProject(),
        name: 'subgraph static input data',
        options: {
          inputs: {
            input: 'live',
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: {
            type: 'object[]',
            value: [{ name: 'Ada' }, { name: 'static' }],
          },
        },
        fixture: makeObjectArrayConstructionProject(),
        name: 'object array graph output',
        options: {
          inputs: {
            name: 'Ada',
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'control-flow-excluded', value: undefined },
        },
        fixture: makeControlFlowExclusionProject(),
        name: 'extract object path no-match exclusion',
        options: {
          inputs: {
            input: { type: 'object', value: { present: true } },
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'seedxseedx' },
        },
        fixture: referencedAlias,
        name: 'referenced graph alias fan-in',
        options: {
          inputs: {
            input: 'seed',
          },
          projectReferenceLoader: referencedAlias.projectReferenceLoader,
        },
      },
    ];

    for (const testCase of cases) {
      const typeScriptOutputs = await runCompatibleGraphRunner(testCase.fixture, testCase.options);
      assert.deepEqual(typeScriptOutputs, testCase.expected, `${testCase.name}: compatible output`);

      const nativeOutputs = await runNativeFastGraphRunner(testCase.fixture, testCase.options);
      assert.deepEqual(nativeOutputs, typeScriptOutputs, `${testCase.name}: native-fast output`);
    }
  });

  void it('keeps nearby unsupported graph patterns on whole-run TypeScript fallback', async () => {
    const cases: Array<
      NativeEquivalenceCase & {
        fallbackReason: string;
      }
    > = [
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'any', value: 7 },
        },
        fallbackReason: 'unsupported-node:expression:expression-0',
        fixture: makeExpressionChainProject(2),
        name: 'Expression chain',
        options: {
          inputs: {
            input: 5,
          },
        },
      },
      {
        expected: {
          cost: { type: 'number', value: 0 },
          result: { type: 'string', value: 'seedxseedx' },
        },
        fallbackReason: 'unsupported-node:graphReference:graph-reference',
        fixture: makeCallGraphFanInProject(2),
        name: 'Call Graph fan-in',
        options: {
          inputs: {
            input: 'seed',
          },
        },
      },
    ];

    for (const testCase of cases) {
      let nativeLoadCalls = 0;
      setNativeRuntimeModuleLoaderForTesting(async () => {
        nativeLoadCalls += 1;
        throw new Error(`${testCase.name} should fall back before loading native-fast.`);
      });

      try {
        const runner = createGraphRunner(testCase.fixture.project, {
          graph: testCase.fixture.graphId,
          runtimeProfile: 'native-fast',
        });

        try {
          const outputs = await runner.run({
            context: testCase.options?.context,
            inputs: testCase.options?.inputs,
          });

          assert.deepEqual(outputs, testCase.expected, `${testCase.name}: fallback output`);
          assert.equal(nativeLoadCalls, 0, `${testCase.name}: native module load count`);
          assert.deepEqual(
            runner.getNativeRuntimeDecision?.(),
            {
              fallbackReason: testCase.fallbackReason,
              nativeEligible: false,
              nativeUsed: false,
              requested: true,
            },
            `${testCase.name}: native decision`,
          );
        } finally {
          runner.dispose();
        }
      } finally {
        setNativeRuntimeModuleLoaderForTesting(undefined);
      }
    }
  });
});

async function runCompatibleGraphRunner(
  fixture: RuntimeSpeedProjectFixture,
  options: RunOptions = {},
): Promise<Record<string, DataValue>> {
  const { projectReferenceLoader, ...runOptions } = options;
  const runner = createGraphRunner(fixture.project, {
    graph: fixture.graphId,
    ...(projectReferenceLoader ? { projectReferenceLoader } : {}),
  });

  try {
    return await runner.run(runOptions);
  } finally {
    runner.dispose();
  }
}

async function runNativeFastGraphRunner(
  fixture: RuntimeSpeedProjectFixture,
  options: RunOptions = {},
): Promise<Record<string, DataValue>> {
  return withLocalNativeFastAdapterEnv(async () => {
    const { projectReferenceLoader, ...runOptions } = options;
    const runner = createGraphRunner(fixture.project, {
      graph: fixture.graphId,
      runtimeProfile: 'native-fast',
      ...(projectReferenceLoader ? { projectReferenceLoader } : {}),
    });

    try {
      const outputs = await runner.run(runOptions);
      const nativeDecision = runner.getNativeRuntimeDecision?.();
      assert.equal(nativeDecision?.nativeUsed, true, JSON.stringify(nativeDecision));
      assert.equal(nativeDecision?.nativeBackend, 'js-adapter', JSON.stringify(nativeDecision));
      return outputs;
    } finally {
      runner.dispose();
    }
  });
}
