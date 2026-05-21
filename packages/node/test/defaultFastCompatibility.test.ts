import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProcessor,
  ExecutionRecorder,
  globalRivetNodeRegistry,
  type ChartNode,
  type CodeRunner,
  type DataValue,
  type GraphId,
  type Inputs,
  type NodeCreateProcessorOptions,
  type NodeId,
  type NodeImpl,
  type NodeRegistration,
  type NodeRunGraphOptions,
  type Outputs,
  type PortId,
  type ProcessEvents,
  type Project,
  type ProjectId,
  type ProjectReference,
  type ProjectReferenceLoader,
  type RecordedEvents,
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
  makeMixedSubgraphFanInProject,
  makeRaiseEventProject,
  makeRepeatedSubgraphFanInProject,
  makeSameSourceFanInProject,
  makeSubgraphChainProject,
  makeSyntaxErrorCodeProject,
  makeThrowingCodeProject,
  makeWideTextFanInProject,
  type RuntimeSpeedProjectFixture,
} from './runtimeSpeedFixtures.js';

type RuntimeProfile = NodeCreateProcessorOptions['runtimeProfile'];

type CapturedEvent = {
  data: unknown;
  type: string;
};

type CapturedCallbackOptions = ReturnType<typeof createCallbackCapture>;

type ProfileRunOptions = Omit<NodeCreateProcessorOptions, 'graph' | 'runtimeProfile' | keyof CapturedCallbackOptions> & {
  beforeNodeStart?: (event: ProcessEvents['nodeStart']) => void;
  project?: Project;
};

type ProfileRun =
  | {
      callbacks: CapturedEvent[];
      outputs: Record<string, DataValue>;
      recorderEvents: CapturedEvent[];
      status: 'resolved';
    }
  | {
      callbacks: CapturedEvent[];
      error: unknown;
      recorderEvents: CapturedEvent[];
      status: 'rejected';
    };

class CountingCodeRunner implements CodeRunner {
  calls = 0;

  async runCode(_code: string, inputs: Inputs): Promise<Outputs> {
    this.calls += 1;

    return {
      output: {
        type: 'any',
        value: Number(inputs.input?.value ?? 0) + 1,
      },
    };
  }
}

function cloneProject(project: Project): Project {
  return structuredClone(project) as Project;
}

function createCallbackCapture(events: CapturedEvent[]): Pick<
  NodeCreateProcessorOptions,
  | 'onAbort'
  | 'onDone'
  | 'onGraphAbort'
  | 'onGraphError'
  | 'onGraphFinish'
  | 'onGraphStart'
  | 'onNodeError'
  | 'onNodeExcluded'
  | 'onNodeFinish'
  | 'onNodeOutputsCleared'
  | 'onNodeStart'
  | 'onPartialOutput'
  | 'onStart'
  | 'onTrace'
  | 'onUserInput'
> {
  const push = <T extends keyof ProcessEvents>(type: T, data: ProcessEvents[T]) => {
    events.push(normalizeProcessEvent(type, data));
  };

  return {
    onAbort: (data) => push('abort', data),
    onDone: (data) => push('done', data),
    onGraphAbort: (data) => push('graphAbort', data),
    onGraphError: (data) => push('graphError', data),
    onGraphFinish: (data) => push('graphFinish', data),
    onGraphStart: (data) => push('graphStart', data),
    onNodeError: (data) => push('nodeError', data),
    onNodeExcluded: (data) => push('nodeExcluded', data),
    onNodeFinish: (data) => push('nodeFinish', data),
    onNodeOutputsCleared: (data) => push('nodeOutputsCleared', data),
    onNodeStart: (data) => push('nodeStart', data),
    onPartialOutput: (data) => push('partialOutput', data),
    onStart: (data) => push('start', data),
    onTrace: (data) => push('trace', data),
    onUserInput: (data) => {
      push('userInput', data);
      data.callback({ type: 'string[]', value: ['response from test'] });
    },
  };
}

