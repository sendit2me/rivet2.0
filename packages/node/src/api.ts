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
  type RunGraphOptions,
  DEFAULT_CHAT_NODE_TIMEOUT,
  type Settings,
  type Tokenizer,
  type TokenizerCallInfo,
  type ChatMessage,
  type GptFunction,
  type RemoteRunRequestId,
} from '@ironclad/rivet-core';

import { readFile } from 'node:fs/promises';

import { NodeNativeApi } from './native/NodeNativeApi.js';
import * as events from 'node:events';
import { NodeCodeRunner } from './native/NodeCodeRunner.js';
import type { RivetDebuggerServer } from './debugger.js';
import { NodeProjectReferenceLoader } from './native/NodeProjectReferenceLoader.js';
import { NodeMCPProvider } from './native/NodeMCPProvider.js';

class FallbackTokenizer implements Tokenizer {
  on(_event: 'error', _listener: (err: Error) => void): void {}

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

export function createProcessor(
  project: Project,
  options: NodeRunGraphOptions,
): ReturnType<typeof coreCreateProcessor> {
  const processor = coreCreateProcessor(project, options);

  processor.processor.executor = 'nodejs';

  processor.processor.on('newAbortController', (controller) => {
    events.setMaxListeners(0, controller.signal);
  });

  if (options.remoteDebugger) {
    options.remoteDebugger.attach(processor.processor, options.remoteDebuggerRequestId);
  }

  let pluginEnv = options.pluginEnv;
  if (!pluginEnv) {
    // If unset, use process.env
    pluginEnv = getPluginEnvFromProcessEnv(options.registry);
  }

  return {
    ...processor,
    async run() {
      const outputs = await processor.processor.processGraph(
        {
          nativeApi: options.nativeApi ?? new NodeNativeApi(),
          datasetProvider: options.datasetProvider,
          mcpProvider: options.mcpProvider ?? new NodeMCPProvider(),
          audioProvider: options.audioProvider,
          tokenizer: options.tokenizer ?? new FallbackTokenizer(),
          codeRunner: options.codeRunner ?? new NodeCodeRunner(),
          projectPath: options.projectPath,
          projectReferenceLoader: options.projectReferenceLoader ?? new NodeProjectReferenceLoader(),
          settings: {
            openAiKey: options.openAiKey ?? process.env.OPENAI_API_KEY ?? '',
            openAiOrganization: options.openAiOrganization ?? process.env.OPENAI_ORG_ID ?? '',
            openAiEndpoint: options.openAiEndpoint ?? process.env.OPENAI_ENDPOINT ?? '',
            pluginEnv: pluginEnv ?? {},
            pluginSettings: options.pluginSettings ?? {},
            recordingPlaybackLatency: 1000,
            chatNodeHeaders: options.chatNodeHeaders ?? {},
            chatNodeTimeout: options.chatNodeTimeout ?? DEFAULT_CHAT_NODE_TIMEOUT,
            throttleChatNode: options.throttleChatNode ?? 100,
            defaultNodeColors: options.defaultNodeColors ?? false,
            openNodeSettingsOnCreate: options.openNodeSettingsOnCreate ?? true,
          } satisfies Required<Settings>,
          getChatNodeEndpoint: options.getChatNodeEndpoint,
        },
        processor.inputs,
        processor.contextValues,
      );

      return outputs;
    },
  };
}

export async function runGraph(project: Project, options: NodeRunGraphOptions): Promise<Record<string, DataValue>> {
  const processorInfo = createProcessor(project, options);
  return processorInfo.run();
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
