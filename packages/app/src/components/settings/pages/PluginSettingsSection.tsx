import { type FC } from 'react';
import { useAtom } from 'jotai';
import TextField from '@atlaskit/textfield';
import { Field } from '@atlaskit/form';
import { Header } from '@atlaskit/side-navigation';
import { match } from 'ts-pattern';
import {
  type RivetPluginConfigSpecs,
  type SecretPluginConfigurationSpec,
  type StringPluginConfigurationSpec,
} from '@ironclad/rivet-core';
import { entries } from '../../../utils/typeSafety';
import { settingsState } from '../../../state/settings.js';
import { FieldHelperMessage } from '../../FieldHelperMessage.js';

export const PluginSettingsSection: FC<{
  pluginId: string;
  label: string;
  configSpec: RivetPluginConfigSpecs | undefined;
}> = ({ pluginId, label, configSpec }) => {
  const [settings, setSettings] = useAtom(settingsState);

  return (
    <section>
      <Header>{label}</Header>
      {entries(configSpec ?? {}).map(([key, config]) => (
        <Field key={key} name={`plugin-${pluginId}-${key}`} label={`${config.label} (${pluginId})`}>
          {() =>
            match(config)
              .with(
                { type: 'string' },
                { type: 'secret' },
                (typedConfig: StringPluginConfigurationSpec | SecretPluginConfigurationSpec) => (
                  <>
                    {typedConfig.helperText && <FieldHelperMessage>{typedConfig.helperText}</FieldHelperMessage>}
                    <TextField
                      value={(settings.pluginSettings?.[pluginId]?.[key] as string | undefined) ?? ''}
                      type={typedConfig.type === 'secret' ? 'password' : 'text'}
                      onChange={(event) =>
                        setSettings((state) => ({
                          ...state,
                          pluginSettings: {
                            ...state.pluginSettings,
                            [pluginId]: {
                              ...state.pluginSettings?.[pluginId],
                              [key]: (event.target as HTMLInputElement).value,
                            },
                          },
                        }))
                      }
                    />
                  </>
                ),
              )
              .otherwise(() => null)
          }
        </Field>
      ))}
    </section>
  );
};