async function runProfile(
  fixture: RuntimeSpeedProjectFixture,
  runtimeProfile: RuntimeProfile,
  options: ProfileRunOptions = {},
): Promise<ProfileRun> {
  const {
    beforeNodeStart,
    project = cloneProject(fixture.project),
    ...processorOptions
  } = options;
  const callbackEvents: CapturedEvent[] = [];
  const callbackCapture = createCallbackCapture(callbackEvents);
  const processor = createProcessor(project, {
    ...processorOptions,
    ...callbackCapture,
    graph: fixture.graphId,
    onNodeStart: (event) => {
      callbackCapture.onNodeStart?.(event);
      beforeNodeStart?.(event);
    },
    runtimeProfile,
  });
  const recorder = new ExecutionRecorder();
  recorder.record(processor.processor);

  try {
    const outputs = await processor.run();
    return {
      callbacks: callbackEvents,
      outputs,
      recorderEvents: normalizeRecorderEvents(recorder),
      status: 'resolved',
    };
  } catch (error) {
    return {
      callbacks: callbackEvents,
      error: normalizeError(error),
      recorderEvents: normalizeRecorderEvents(recorder),
      status: 'rejected',
    };
  }
}

async function runBothProfiles(
  fixture: RuntimeSpeedProjectFixture,
  options: ProfileRunOptions = {},
): Promise<{ compatible: ProfileRun; fast: ProfileRun }> {
  return {
    compatible: await runProfile(fixture, 'compatible', options),
    fast: await runProfile(fixture, 'headless-fast', options),
  };
}

async function runAllProfiles(
  fixture: RuntimeSpeedProjectFixture,
  options: ProfileRunOptions = {},
): Promise<{ compatible: ProfileRun; defaultSafe: ProfileRun; fast: ProfileRun }> {
  return {
    compatible: await runProfile(fixture, 'compatible', options),
    defaultSafe: await runProfile(fixture, undefined, options),
    fast: await runProfile(fixture, 'headless-fast', options),
  };
}

function assertProfileRunsEqual(compatible: ProfileRun, fast: ProfileRun, label: string): void {
  assert.deepEqual(fast, compatible, label);
}

