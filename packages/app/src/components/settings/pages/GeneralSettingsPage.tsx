import { type FC } from 'react';
import { useAtom } from 'jotai';
import TextField from '@atlaskit/textfield';
import { Field, HelperMessage, Label } from '@atlaskit/form';
import Select from '@atlaskit/select';
import Toggle from '@atlaskit/toggle';
import Range from '@atlaskit/range';
import {
  defaultExecutorState,
  executorOptions,
  previousDataPerNodeToKeepState,
  recordExecutionsState,
  settingsState,
  zoomSensitivityState,
} from '../../../state/settings.js';
import { fields } from '../settingsPageStyles.js';

export const GeneralSettingsPage: FC = () => {
  const [settings, setSettings] = useAtom(settingsState);
  const [recordExecutions, setRecordExecutions] = useAtom(recordExecutionsState);
  const [defaultExecutor, setDefaultExecutor] = useAtom(defaultExecutorState);
  const [previousDataPerNodeToKeep, setPreviousDataPerNodeToKeep] = useAtom(previousDataPerNodeToKeepState);
  const [zoomSensitivity, setZoomSensitivity] = useAtom(zoomSensitivityState);

  return (
    <div css={fields}>
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
