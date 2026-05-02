import { type FC } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import Button from '@atlaskit/button';
import { Header } from '@atlaskit/side-navigation';
import { useDependsOnPlugins } from '../../../hooks/useDependsOnPlugins.js';
import { pluginsState, pluginRetryCounterState } from '../../../state/plugins.js';
import { fields } from '../settingsPageStyles.js';
import { PluginSettingsSection } from './PluginSettingsSection.js';

export const PluginsSettingsPage: FC = () => {
  const plugins = useDependsOnPlugins();
  const appPlugins = useAtomValue(pluginsState);
  const failedPlugins = appPlugins.filter((plugin) => plugin.error);
  const [, setPluginRetryCounter] = useAtom(pluginRetryCounterState);

  if (plugins.length === 0 && failedPlugins.length === 0) {
    return <div>No plugins are installed in this Rivet app. Add plugins from the Plugins workspace.</div>;
  }

  return (
    <div css={fields}>
      {failedPlugins.length > 0 && (
        <section>
          <Header>Failed Plugins</Header>
          {failedPlugins.map((plugin) => (
            <div key={plugin.id}>
              <strong>{'name' in plugin.spec ? plugin.spec.name : plugin.id}</strong>
              <div>{plugin.error}</div>
            </div>
          ))}
          <Button appearance="primary" onClick={() => setPluginRetryCounter((counter) => counter + 1)}>
            Retry Failed Plugins
          </Button>
        </section>
      )}
      {plugins
        .filter((plugin) => !plugin.configPage)
        .map((plugin) => (
          <PluginSettingsSection
            key={plugin.id}
            pluginId={plugin.id}
            label={plugin.name ?? plugin.id}
            configSpec={plugin.configSpec}
          />
        ))}
    </div>
  );
};

export const CustomPluginsSettingsPage: FC<{ pluginId: string }> = ({ pluginId }) => {
  const plugins = useDependsOnPlugins();
  const plugin = plugins.find((candidate) => candidate.id === pluginId);

  if (!plugin) {
    return <div>Plugin not found</div>;
  }

  if (!plugin.configPage) {
    return <>Config page not found</>;
  }

  return (
    <div css={fields}>
      <PluginSettingsSection
        pluginId={plugin.id}
        label={plugin.configPage.label ?? plugin.id}
        configSpec={plugin.configSpec}
      />
    </div>
  );
};