function normalizeProcessEvent<T extends keyof ProcessEvents>(type: T, data: ProcessEvents[T]): CapturedEvent {
  switch (type) {
    case 'start': {
      const event = data as ProcessEvents['start'];
      return {
        data: {
          contextValues: normalizeRecord(event.contextValues),
          inputs: normalizeRecord(event.inputs),
          projectId: event.project.metadata.id,
          startGraphId: event.startGraph.metadata?.id,
        },
        type,
      };
    }

    case 'graphStart': {
      const event = data as ProcessEvents['graphStart'];
      return {
        data: {
          graphId: event.graph.metadata?.id,
          inputs: normalizeRecord(event.inputs),
        },
        type,
      };
    }

    case 'graphFinish': {
      const event = data as ProcessEvents['graphFinish'];
      return {
        data: {
          graphId: event.graph.metadata?.id,
          outputs: normalizeRecord(event.outputs),
        },
        type,
      };
    }

    case 'graphError': {
      const event = data as ProcessEvents['graphError'];
      return {
        data: {
          error: normalizeError(event.error),
          graphId: event.graph.metadata?.id,
        },
        type,
      };
    }

    case 'graphAbort': {
      const event = data as ProcessEvents['graphAbort'];
      return {
        data: {
          error: event.error == null ? undefined : normalizeError(event.error),
          graphId: event.graph.metadata?.id,
          successful: event.successful,
        },
        type,
      };
    }

    case 'nodeStart': {
      const event = data as ProcessEvents['nodeStart'];
      return {
        data: {
          inputs: normalizeRecord(event.inputs),
          nodeId: event.node.id,
          nodeType: event.node.type,
        },
        type,
      };
    }

    case 'nodeFinish': {
      const event = data as ProcessEvents['nodeFinish'];
      return {
        data: {
          nodeId: event.node.id,
          nodeType: event.node.type,
          outputs: normalizeRecord(event.outputs),
        },
        type,
      };
    }

    case 'nodeError': {
      const event = data as ProcessEvents['nodeError'];
      return {
        data: {
          error: normalizeError(event.error),
          nodeId: event.node.id,
          nodeType: event.node.type,
        },
        type,
      };
    }

    case 'nodeExcluded': {
      const event = data as ProcessEvents['nodeExcluded'];
      return {
        data: {
          inputs: normalizeRecord(event.inputs),
          nodeId: event.node.id,
          nodeType: event.node.type,
          outputs: normalizeRecord(event.outputs),
          reason: event.reason,
        },
        type,
      };
    }

    case 'userInput': {
      const event = data as ProcessEvents['userInput'];
      return {
        data: {
          inputStrings: event.inputStrings,
          inputs: normalizeRecord(event.inputs),
          nodeId: event.node.id,
          nodeType: event.node.type,
          renderingType: event.renderingType,
        },
        type,
      };
    }

    case 'nodeOutputsCleared': {
      const event = data as ProcessEvents['nodeOutputsCleared'];
      return {
        data: {
          nodeId: event.node.id,
          nodeType: event.node.type,
        },
        type,
      };
    }

    case 'partialOutput': {
      const event = data as ProcessEvents['partialOutput'];
      return {
        data: {
          index: event.index,
          nodeId: event.node.id,
          nodeType: event.node.type,
          outputs: normalizeRecord(event.outputs),
        },
        type,
      };
    }

    case 'abort': {
      const event = data as ProcessEvents['abort'];
      return {
        data: {
          error: event.error == null ? undefined : normalizeError(event.error),
          successful: event.successful,
        },
        type,
      };
    }

    case 'done': {
      const event = data as ProcessEvents['done'];
      return {
        data: {
          results: normalizeRecord(event.results),
        },
        type,
      };
    }

    case 'trace':
      return {
        data,
        type,
      };

    default:
      return {
        data: normalizeValue(data),
        type,
      };
  }
}

function normalizeRecorderEvents(recorder: ExecutionRecorder): CapturedEvent[] {
  const directEvents = recorder.events.map(normalizeRecordedEvent);

  if (recorder.events.length === 0) {
    return directEvents;
  }

  const deserializedEvents = ExecutionRecorder.deserializeFromString(recorder.serialize()).events.map(normalizeRecordedEvent);
  assert.deepEqual(deserializedEvents, directEvents, 'recorder events survive serialize/deserialize');

  return directEvents;
}

function normalizeRecordedEvent(event: RecordedEvents): CapturedEvent {
  return {
    data: normalizeValue(event.data, { dropUndefinedProperties: true }),
    type: event.type,
  };
}

function normalizeRecord(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (values == null) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        key === 'duration' && isNumberDataValue(value)
          ? { type: 'number', value: '<timing-dependent>' }
          : normalizeValue(value),
      ]),
  );
}

function normalizeValue(
  value: unknown,
  options: {
    dropUndefinedProperties?: boolean;
  } = {},
): unknown {
  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((nestedValue) => normalizeValue(nestedValue, options));
  }

  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !['callback', 'durationMs', 'execution', 'processId', 'ts'].includes(key))
        .filter(([, nestedValue]) => !(options.dropUndefinedProperties && nestedValue === undefined))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [
          key,
          key === 'error'
            ? normalizeError(nestedValue)
            : key === 'duration' && isNumberDataValue(nestedValue)
              ? { type: 'number', value: '<timing-dependent>' }
              : normalizeValue(nestedValue, options),
        ]),
    );
  }

  return value;
}

function isNumberDataValue(value: unknown): value is { type: 'number'; value: number } {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'number' &&
    typeof (value as { value?: unknown }).value === 'number'
  );
}

function normalizeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      cause: error.cause == null ? undefined : normalizeError(error.cause),
      message: error.message,
      name: error.name,
    };
  }

  if (typeof error === 'string') {
    return error.split('\n')[0];
  }

  return error;
}

function makeReferencedProject(): Project {
  const graphId = 'referenced-main' as GraphId;
  return {
    graphs: {
      [graphId]: {
        connections: [],
        metadata: {
          description: '',
          id: graphId,
          name: 'Referenced Main',
        },
        nodes: [],
      },
    },
    metadata: {
      description: '',
      id: 'referenced-project' as ProjectId,
      mainGraphId: graphId,
      title: 'Referenced Project',
    },
    plugins: [],
  };
}

function withProjectReference(fixture: RuntimeSpeedProjectFixture): {
  fixture: RuntimeSpeedProjectFixture;
  referencedProject: Project;
} {
  const referencedProject = makeReferencedProject();
  const project = cloneProject(fixture.project);
  project.references = [
    {
      id: referencedProject.metadata.id,
      title: referencedProject.metadata.title,
    },
  ];

  return {
    fixture: {
      ...fixture,
      project,
    },
    referencedProject,
  };
}

function createCountingProjectReferenceLoader(referencedProject: Project): {
  calls: ProjectReference[];
  loader: ProjectReferenceLoader;
} {
  const calls: ProjectReference[] = [];

  return {
    calls,
    loader: {
      async loadProject(_currentProjectPath, reference) {
        calls.push(reference);
        return cloneProject(referencedProject);
      },
    },
  };
}

function createFailingProjectReferenceLoader(): ProjectReferenceLoader {
  return {
    async loadProject() {
      throw new Error('reference loader failed');
    },
  };
}

function createRemoteDebugger(): NonNullable<NodeRunGraphOptions['remoteDebugger']> {
  return {
    attach: () => undefined,
    broadcast: () => undefined,
    detach: () => undefined,
    off: () => undefined,
    on: () => undefined,
    webSocketServer: {} as never,
  };
}

function makePartialOutputFixture(): RuntimeSpeedProjectFixture {
  const graphId = 'partial-output-main' as GraphId;
  const partialNode: ChartNode = {
    data: {},
    id: 'partial-output-node' as NodeId,
    title: 'Partial Output',
    type: 'partialOutputTest',
    visualData: { width: 240, x: 0, y: 0 },
  };
  const outputNode: ChartNode = {
    data: {
      dataType: 'string',
      id: 'result',
    },
    id: 'graph-output' as NodeId,
    title: 'Graph Output',
    type: 'graphOutput',
    visualData: { width: 240, x: 300, y: 0 },
  };

  return {
    graphId,
    project: {
      graphs: {
        [graphId]: {
          connections: [
            {
              inputId: 'value' as PortId,
              inputNodeId: outputNode.id,
              outputId: 'output' as PortId,
              outputNodeId: partialNode.id,
            },
          ],
          metadata: {
            description: '',
            id: graphId,
            name: 'Partial Output Main',
          },
          nodes: [partialNode, outputNode],
        },
      },
      metadata: {
        description: '',
        id: 'partial-output-project' as ProjectId,
        mainGraphId: graphId,
        title: 'Partial Output Project',
      },
      plugins: [],
    },
    terminalNodeId: outputNode.id,
  };
}

