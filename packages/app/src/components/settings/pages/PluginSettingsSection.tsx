import { type FC } from 'react';
import { useAtom } from 'jotai';
import TextField from '@atlaskit/textfield';
import { Field } from '@atlaskit/form';
import { css } from '@emotion/react';
import { match } from 'ts-pattern';
import {
  type RivetPluginConfigSpecs,
  type SecretPluginConfigurationSpec,
  type StringPluginConfigurationSpec,
} from '@rivet2/rivet-core';
import { entries } from '../../../utils/typeSafety';
import { settingsState } from '../../../state/settings.js';
import { FieldHelperMessage } from '../../FieldHelperMessage.js';

const pluginSettingsSectionStyles = css`
  display: flex;
  flex-direction: column;
  gap: calc(14px * var(--ui-font-scale));
  padding-top: calc(16px * var(--ui-font-scale));
  border-top: 1px solid var(--grey);

  &:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .plugin-settings-heading {
    margin: 0;
    color: var(--grey-lightest);
    font-size: var(--ui-font-size-xl);
    font-weight: 700;
    line-height: 1.25;
  }

  .plugin-settings-fields {
    display: flex;
    flex-direction: column;
    gap: var(--settings-field-gap);
  }
`;

export const PluginSettingsSection: FC<{
  pluginId: string;
  label: string;
  configSpec: RivetPluginConfigSpecs | undefined;
}> = ({ pluginId, label, configSpec }) => {
  const [settings, setSettings] = useAtom(settingsState);

  return (
    <section css={pluginSettingsSectionStyles} aria-labelledby={`plugin-settings-${pluginId}`}>
      <h2 id={`plugin-settings-${pluginId}`} className="plugin-settings-heading">
        {label}
      </h2>
      <div className="plugin-settings-fields">
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
      </div>
    </section>
  );
};
