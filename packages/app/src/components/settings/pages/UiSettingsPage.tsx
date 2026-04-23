import { type FC } from 'react';
import { useAtom } from 'jotai';
import { Field, HelperMessage } from '@atlaskit/form';
import Select from '@atlaskit/select';
import Toggle from '@atlaskit/toggle';
import {
  preservePortTextCaseState,
  resolveEditorPreferences,
  settingsState,
  type Theme,
  themeState,
  themes,
} from '../../../state/settings.js';
import { fields } from '../settingsPageStyles.js';

export const UiSettingsPage: FC = () => {
  const [settings, setSettings] = useAtom(settingsState);
  const [theme, setTheme] = useAtom(themeState);
  const [preservePortTextCase, setPreservePortTextCase] = useAtom(preservePortTextCaseState);
  const editorPreferences = resolveEditorPreferences(settings);

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
              id="preserve-port-text-case"
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
      <Field name="default-node-colors" label="Default node colors">
        {() => (
          <>
            <Toggle
              id="default-node-colors"
              isChecked={editorPreferences.applyDefaultNodeColors}
              onChange={(event) =>
                setSettings((state) => ({
                  ...state,
                  defaultNodeColors: event.target.checked,
                }))
              }
            />
            <HelperMessage>
              When enabled, some newly added nodes use default colors.
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="open-node-settings-on-create" label="Open node settings on create">
        {() => (
          <>
            <Toggle
              id="open-node-settings-on-create"
              isChecked={editorPreferences.openNodeSettingsOnCreate}
              onChange={(event) =>
                setSettings((state) => ({
                  ...state,
                  openNodeSettingsOnCreate: event.target.checked,
                }))
              }
            />
            <HelperMessage>
              When enabled, newly created nodes open their settings panel immediately.
            </HelperMessage>
          </>
        )}
      </Field>
    </div>
  );
};