function makeUserInputFixture(): RuntimeSpeedProjectFixture {
  const graphId = 'user-input-main' as GraphId;
  const userInputNode: ChartNode = {
    data: {},
    id: 'user-input-node' as NodeId,
    title: 'User Input Request',
    type: 'requestUserInputTest',
    visualData: { width: 240, x: 0, y: 0 },
  };
  const outputNode: ChartNode = {
    data: {
      dataType: 'string',
      id: 'result',
    },
    id: 'graph-output' as NodeId,
    title: 'Graph Output',
    type: 'graphOutput',
    visualData: { width: 240, x: 300, y: 0 },
  };

  return {
    graphId,
    project: {
      graphs: {
        [graphId]: {
          connections: [
            {
              inputId: 'value' as PortId,
              inputNodeId: outputNode.id,
              outputId: 'output' as PortId,
              outputNodeId: userInputNode.id,
            },
          ],
          metadata: {
            description: '',
            id: graphId,
            name: 'User Input Main',
          },
          nodes: [userInputNode, outputNode],
        },
      },
      metadata: {
        description: '',
        id: 'user-input-project' as ProjectId,
        mainGraphId: graphId,
        title: 'User Input Project',
      },
      plugins: [],
    },
    terminalNodeId: outputNode.id,
  };
}

function createCompatibilityRegistry(): NodeRegistration<any, any> {
  return {
    createDynamicImpl(node: ChartNode) {
      if (node.type === 'requestUserInputTest') {
        return {
          chartNode: node,
          getInputDefinitions: () => [],
          getInputDefinitionsIncludingBuiltIn: () => [],
          getOutputDefinitions: () => [{ dataType: 'string', id: 'output', title: 'Output' }],
          async process(_inputData, context) {
            const response = await context.requestUserInput(['Question from test'], 'text');

            return {
              output: {
                type: 'string',
                value: response.value[0] ?? '',
              },
            };
          },
        } as NodeImpl<ChartNode>;
      }

      if (node.type !== 'partialOutputTest') {
        return globalRivetNodeRegistry.createDynamicImpl(node);
      }

      return {
        chartNode: node,
        getInputDefinitions: () => [],
        getInputDefinitionsIncludingBuiltIn: () => [],
        getOutputDefinitions: () => [{ dataType: 'string', id: 'output', title: 'Output' }],
        async process(_inputData, context) {
          context.onPartialOutputs?.({
            output: {
              type: 'string',
              value: 'partial',
            },
          });

          return {
            output: {
              type: 'string',
              value: 'final',
            },
          };
        },
      } as NodeImpl<ChartNode>;
    },
    getPluginFor(type: string) {
      return globalRivetNodeRegistry.getPluginFor(type);
    },
    getPlugins() {
      return globalRivetNodeRegistry.getPlugins();
    },
  } as NodeRegistration<any, any>;
}

