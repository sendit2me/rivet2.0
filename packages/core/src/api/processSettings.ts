import type { Settings } from '../model/Settings.js';
import { DEFAULT_CHAT_NODE_TIMEOUT } from '../utils/defaults.js';

type ProcessSettingsFallbacks = Pick<Settings, 'openAiKey' | 'openAiOrganization' | 'openAiEndpoint' | 'pluginEnv'>;

export function resolveProcessSettings(
  settings: Settings = {},
  fallbacks: Partial<ProcessSettingsFallbacks> = {},
): Required<Settings> {
  return {
    openAiKey: settings.openAiKey ?? fallbacks.openAiKey ?? '',
    openAiOrganization: settings.openAiOrganization ?? fallbacks.openAiOrganization ?? '',
    openAiEndpoint: settings.openAiEndpoint ?? fallbacks.openAiEndpoint ?? '',
    pluginEnv: settings.pluginEnv ?? fallbacks.pluginEnv ?? {},
    pluginSettings: settings.pluginSettings ?? {},
    recordingPlaybackLatency: settings.recordingPlaybackLatency ?? 1000,
    defaultNodeColors: settings.defaultNodeColors ?? false,
    openNodeSettingsOnCreate: settings.openNodeSettingsOnCreate ?? true,
    chatNodeHeaders: settings.chatNodeHeaders ?? {},
    chatNodeTimeout: settings.chatNodeTimeout ?? DEFAULT_CHAT_NODE_TIMEOUT,
    throttleChatNode: settings.throttleChatNode ?? 100,
    llmProfiles: settings.llmProfiles ?? [],
  };
}
