import { type FC, useState } from 'react';
import { useAtom } from 'jotai';
import TextField from '@atlaskit/textfield';
import Button from '@atlaskit/button';
import { Field } from '@atlaskit/form';
import { DEFAULT_CHAT_NODE_TIMEOUT } from '@rivet2/rivet-core';
import { entries } from '../../../utils/typeSafety';
import { KeyValuePairs } from '../../editors/KeyValuePairEditor.js';
import { settingsState } from '../../../state/settings.js';
import { fields } from '../settingsPageStyles.js';
import { FieldHelperMessage } from '../../FieldHelperMessage.js';

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
            <FieldHelperMessage>You may also set the OPENAI_API_KEY environment variable</FieldHelperMessage>
            <TextField
              type="password"
              value={settings.openAiKey}
              onChange={(event) =>
                setSettings((state) => ({ ...state, openAiKey: (event.target as HTMLInputElement).value }))
              }
            />
          </>
        )}
      </Field>
      <Field name="organization" label="OpenAI Organization">
        {() => (
          <>
            <FieldHelperMessage>
              You may also set the OPENAI_ORG_ID environment variable. This is only required if you are a member of a
              shared organization.
            </FieldHelperMessage>
            <TextField
              value={settings.openAiOrganization}
              onChange={(event) =>
                setSettings((state) => ({
                  ...state,
                  openAiOrganization: (event.target as HTMLInputElement).value,
                }))
              }
            />
          </>
        )}
      </Field>
      <Field name="timeout" label="OpenAI Timeout (ms)">
        {() => (
          <>
            <FieldHelperMessage>
              The timeout for the initial response for a Chat node. If you are using local models, you may need to
              increase this. Chat nodes are automatically retried if they time out. If you notice a chat node hanging
              for a long time, you may want to increase this.
            </FieldHelperMessage>
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
          </>
        )}
      </Field>
      {!settings.openAiEndpoint && (
        <Field name="autoConfiguration" label="Auto Configuration">
          {() => (
            <div className="auto-configurations">
              <div className="configure-azure">
                <FieldHelperMessage>
                  You can click this button to set up a configuration for Azure OpenAI. You will have to fill in
                  placeholder fields in the OpenAI Endpoint, and fill in your API key header.
                </FieldHelperMessage>
                <Button appearance="primary" onClick={configureAzure}>
                  Configure For Azure OpenAI
                </Button>
              </div>
              <div className="configure-lmstudio">
                <FieldHelperMessage>
                  You can click this button to set up a configuration for LM Studio. You will also need to either use
                  the Node executor, or enable CORS in your LM Studio settings.
                </FieldHelperMessage>
                <Button appearance="primary" onClick={configureLmStudio}>
                  Configure For LM Studio
                </Button>
              </div>
            </div>
          )}
        </Field>
      )}
      <Field name="organization" label="OpenAI Endpoint">
        {() => (
          <>
            <FieldHelperMessage>
              Default endpoint to use for Chat nodes. Set to any OpenAI-compatible API endpoint. Leave blank to use
              OpenAI itself. You may also set the OPENAI_API_ENDPOINT environment variable.
            </FieldHelperMessage>
            <TextField
              value={settings.openAiEndpoint}
              onChange={(event) =>
                setSettings((state) => ({ ...state, openAiEndpoint: (event.target as HTMLInputElement).value }))
              }
            />
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
