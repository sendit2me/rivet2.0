import { type RivetPlugin, type Settings, type StringPluginConfigurationSpec } from '@valerypopoff/rivet2-core';
import { entries } from './typeSafety';
import { invokeNative, isInTauri as detectTauri } from './platform/core.js';
import type { EnvironmentProvider, PathPolicyProvider } from '../providers/ProvidersContext.js';

export function isInTauri(): boolean {
  return detectTauri();
}

const cachedEnvVars: Record<string, string> = {};

export function getDefaultEnvironmentProvider(): EnvironmentProvider {
  return {
    getEnvVar,
  };
}

export function getDefaultPathPolicyProvider(): PathPolicyProvider {
  return {
    allowDataFileNeighbor,
    async readRelativeProjectFile(currentProjectPath, projectFilePath) {
      return await invokeNative<string>('read_relative_project_file', {
        relativeFrom: currentProjectPath,
        projectFilePath,
      });
    },
  };
}

export async function getEnvVar(name: string): Promise<string | undefined> {
  if (cachedEnvVars[name]) {
    return cachedEnvVars[name];
  }

  if (isInTauri()) {
    const value = await invokeNative<string>('get_environment_variable', { name });
    cachedEnvVars[name] = value;
    return value;
  } else {
    if (typeof process !== 'undefined') {
      return process.env[name];
    }

    return undefined;
  }
}

export async function fillMissingSettingsFromEnvironmentVariables(
  settings: Partial<Settings>,
  plugins: RivetPlugin[],
  optionsOrExtraEnvVarNames: string[] | { extraEnvVarNames?: string[]; environmentProvider?: EnvironmentProvider } = [],
) {
  const options = Array.isArray(optionsOrExtraEnvVarNames)
    ? { extraEnvVarNames: optionsOrExtraEnvVarNames }
    : optionsOrExtraEnvVarNames;
  const environmentProvider = options.environmentProvider ?? getDefaultEnvironmentProvider();
  const getProviderEnvVar = (name: string) => environmentProvider.getEnvVar(name);
  const fullSettings: Settings = {
    ...settings,
    openAiKey: (settings.openAiKey || (await getProviderEnvVar('OPENAI_API_KEY'))) ?? '',
    openAiOrganization: (settings.openAiOrganization || (await getProviderEnvVar('OPENAI_ORG_ID'))) ?? '',
    openAiEndpoint: (settings.openAiEndpoint || (await getProviderEnvVar('OPENAI_ENDPOINT'))) ?? '',
    pluginSettings: settings.pluginSettings,
    pluginEnv: {},
  };

  for (const plugin of plugins) {
    const stringConfigs = entries(plugin.configSpec ?? {}).filter(([, c]) => c.type === 'string') as [
      string,
      StringPluginConfigurationSpec,
    ][];
    for (const [configName, config] of stringConfigs) {
      if (config.pullEnvironmentVariable) {
        const envVarName =
          typeof config.pullEnvironmentVariable === 'string'
            ? config.pullEnvironmentVariable
            : config.pullEnvironmentVariable === true
              ? configName
              : undefined;
        if (envVarName) {
          const envVarValue = await getProviderEnvVar(envVarName);
          if (envVarValue) {
            fullSettings.pluginEnv![envVarName] = envVarValue;
          }
        }
      }
    }
  }

  for (const envVarName of new Set((options.extraEnvVarNames ?? []).map((name) => name.trim()).filter(Boolean))) {
    const envVarValue = await getProviderEnvVar(envVarName);
    if (envVarValue) {
      fullSettings.pluginEnv![envVarName] = envVarValue;
    }
  }

  return fullSettings;
}

export async function allowDataFileNeighbor(projectFilePath: string): Promise<void> {
  await invokeNative('allow_data_file_scope', { projectFilePath });
}
