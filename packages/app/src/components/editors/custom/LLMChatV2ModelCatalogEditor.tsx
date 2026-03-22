import Button from '@atlaskit/button';
import { type ChartNode, type CustomEditorDefinition } from '@ironclad/rivet-core';
import { css } from '@emotion/react';
import { useAtomValue } from 'jotai';
import { type FC, useState } from 'react';
import { settingsState } from '../../../state/settings.js';
import { useDependsOnPlugins } from '../../../hooks/useDependsOnPlugins.js';
import { fillMissingSettingsFromEnvironmentVariables } from '../../../utils/tauri.js';
import {
  getChatV2DiscoveredModelOptionsWithStatus,
  invalidateChatV2DiscoveredModelOptions,
} from '../../../utils/chatV2ModelCatalog.js';
import { type SharedEditorProps } from '../SharedEditorProps';

const styles = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .banner {
    width: 100%;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.4;
    border: 1px solid transparent;
  }

  .banner.warning {
    background: rgba(255, 196, 0, 0.12);
    border-color: rgba(255, 196, 0, 0.35);
    color: var(--foreground);
  }

  .banner.success {
    background: rgba(54, 179, 126, 0.12);
    border-color: rgba(54, 179, 126, 0.35);
    color: var(--foreground);
  }
`;

type RefreshStatus =
  | {
      tone: 'success' | 'warning';
      message: string;
    }
  | undefined;

type Props = SharedEditorProps & {
  editor: CustomEditorDefinition<ChartNode>;
};

const modelCatalogRefreshStatus = new Map<string, RefreshStatus>();

function getMissingCredentialMessage(
  provider: 'openai' | 'anthropic' | 'google',
  resolvedSettings: Awaited<ReturnType<typeof fillMissingSettingsFromEnvironmentVariables>>,
): string | undefined {
  switch (provider) {
    case 'openai':
      return resolvedSettings.openAiKey ? undefined : 'OpenAI API key is not configured.';
    case 'anthropic':
      return undefined;
    case 'google':
      return undefined;
  }
}

export const LLMChatV2ModelCatalogEditor: FC<Props> = ({ node, isReadonly, isDisabled, onRefreshEditors }) => {
  const settings = useAtomValue(settingsState);
  const plugins = useDependsOnPlugins();
  const statusKey = `${node.id}:${(node.data as { provider?: 'openai' | 'anthropic' | 'google' }).provider ?? 'openai'}`;
  const [status, setStatus] = useState<RefreshStatus>(() => modelCatalogRefreshStatus.get(statusKey));
  const provider = (node.data as { provider?: 'openai' | 'anthropic' | 'google' }).provider ?? 'openai';

  const updateStatus = (nextStatus: RefreshStatus) => {
    if (nextStatus == null) {
      modelCatalogRefreshStatus.delete(statusKey);
    } else {
      modelCatalogRefreshStatus.set(statusKey, nextStatus);
    }
    setStatus(nextStatus);
  };

  const handleRefresh = async () => {
    updateStatus({
      tone: 'warning',
      message: 'Refreshing model list...',
    });

    try {
      const resolvedSettings = await fillMissingSettingsFromEnvironmentVariables(settings, plugins);
      const context = { settings: resolvedSettings, plugins };

      invalidateChatV2DiscoveredModelOptions(provider, context);
      const result = await getChatV2DiscoveredModelOptionsWithStatus(provider, context);
      if (result.source === 'api') {
        updateStatus({
          tone: 'success',
          message: `Loaded ${result.options.length} models from ${provider}.`,
        });
      } else {
        updateStatus(
          {
            tone: 'warning',
            message: `Using built-in ${provider} model list (${result.options.length}). ${
              getMissingCredentialMessage(provider, resolvedSettings) ?? result.error ?? 'API fetch failed.'
            }`,
          },
        );
      }
      onRefreshEditors?.();
    } catch (error) {
      updateStatus({
        tone: 'warning',
        message: error instanceof Error ? error.message : 'Failed to refresh model list.',
      });
    }
  };

  return (
    <div css={styles}>
      <div className="actions">
        <Button appearance="subtle" onClick={handleRefresh} isDisabled={isReadonly || isDisabled}>
          Re-fetch Model List
        </Button>
      </div>
      {status ? (
        <div className={`banner ${status.tone}`}>{status.message}</div>
      ) : null}
    </div>
  );
};
