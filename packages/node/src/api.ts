import {
  type DataValue,
  type NodeRegistration,
  type Project,
  type StringPluginConfigurationSpec,
  globalRivetNodeRegistry,
  type AttachedData,
  coreCreateProcessor,
  loadProjectFromString,
  loadProjectAndAttachedDataFromString,
  looseDataValuesToDataValues,
  type RunGraphOptions,
  resolveProcessSettings,
  type Tokenizer,
  type TokenizerCallInfo,
  type ChatMessage,
  type GptFunction,
  type GraphProcessorRuntimeCache,
  type RemoteRunRequestId,
  type LooseDataValue,
  type ProcessContext,
} from '@valerypopoff/rivet2-core';

import { readFile } from 'node:fs/promises';

import { NodeNativeApi } from './native/NodeNativeApi.js';
import * as events from 'node:events';
import { NodeCodeRunner } from './native/NodeCodeRunner.js';
import { CachedNodeCodeRunner } from './native/CachedNodeCodeRunner.js';
import type { RivetDebuggerServer } from './debugger.js';
import { NodeProjectReferenceLoader } from './native/NodeProjectReferenceLoader.js';
import { NodeMCPProvider } from './native/NodeMCPProvider.js';
import {
  resolveCreateProcessorRuntimePolicy,
  type NodeRuntimeProfile,
} from './createProcessorRuntimePolicy.js';

export type { NodeRuntimeProfile };

class FallbackTokenizer implements Tokenizer {
  on(_event: 'error', _listener: (err: Error) => void): () => void {
    return () => {};
  }

  async getTokenCountForString(input: string, _info: TokenizerCallInfo): Promise<number> {
    return input.length;
  }

  async getTokenCountForMessages(
    messages: ChatMessage[],
    _gptFunctions: GptFunction[] | undefined,
    _info: TokenizerCallInfo,
  ): Promise<number> {
    return messages.reduce((total, message) => {
      if (typeof message.message === 'string') {
        return total + message.message.length;
      }

      if (Array.isArray(message.message)) {
        return (
          total +
          message.message.reduce((messageTotal, part) => {
            if (typeof part === 'string') {
              return messageTotal + part.length;
            }

            if (part.type === 'url') {
              return messageTotal + part.url.length;
            }

            if (part.type === 'document') {
              return messageTotal + (part.title?.length ?? 0) + (part.context?.length ?? 0);
            }

            return messageTotal;
          }, 0)
        );
      }

      return total;
    }, 0);
  }
}

export async function loadProjectFromFile(path: string): Promise<Project> {
  const content = await readFile(path, { encoding: 'utf8' });
  return loadProjectFromString(content);
}

export async function loadProjectAndAttachedDataFromFile(path: string): Promise<[Project, AttachedData]> {
  const content = await readFile(path, { encoding: 'utf8' });
  return loadProjectAndAttachedDataFromString(content);
}

export async function runGraphInFile(path: string, options: NodeRunGraphOptions): Promise<Record<string, DataValue>> {
  const project = await loadProjectFromFile(path);
  return runGraph(project, options);
}

export type NodeRunGraphOptions = RunGraphOptions & {
  remoteDebugger?: RivetDebuggerServer;
  remoteDebuggerRequestId?: RemoteRunRequestId;
};

type NodeGraphProcessor = ReturnType<typeof coreCreateProcessor>['processor'];

export type NodeCreateProcessorOptions = NodeRunGraphOptions & {
  runtimeProfile?: NodeRuntimeProfile;
};

export type NodeGraphRunnerOptions = Omit<
  NodeRunGraphOptions,
  'abortSignal' | 'context' | 'inputs' | 'remoteDebugger' | 'remoteDebuggerRequestId'
> & {
  runtimeProfile?: NodeRuntimeProfile;
};

export type NodeGraphRunnerRunOptions = {
  abortSignal?: AbortSignal;
  context?: Record<string, LooseDataValue>;
  inputs?: Record<string, LooseDataValue>;
};

export type NodeGraphRunner = {
  dispose: () => void;
  run: (options?: NodeGraphRunnerRunOptions) => Promise<Record<string, DataValue>>;
};