void describe('default-fast compatibility characterization', () => {
  void it('keeps eligible createProcessor outputs, callbacks, and recorder events equivalent', async () => {
    const cases: Array<{
      fixture: RuntimeSpeedProjectFixture;
      name: string;
      options?: ProfileRunOptions;
    }> = [
      {
        fixture: makeInputContextTextProject(),
        name: 'linear input/context graph',
        options: {
          context: { suffix: 'context' },
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeBranchingTextProject(),
        name: 'branching DAG',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeWideTextFanInProject(3),
        name: 'wide fan-in DAG',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeSameSourceFanInProject(),
        name: 'same-source fan-in DAG',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeMissingRequiredInputProject(),
        name: 'missing required input',
      },
      {
        fixture: makeControlFlowExclusionProject(),
        name: 'control-flow exclusion',
        options: {
          inputs: {
            input: { type: 'object', value: { present: true } },
          },
        },
      },
      {
        fixture: makeGlobalStateProject(),
        name: 'global state event',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeRaiseEventProject(),
        name: 'raised user event',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeSubgraphChainProject(3),
        name: 'subgraph chain',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeRepeatedSubgraphFanInProject(3),
        name: 'repeated same-input subgraphs',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeMixedSubgraphFanInProject(2, 2),
        name: 'mixed subgraph fan-in',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeAsyncDelayProject(1),
        name: 'async node',
        options: {
          inputs: { input: 'seed' },
        },
      },
      {
        fixture: makeExpressionChainProject(3),
        name: 'Expression chain',
        options: {
          inputs: { input: 5 },
        },
      },
      {
        fixture: makeCodeChainProject(3),
        name: 'Code chain',
        options: {
          inputs: { input: 5 },
        },
      },
      {
        fixture: makePartialOutputFixture(),
        name: 'partial output callback',
        options: {
          registry: createCompatibilityRegistry(),
        },
      },
      {
        fixture: makeUserInputFixture(),
        name: 'user input callback',
        options: {
          registry: createCompatibilityRegistry(),
        },
      },
    ];

    for (const testCase of cases) {
      const { compatible, defaultSafe, fast } = await runAllProfiles(testCase.fixture, testCase.options);
      assertProfileRunsEqual(compatible, defaultSafe, `${testCase.name} default`);
      assertProfileRunsEqual(compatible, fast, testCase.name);
    }
  });

  void it('keeps failed Code runs equivalent in callbacks and recorder events', async () => {
    const cases = [
      {
        fixture: makeThrowingCodeProject(),
        name: 'runtime error',
      },
      {
        fixture: makeSyntaxErrorCodeProject(),
        name: 'syntax error',
      },
    ];

    for (const testCase of cases) {
      const { compatible, defaultSafe, fast } = await runAllProfiles(testCase.fixture);
      assert.equal(compatible.status, 'rejected', testCase.name);
      assertProfileRunsEqual(compatible, defaultSafe, `${testCase.name} default`);
      assertProfileRunsEqual(compatible, fast, testCase.name);
    }
  });

  void it('keeps abort behavior equivalent', async () => {
    const fixture = makeAbortSignalProject(20);
    const createAbortOptions = (): ProfileRunOptions => {
      const controller = new AbortController();
      return {
        abortSignal: controller.signal,
        beforeNodeStart: () => {
          controller.abort();
        },
        inputs: { input: 'seed' },
      };
    };

    const compatible = await runProfile(fixture, 'compatible', createAbortOptions());
    const defaultSafe = await runProfile(fixture, undefined, createAbortOptions());
    const fast = await runProfile(fixture, 'headless-fast', createAbortOptions());

    assert.equal(compatible.status, 'rejected');
    assertProfileRunsEqual(compatible, defaultSafe, 'abort default');
    assertProfileRunsEqual(compatible, fast, 'abort');
  });

  void it('honors custom Code runners when the fast profile is requested', async () => {
    const fixture = makeCodeChainProject(2);

    for (const runtimeProfile of [undefined, 'compatible', 'headless-fast'] as const) {
      const codeRunner = new CountingCodeRunner();
      const result = await runProfile(fixture, runtimeProfile, {
        codeRunner,
        inputs: {
          input: 5,
        },
      });

      assert.equal(result.status, 'resolved', runtimeProfile ?? 'default');
      assert.equal(codeRunner.calls, 2, runtimeProfile ?? 'default');
      assert.deepEqual(result.outputs.result, {
        type: 'any',
        value: 7,
      });
    }
  });

  void it('keeps trace and remote-debugger runs on the compatible observable path', async () => {
    const fixture = makeInputContextTextProject();
    const options: ProfileRunOptions = {
      context: { suffix: 'context' },
      includeTrace: true,
      inputs: { input: 'seed' },
    };
    const { compatible, defaultSafe, fast } = await runAllProfiles(fixture, options);
    assertProfileRunsEqual(compatible, defaultSafe, 'includeTrace default fallback');
    assertProfileRunsEqual(compatible, fast, 'includeTrace fallback');

    const remoteCompatible = await runProfile(fixture, 'compatible', {
      context: { suffix: 'context' },
      inputs: { input: 'seed' },
    });
    const remoteDefault = await runProfile(fixture, undefined, {
      context: { suffix: 'context' },
      inputs: { input: 'seed' },
      remoteDebugger: createRemoteDebugger(),
    });
    const remoteFast = await runProfile(fixture, 'headless-fast', {
      context: { suffix: 'context' },
      inputs: { input: 'seed' },
      remoteDebugger: createRemoteDebugger(),
    });
    assertProfileRunsEqual(remoteCompatible, remoteDefault, 'remote debugger default fallback');
    assertProfileRunsEqual(remoteCompatible, remoteFast, 'remote debugger fallback');
  });

  void it('documents project-reference loader call-count differences as a default-fast blocker', async () => {
    const { fixture, referencedProject } = withProjectReference(makeRepeatedSubgraphFanInProject(3));
    const compatibleLoader = createCountingProjectReferenceLoader(referencedProject);
    const defaultLoader = createCountingProjectReferenceLoader(referencedProject);
    const fastLoader = createCountingProjectReferenceLoader(referencedProject);

    const compatible = await runProfile(fixture, 'compatible', {
      inputs: { input: 'seed' },
      projectReferenceLoader: compatibleLoader.loader,
    });
    const defaultSafe = await runProfile(fixture, undefined, {
      inputs: { input: 'seed' },
      projectReferenceLoader: defaultLoader.loader,
    });
    const fast = await runProfile(fixture, 'headless-fast', {
      inputs: { input: 'seed' },
      projectReferenceLoader: fastLoader.loader,
    });

    assert.equal(compatible.status, 'resolved');
    assert.equal(defaultSafe.status, 'resolved');
    assert.equal(fast.status, 'resolved');
    assert.deepEqual(defaultSafe.outputs, compatible.outputs);
    assert.deepEqual(fast.outputs, compatible.outputs);
    assert.equal(
      defaultLoader.calls.length,
      compatibleLoader.calls.length,
      'default policy keeps compatible project-reference loader call counts',
    );
    assert.ok(
      compatibleLoader.calls.length > fastLoader.calls.length,
      'headless-fast caches loaded references across subprocessors inside one run',
    );
    assert.equal(fastLoader.calls.length, 1);
  });

  void it('keeps project-reference loader failures equivalent', async () => {
    const { fixture } = withProjectReference(makeInputContextTextProject());
    const { compatible, defaultSafe, fast } = await runAllProfiles(fixture, {
      inputs: { input: 'seed' },
      projectReferenceLoader: createFailingProjectReferenceLoader(),
    });

    assert.equal(compatible.status, 'rejected');
    assertProfileRunsEqual(compatible, defaultSafe, 'project reference loader failure default');
    assertProfileRunsEqual(compatible, fast, 'project reference loader failure');
  });

  void it('does not mutate shared project objects across concurrent endpoint-style runs', async () => {
    const fixture = makeSubgraphChainProject(2);
    const defaultProject = cloneProject(fixture.project);
    const beforeDefaultRun = cloneProject(defaultProject);
    const project = cloneProject(fixture.project);
    const beforeRun = cloneProject(project);

    const [defaultFirst, defaultSecond] = await Promise.all([
      runProfile(fixture, undefined, {
        inputs: { input: 'first' },
        project: defaultProject,
      }),
      runProfile(fixture, undefined, {
        inputs: { input: 'second' },
        project: defaultProject,
      }),
    ]);
    const [first, second] = await Promise.all([
      runProfile(fixture, 'headless-fast', {
        inputs: { input: 'first' },
        project,
      }),
      runProfile(fixture, 'headless-fast', {
        inputs: { input: 'second' },
        project,
      }),
    ]);

    assert.equal(defaultFirst.status, 'resolved');
    assert.equal(defaultSecond.status, 'resolved');
    assert.deepEqual(defaultFirst.outputs.result, { type: 'string', value: 'firstxx' });
    assert.deepEqual(defaultSecond.outputs.result, { type: 'string', value: 'secondxx' });
    assert.deepEqual(defaultProject, beforeDefaultRun);
    assert.equal(first.status, 'resolved');
    assert.equal(second.status, 'resolved');
    assert.deepEqual(first.outputs.result, { type: 'string', value: 'firstxx' });
    assert.deepEqual(second.outputs.result, { type: 'string', value: 'secondxx' });
    assert.deepEqual(project, beforeRun);
  });
});
