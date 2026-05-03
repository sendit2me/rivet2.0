import { type FC } from 'react';
import { useAtom } from 'jotai';
import TextField from '@atlaskit/textfield';
import { Field, Label } from '@atlaskit/form';
import {
  defaultExecutorState,
  getExecutorOptions,
  previousDataPerNodeToKeepState,
  settingsState,
} from '../../../state/settings.js';
import { fields } from '../settingsPageStyles.js';
import { FieldHelperMessage } from '../../FieldHelperMessage.js';
import { SegmentedEditor } from '../../editors/SegmentedEditor.js';
import { useExecutorSessionHostConfig } from '../../../providers/ExecutorSessionContext.js';

export const GeneralSettingsPage: FC = () => {
  const [settings, setSettings] = useAtom(settingsState);
  const [defaultExecutor, setDefaultExecutor] = useAtom(defaultExecutorState);
  const [previousDataPerNodeToKeep, setPreviousDataPerNodeToKeep] = useAtom(previousDataPerNodeToKeepState);
  const hostConfig = useExecutorSessionHostConfig();
  const executorOptions = getExecutorOptions({ hasInternalExecutorUrl: !!hostConfig?.internalExecutorUrl });

  const setDefaultExecutorMode = (value: string | boolean) => {
    if (value === 'browser' || value === 'nodejs') {
      setDefaultExecutor(value);
    }
  };

  return (
    <div css={fields}>
      <Field name="recording-speed" label="Recording delay between chats (ms)">
        {() => (
          <>
            <FieldHelperMessage>
              This is the delay between each chat message when playing back a recording. Lower values will play
              recordings back faster.
            </FieldHelperMessage>
            <TextField
              type="number"
              value={settings.recordingPlaybackLatency}
              onChange={(event) => {
                const value = (event.target as HTMLInputElement).valueAsNumber;

                if (!Number.isFinite(value) || value < 0) {
                  return;
                }

                setSettings((state) => ({
                  ...state,
                  recordingPlaybackLatency: value,
                }));
              }}
            />
          </>
        )}
      </Field>
      <SegmentedEditor
        value={defaultExecutor}
        onChange={setDefaultExecutorMode}
        isReadonly={false}
        isDisabled={false}
        label="Default executor"
        name="defaultExecutor"
        helperMessage="The default executor to use when starting the application. The browser executor is more stable, but the node executor is required for some features and plugins."
        options={executorOptions}
      />
      <Field name="previousDataPerNodeToKeep">
        {() => (
          <>
            <Label htmlFor="previousDataPerNodeToKeep" testId="previousDataPerNodeToKeep">
              Previous data per node to keep
            </Label>
            <FieldHelperMessage>
              The number of previous data values to keep per node. Increasing this will increase memory usage, but allow
              you to go back further in time. -1 to disable and keep all.
            </FieldHelperMessage>
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
          </>
        )}
      </Field>
      <Field name="throttleChatNode">
        {() => (
          <>
            <Label htmlFor="throttleChatNode" testId="throttleChatNode">
              Chat node throttle milliseconds
            </Label>
            <FieldHelperMessage>
              Throttles the stream of chat node data into Rivet. Increasing this can improve performance. Set to 0 to
              disable.
            </FieldHelperMessage>
            <div className="toggle-field">
              <TextField
                type="number"
                value={settings.throttleChatNode ?? 100}
                onChange={(event) => {
                  const value = (event.target as HTMLInputElement).valueAsNumber;

                  if (!Number.isFinite(value) || value < 0) {
                    return;
                  }

                  setSettings((state) => ({
                    ...state,
                    throttleChatNode: value,
                  }));
                }}
              />
            </div>
          </>
        )}
      </Field>
    </div>
  );
};
