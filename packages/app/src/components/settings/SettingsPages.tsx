import { type FC, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import TextField from '@atlaskit/textfield';
import Button from '@atlaskit/button';
import { Field, HelperMessage, Label } from '@atlaskit/form';
import Select from '@atlaskit/select';
import { Header } from '@atlaskit/side-navigation';
import Toggle from '@atlaskit/toggle';
import Range from '@atlaskit/range';
import useAsyncEffect from 'use-async-effect';
import { match } from 'ts-pattern';
import { type SecretPluginConfigurationSpec, type StringPluginConfigurationSpec } from '../../../../core/src/index.js';
import { entries } from '../../../../core/src/utils/typeSafety';
import { DEFAULT_CHAT_NODE_TIMEOUT } from '../../../../core/src/utils/defaults';
import {
  checkForUpdatesState,
  defaultExecutorState,
  executorOptions,
  preservePortTextCaseState,
  previousDataPerNodeToKeepState,
  recordExecutionsState,
  settingsState,
  skippedMaxVersionState,
  type Theme,
  themeState,
  themes,
  zoomSensitivityState,
} from '../../state/settings.js';
import { useDependsOnPlugins } from '../../hooks/useDependsOnPlugins';
import { pluginsState, pluginRetryCounterState } from '../../state/plugins.js';
import { KeyValuePairs } from '../editors/KeyValuePairEditor';
import { useCheckForUpdate } from '../../hooks/useCheckForUpdate';
import { wrapAsync } from '../../utils/errorHandling';
import { getAppVersion } from '../../utils/nativeApp';
import { fields } from './settingsPageStyles';

export const GeneralSettingsPage: FC = () => {
  const [settings, setSettings] = useAtom(settingsState);
  const [theme, setTheme] = useAtom(themeState);
  const [recordExecutions, setRecordExecutions] = useAtom(recordExecutionsState);
  const [defaultExecutor, setDefaultExecutor] = useAtom(defaultExecutorState);
  const [previousDataPerNodeToKeep, setPreviousDataPerNodeToKeep] = useAtom(previousDataPerNodeToKeepState);
  const [zoomSensitivity, setZoomSensitivity] = useAtom(zoomSensitivityState);
  const [preservePortTextCase, setPreservePortTextCase] = useAtom(preservePortTextCaseState);

  return (
    <div css={fields}>
      <Field name="theme" label="Theme">
        {() => (
          <Select
            value={themes.find((option) => option.value === theme)}
            onChange={(event) => event && setTheme(event.value as Theme)}
            options={themes}
          />
        )}
      </Field>
      <Field name="preserve-port-text-case" label="Preserve text case for node ports">
        {() => (
          <>
            <Toggle
              id="check-for-updates"
              isChecked={preservePortTextCase}
              onChange={(event) => setPreservePortTextCase(event.target.checked)}
            />
            <HelperMessage>
              This WILL preserve the text format of the node port names. e.g. `newInputPort` will be shown instead of
              `NEWINPUTPORT` when enabled
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="recording-speed" label="Recording delay between chats (ms)">
        {() => (
          <>
            <TextField
              type="number"
              value={settings.recordingPlaybackLatency}
              onChange={(event) =>
                setSettings((state) => ({
                  ...state,
                  recordingPlaybackLatency: (event.target as HTMLInputElement).valueAsNumber,
                }))
              }
            />
            <HelperMessage>
              This is the delay between each chat message when playing back a recording. Lower values will play
              recordings back faster.
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="recordExecutions">
        {() => (
          <>
            <Label htmlFor="recordExecutions" testId="recordExecutions">
              Record local graph executions
            </Label>
            <div className="toggle-field">
              <Toggle
                id="recordExecutions"
                isChecked={recordExecutions}
                onChange={(event) => setRecordExecutions(event.target.checked)}
              />
            </div>
            <HelperMessage>Disabling may help performance when dealing with very large data values</HelperMessage>
          </>
        )}
      </Field>
      <Field name="defaultExecutor">
        {() => (
          <>
            <Label htmlFor="defaultExecutor" testId="defaultExecutor">
              Default executor
            </Label>
            <div className="toggle-field">
              <Select
                value={executorOptions.find((option) => option.value === defaultExecutor)}
                onChange={(event) => setDefaultExecutor(event!.value)}
                options={executorOptions}
              />
            </div>
            <HelperMessage>
              The default executor to use when starting the application. The browser executor is more stable, but the
              node executor is required for some features and plugins.
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="previousDataPerNodeToKeep">
        {() => (
          <>
            <Label htmlFor="previousDataPerNodeToKeep" testId="previousDataPerNodeToKeep">
              Previous data per node to keep
            </Label>
            <div className="toggle-field">
              <TextField
                type="number"
                defaultValue={Number.isNaN(previousDataPerNodeToKeep) ? -1 : previousDataPerNodeToKeep ?? -1}
                onChange={(event) => {
                  const value = (event.target as HTMLInputElement).valueAsNumber;
                  if (Number.isNaN(value) || value == null) {
                    return;
                  }

                  return setPreviousDataPerNodeToKeep(value);
                }}
              />
            </div>
            <HelperMessage>
              The number of previous data values to keep per node. Increasing this will increase memory usage, but
              allow you to go back further in time. -1 to disable and keep all.
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="zoomSensitivity">
        {() => (
          <>
            <Label htmlFor="zoomSensitivity" testId="zoomSensitivity">
              Zoom sensitivity
            </Label>
            <div className="toggle-field">
              <Range
                min={0.01}
                max={2}
                step={0.01}
                value={zoomSensitivity}
                onChange={(value) => {
                  if (Number.isNaN(value) || value == null) {
                    return;
                  }

                  setZoomSensitivity(value);
                }}
              />
            </div>
            <HelperMessage>
              The sensitivity of the zoom when using the mouse wheel. Lower values will zoom slower.
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="throttleChatNode">
        {() => (
          <>
            <Label htmlFor="throttleChatNode" testId="throttleChatNode">
              Chat node throttle milliseconds
            </Label>
            <div className="toggle-field">
              <TextField
                type="number"
                value={settings.throttleChatNode ?? 100}
                onChange={(event) => {
                  if ((event.target as HTMLInputElement).valueAsNumber >= 0) {
                    setSettings((state) => ({
                      ...state,
                      throttleChatNode: (event.target as HTMLInputElement).valueAsNumber,
                    }));
                  }
                }}
              />
            </div>
            <HelperMessage>
              Throttles the stream of chat node data into Rivet. Increasing this can improve performance. Set to 0 to
              disable.
            </HelperMessage>
          </>
        )}
      </Field>
    </div>
  );
};

export const OpenAiSettingsPage: FC = () => {
  const [settings, setSettings] = useAtom(settingsState);
  const chatNodeHeadersPairs = entries(settings.chatNodeHeaders ?? {}).map(([key, value]) => ({ key, value }));
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(chatNodeHeadersPairs);

  const onSetHeaders = (newHeaders: { key: string; value: string }[]) => {
    setHeaders(newHeaders);
    setSettings((state) => ({
      ...state,
      chatNodeHeaders: Object.fromEntries(newHeaders.map(({ key, value }) => [key, value])),
    }));
  };

  const configureAzure = () => {
    setSettings((state) => ({
      ...state,
      openAiEndpoint:
        'https://{your-resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2023-05-15',
      chatNodeHeaders: {
        'api-key': '',
      },
    }));

    setHeaders([{ key: 'api-key', value: '' }]);
  };

  const configureLmStudio = () => {
    setSettings((state) => ({
      ...state,
      openAiEndpoint: 'http://localhost:1234/v1/chat/completions',
    }));
  };

  return (
    <div css={fields}>
      <Field name="api-key" label="OpenAI API Key">
        {() => (
          <>
            <TextField
              type="password"
              value={settings.openAiKey}
              onChange={(event) =>
                setSettings((state) => ({ ...state, openAiKey: (event.target as HTMLInputElement).value }))
              }
            />
            <HelperMessage>You may also set the OPENAI_API_KEY environment variable</HelperMessage>
          </>
        )}
      </Field>
      <Field name="organization" label="OpenAI Organization">
        {() => (
          <>
            <TextField
              value={settings.openAiOrganization}
              onChange={(event) =>
                setSettings((state) => ({
                  ...state,
                  openAiOrganization: (event.target as HTMLInputElement).value,
                }))
              }
            />
            <HelperMessage>
              You may also set the OPENAI_ORG_ID environment variable. This is only required if you are a member of a
              shared organization.
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="timeout" label="OpenAI Timeout (ms)">
        {() => (
          <>
            <TextField
              type="number"
              value={settings.chatNodeTimeout ?? DEFAULT_CHAT_NODE_TIMEOUT}
              onChange={(event) => {
                if ((event.target as HTMLInputElement).valueAsNumber > 0) {
                  setSettings((state) => ({
                    ...state,
                    chatNodeTimeout: (event.target as HTMLInputElement).valueAsNumber,
                  }));
                }
              }}
            />
            <HelperMessage>
              The timeout for the initial response for a Chat node. If you are using local models, you may need to
              increase this. Chat nodes are automatically retried if they time out. If you notice a chat node hanging
              for a long time, you may want to increase this.
            </HelperMessage>
          </>
        )}
      </Field>
      {!settings.openAiEndpoint && (
        <Field name="autoConfiguration" label="Auto Configuration">
          {() => (
            <div className="auto-configurations">
              <div className="configure-azure">
                <Button appearance="primary" onClick={configureAzure}>
                  Configure For Azure OpenAI
                </Button>
                <HelperMessage>
                  You can click this button to set up a configuration for Azure OpenAI. You will have to fill in
                  placeholder fields in the OpenAI Endpoint, and fill in your API key header.
                </HelperMessage>
              </div>
              <div className="configure-lmstudio">
                <Button appearance="primary" onClick={configureLmStudio}>
                  Configure For LM Studio
                </Button>
                <HelperMessage>
                  You can click this button to set up a configuration for LM Studio. You will also need to either use
                  the Node executor, or enable CORS in your LM Studio settings.
                </HelperMessage>
              </div>
            </div>
          )}
        </Field>
      )}
      <Field name="organization" label="OpenAI Endpoint">
        {() => (
          <>
            <TextField
              value={settings.openAiEndpoint}
              onChange={(event) =>
                setSettings((state) => ({ ...state, openAiEndpoint: (event.target as HTMLInputElement).value }))
              }
            />
            <HelperMessage>
              Default endpoint to use for Chat nodes. Set to any OpenAI-compatible API endpoint. Leave blank to use
              OpenAI itself. You may also set the OPENAI_API_ENDPOINT environment variable.
            </HelperMessage>
          </>
        )}
      </Field>
      <KeyValuePairs
        label="Chat Node Headers"
        helperMessage="Headers to send with each request of a Chat node to its endpoint. You can use this for alternative APIs such as Azure OpenAI."
        name="chatNodeHeaders"
        keyValuePairs={headers}
        isValuesSecret
        onAddPair={() => onSetHeaders([...headers, { key: '', value: '' }])}
        onDeletePair={(index) => onSetHeaders(headers.filter((_, headerIndex) => headerIndex !== index))}
        onPairChange={(index, keyOrValue, value) => {
          const newHeaders = [...headers];
          newHeaders[index]![keyOrValue] = value;
          onSetHeaders(newHeaders);
        }}
      />
    </div>
  );
};

export const PluginsSettingsPage: FC = () => {
  const plugins = useDependsOnPlugins();
  const projectPlugins = useAtomValue(pluginsState);
  const failedPlugins = projectPlugins.filter((plugin) => plugin.error);
  const [, setPluginRetryCounter] = useAtom(pluginRetryCounterState);
  const [settings, setSettings] = useAtom(settingsState);

  if (plugins.length === 0 && failedPlugins.length === 0) {
    return (
      <div>
        No plugins are enabled in this workspace. Enable plugins in the project settings panel and their settings will
        appear here.
      </div>
    );
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
      {plugins.map((plugin) => {
        if (plugin.configPage) {
          return null;
        }

        return (
          <section key={plugin.id}>
            <Header>{plugin.name ?? plugin.id}</Header>
            {entries(plugin.configSpec ?? {}).map(([key, config]) => (
              <Field key={key} name={`plugin-${plugin.id}-${key}`} label={`${config.label} (${plugin.id})`}>
                {() =>
                  match(config)
                    .with(
                      { type: 'string' },
                      { type: 'secret' },
                      (typedConfig: StringPluginConfigurationSpec | SecretPluginConfigurationSpec) => (
                        <>
                          <TextField
                            value={(settings.pluginSettings?.[plugin.id]?.[key] as string | undefined) ?? ''}
                            type={typedConfig.type === 'secret' ? 'password' : 'text'}
                            onChange={(event) =>
                              setSettings((state) => ({
                                ...state,
                                pluginSettings: {
                                  ...state.pluginSettings,
                                  [plugin.id]: {
                                    ...state.pluginSettings?.[plugin.id],
                                    [key]: (event.target as HTMLInputElement).value,
                                  },
                                },
                              }))
                            }
                          />
                          {typedConfig.helperText && <HelperMessage>{typedConfig.helperText}</HelperMessage>}
                        </>
                      ),
                    )
                    .otherwise(() => null)
                }
              </Field>
            ))}
          </section>
        );
      })}
    </div>
  );
};

export const CustomPluginsSettingsPage: FC<{ pluginId: string }> = ({ pluginId }) => {
  const plugins = useDependsOnPlugins();
  const [settings, setSettings] = useAtom(settingsState);
  const plugin = plugins.find((candidate) => candidate.id === pluginId);

  if (!plugin) {
    return <div>Plugin not found</div>;
  }

  if (!plugin.configPage) {
    return <>Config page not found</>;
  }

  return (
    <div css={fields}>
      <section key={plugin.id}>
        <Header>{plugin.configPage.label ?? plugin.id}</Header>
        {entries(plugin.configSpec ?? {}).map(([key, config]) => (
          <Field key={key} name={`plugin-${plugin.id}-${key}`} label={`${config.label} (${plugin.id})`}>
            {() =>
              match(config)
                .with(
                  { type: 'string' },
                  { type: 'secret' },
                  (typedConfig: StringPluginConfigurationSpec | SecretPluginConfigurationSpec) => (
                    <>
                      <TextField
                        value={(settings.pluginSettings?.[plugin.id]?.[key] as string | undefined) ?? ''}
                        type={typedConfig.type === 'secret' ? 'password' : 'text'}
                        onChange={(event) =>
                          setSettings((state) => ({
                            ...state,
                            pluginSettings: {
                              ...state.pluginSettings,
                              [plugin.id]: {
                                ...state.pluginSettings?.[plugin.id],
                                [key]: (event.target as HTMLInputElement).value,
                              },
                            },
                          }))
                        }
                      />
                      {typedConfig.helperText && <HelperMessage>{typedConfig.helperText}</HelperMessage>}
                    </>
                  ),
                )
                .otherwise(() => null)
            }
          </Field>
        ))}
      </section>
    </div>
  );
};

export const UpdatesSettingsPage: FC = () => {
  const checkForUpdatesNow = useCheckForUpdate({ notifyNoUpdates: true, force: true });
  const [checkForUpdates, setCheckForUpdates] = useAtom(checkForUpdatesState);
  const skippedMaxVersion = useAtomValue(skippedMaxVersionState);
  const [currentVersion, setCurrentVersion] = useState('');

  useAsyncEffect(async () => {
    setCurrentVersion(await getAppVersion());
  }, []);

  return (
    <div css={fields}>
      <p>
        You are currently on <strong>Rivet {currentVersion}</strong>
      </p>
      <Field name="check-for-updates">
        {() => (
          <>
            <Label htmlFor="check-for-updates" testId="check-for-updates">
              Check for updates on startup
            </Label>
            <div className="toggle-field">
              <Toggle
                id="check-for-updates"
                isChecked={checkForUpdates}
                onChange={(event) => setCheckForUpdates(event.target.checked)}
              />
            </div>
            <HelperMessage>Automatically check for updates on startup</HelperMessage>
          </>
        )}
      </Field>
      <Field name="check-for-updates-now">
        {() => (
          <Button appearance="primary" onClick={wrapAsync(checkForUpdatesNow, 'Check for updates')}>
            Check for updates now
          </Button>
        )}
      </Field>
      {skippedMaxVersion && (
        <Field name="skipped-update-version">
          {() => (
            <>
              <Label htmlFor="skipped-update-version" testId="skipped-update-version">
                Skipped update version
              </Label>
              <div>You have skipped version {skippedMaxVersion}. You may update by clicking the button above.</div>
            </>
          )}
        </Field>
      )}
    </div>
  );
};