export function createProcessor(
  project: Project,
  options: NodeCreateProcessorOptions,
): ReturnType<typeof coreCreateProcessor> {
  const { runtimeProfile, ...processorOptions } = options;
  const runtimePolicy = resolveCreateProcessorRuntimePolicy({ ...processorOptions, runtimeProfile });
  const processor = coreCreateProcessor(project, processorOptions, {
    cacheLoadedProjects: runtimePolicy.cacheLoadedProjects,
    runtimeCache: runtimePolicy.runtimeCache,
    scheduler: runtimePolicy.scheduler,
  });

  configureNodeProcessor(processor.processor);

  let remoteDebuggerAttached = false;
  const attachRemoteDebugger = () => {
    if (!processorOptions.remoteDebugger || remoteDebuggerAttached) {
      return;
    }

    processorOptions.remoteDebugger.attach(processor.processor, processorOptions.remoteDebuggerRequestId);
    remoteDebuggerAttached = true;
  };
  const detachRemoteDebugger = () => {
    if (!processorOptions.remoteDebugger || !remoteDebuggerAttached) {
      return;
    }

    processorOptions.remoteDebugger.detach(processor.processor);
    remoteDebuggerAttached = false;
  };

  attachRemoteDebugger();

  const pluginEnv = resolveNodePluginEnv(processorOptions);

  return {
    ...processor,
    async run() {
      const shouldManageRemoteDebugger = processorOptions.remoteDebugger != null && !processor.processor.isRunning;
      const shouldManageRunScopedRuntimeCache = runtimePolicy.runtimeCache != null && !processor.processor.isRunning;
      if (shouldManageRunScopedRuntimeCache) {
        clearGraphProcessorRuntimeCache(runtimePolicy.runtimeCache!);
      }

      if (shouldManageRemoteDebugger) {
        attachRemoteDebugger();
      }

      const runScopedCodeRunner =
        runtimePolicy.useCachedDefaultCodeRunner ? new CachedNodeCodeRunner() : undefined;

      try {
        const outputs = await processor.processor.processGraph(
          createNodeProcessContext(processorOptions, pluginEnv, { codeRunner: runScopedCodeRunner }),
          processor.inputs,
          processor.contextValues,
        );

        return outputs;
      } finally {
        runScopedCodeRunner?.clearCache();
        if (shouldManageRunScopedRuntimeCache) {
          clearGraphProcessorRuntimeCache(runtimePolicy.runtimeCache!);
        }

        if (shouldManageRemoteDebugger) {
          detachRemoteDebugger();
        }
      }
    },
  };
}

function clearGraphProcessorRuntimeCache(runtimeCache: GraphProcessorRuntimeCache): void {
  runtimeCache.executionPlans = undefined;
  runtimeCache.loadedProjects = undefined;
}

export function createGraphRunner(project: Project, options: NodeGraphRunnerOptions): NodeGraphRunner {
  const { runtimeProfile = 'compatible', ...processorOptions } = options;
  const ownsCodeRunner = processorOptions.codeRunner == null && runtimeProfile === 'headless-fast';
  const runnerCodeRunner = ownsCodeRunner ? new CachedNodeCodeRunner() : undefined;
  const runtimeCache: GraphProcessorRuntimeCache | undefined = runtimeProfile === 'headless-fast' ? {} : undefined;
  const processContext = createNodeProcessContext(processorOptions, resolveNodePluginEnv(processorOptions), {
    codeRunner: runnerCodeRunner,
  });
  const activeProcessors = new Set<NodeGraphProcessor>();
  let disposed = false;

  const runWithProcessor = async (
    processor: NodeGraphProcessor,
    runOptions: NodeGraphRunnerRunOptions = {},
  ): Promise<Record<string, DataValue>> => {
    activeProcessors.add(processor);
    const cleanupAbortSignal = bindAbortSignal(processor, runOptions.abortSignal);

    try {
      const outputsPromise = processor.processGraph(
        processContext,
        looseDataValuesToDataValues(runOptions.inputs ?? {}),
        looseDataValuesToDataValues(runOptions.context ?? {}),
      );

      if (runOptions.abortSignal?.aborted) {
        void processor.abort();
      }

      return await outputsPromise;
    } finally {
      cleanupAbortSignal();
      activeProcessors.delete(processor);
    }
  };

  return {
    dispose() {
      disposed = true;
      for (const processor of activeProcessors) {
        void processor.abort(false, 'Graph runner disposed.');
      }
      activeProcessors.clear();
      runnerCodeRunner?.clearCache();
      if (runtimeCache) {
        runtimeCache.executionPlans = undefined;
        runtimeCache.loadedProjects = undefined;
      }
    },
    async run(runOptions = {}) {
      if (disposed) {
        throw new Error('Cannot run a disposed graph runner.');
      }

      return await runWithProcessor(createRunnerProcessor(project, processorOptions, runtimeCache), runOptions);
    },
  };
}

export async function runGraph(project: Project, options: NodeRunGraphOptions): Promise<Record<string, DataValue>> {
  const processorInfo = createProcessor(project, options);
  return processorInfo.run();
}

function configureNodeProcessor(processor: NodeGraphProcessor): void {
  processor.executor = 'nodejs';

  processor.on('newAbortController', (controller) => {
    events.setMaxListeners(0, controller.signal);
  });
}

function createRunnerProcessor(
  project: Project,
  options: RunGraphOptions,
  runtimeCache?: GraphProcessorRuntimeCache,
): NodeGraphProcessor {
  const processorInfo = coreCreateProcessor(
    project,
    {
      ...options,
      abortSignal: undefined,
      context: {},
      inputs: {},
    },
    {
      cacheLoadedProjects: runtimeCache != null,
      runtimeCache,
      scheduler: runtimeCache ? 'fast-acyclic' : 'compatible',
    },
  );

  configureNodeProcessor(processorInfo.processor);
  return processorInfo.processor;
}

function createNodeProcessContext(
  options: RunGraphOptions,
  pluginEnv: Record<string, string | undefined>,
  overrides: { codeRunner?: ProcessContext['codeRunner'] } = {},
): ProcessContext {
  return {
    nativeApi: options.nativeApi ?? new NodeNativeApi(),
    datasetProvider: options.datasetProvider,
    mcpProvider: options.mcpProvider ?? new NodeMCPProvider(),
    audioProvider: options.audioProvider,
    tokenizer: options.tokenizer ?? new FallbackTokenizer(),
    codeRunner: options.codeRunner ?? overrides.codeRunner ?? new NodeCodeRunner(),
    projectPath: options.projectPath,
    projectReferenceLoader: options.projectReferenceLoader ?? new NodeProjectReferenceLoader(),
    editorExecutionCache: options.editorExecutionCache,
    settings: resolveProcessSettings(
      { ...options, pluginEnv },
      {
        openAiKey: process.env.OPENAI_API_KEY ?? '',
        openAiOrganization: process.env.OPENAI_ORG_ID ?? '',
        openAiEndpoint: process.env.OPENAI_ENDPOINT ?? '',
      },
    ),
    getChatNodeEndpoint: options.getChatNodeEndpoint,
  };
}

function resolveNodePluginEnv(options: RunGraphOptions): Record<string, string | undefined> {
  // If unset, use process.env
  return options.pluginEnv ?? getPluginEnvFromProcessEnv(options.registry);
}

function bindAbortSignal(processor: NodeGraphProcessor, abortSignal?: AbortSignal): () => void {
  if (!abortSignal) {
    return () => {};
  }

  const abort = () => {
    void processor.abort();
  };

  abortSignal.addEventListener('abort', abort, { once: true });
  return () => {
    abortSignal.removeEventListener('abort', abort);
  };
}

function getPluginEnvFromProcessEnv(registry?: NodeRegistration<any, any>) {
  const pluginEnv: Record<string, string> = {};
  for (const plugin of (registry ?? globalRivetNodeRegistry).getPlugins() ?? []) {
    const configs = Object.entries(plugin.configSpec ?? {}).filter(([, c]) => c.type === 'string') as [
      string,
      StringPluginConfigurationSpec,
    ][];
    for (const [configName, config] of configs) {
      if (config.pullEnvironmentVariable) {
        const envVarName =
          typeof config.pullEnvironmentVariable === 'string'
            ? config.pullEnvironmentVariable
            : config.pullEnvironmentVariable === true
              ? configName
              : undefined;
        if (envVarName) {
          pluginEnv[envVarName] = process.env[envVarName] ?? '';
        }
      }
    }
  }
  return pluginEnv;
}
