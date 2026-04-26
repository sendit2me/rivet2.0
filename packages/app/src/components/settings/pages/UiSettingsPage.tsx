import { type FC } from 'react';
import { useAtom } from 'jotai';
import { Field, HelperMessage, Label } from '@atlaskit/form';
import Select from '@atlaskit/select';
import Range from '@atlaskit/range';
import {
  DEFAULT_UI_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  UI_FONT_SIZE_STEP,
  clampUiFontSize,
} from '../../../utils/uiFontSize.js';
import {
  preservePortTextCaseState,
  resolveEditorPreferences,
  settingsState,
  type Theme,
  themeState,
  themes,
  zoomSensitivityState,
} from '../../../state/settings.js';
import { uiFontSizeState } from '../../../state/ui.js';
import { fields } from '../settingsPageStyles.js';
import { LabeledToggle } from '../../LabeledToggle.js';

export const UiSettingsPage: FC = () => {
  const [settings, setSettings] = useAtom(settingsState);
  const [theme, setTheme] = useAtom(themeState);
  const [uiFontSize, setUiFontSize] = useAtom(uiFontSizeState);
  const [zoomSensitivity, setZoomSensitivity] = useAtom(zoomSensitivityState);
  const [preservePortTextCase, setPreservePortTextCase] = useAtom(preservePortTextCaseState);
  const editorPreferences = resolveEditorPreferences(settings);
  const normalizedUiFontSize = clampUiFontSize(uiFontSize);

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
      <Field name="uiFontSize">
        {() => (
          <>
            <Label htmlFor="uiFontSize" testId="uiFontSize">
              UI font size: {normalizedUiFontSize}px
            </Label>
            <div className="toggle-field">
              <Range
                min={MIN_UI_FONT_SIZE}
                max={MAX_UI_FONT_SIZE}
                step={UI_FONT_SIZE_STEP}
                value={normalizedUiFontSize}
                onChange={(value) => {
                  if (Number.isNaN(value) || value == null) {
                    setUiFontSize(DEFAULT_UI_FONT_SIZE);
                    return;
                  }

                  setUiFontSize(clampUiFontSize(value));
                }}
              />
            </div>
            <HelperMessage>
              Scales Rivet UI text and icon glyphs. Code editor text uses its separate editor font-size controls.
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
      <Field name="preserve-port-text-case">
        {() => (
          <>
            <LabeledToggle
              id="preserve-port-text-case"
              isChecked={preservePortTextCase}
              onChange={setPreservePortTextCase}
              label="Preserve text case for node ports"
              className="settings-toggle-field"
            />
            <HelperMessage>
              This WILL preserve the text format of the node port names. e.g. `newInputPort` will be shown instead of
              `NEWINPUTPORT` when enabled
            </HelperMessage>
          </>
        )}
      </Field>
      <Field name="default-node-colors">
        {() => (
          <>
            <LabeledToggle
              id="default-node-colors"
              isChecked={editorPreferences.applyDefaultNodeColors}
              onChange={(value) =>
                setSettings((state) => ({
                  ...state,
                  defaultNodeColors: value,
                }))
              }
              label="Default node colors"
              className="settings-toggle-field"
            />
            <HelperMessage>When enabled, some newly added nodes use default colors.</HelperMessage>
          </>
        )}
      </Field>
      <Field name="open-node-settings-on-create">
        {() => (
          <>
            <LabeledToggle
              id="open-node-settings-on-create"
              isChecked={editorPreferences.openNodeSettingsOnCreate}
              onChange={(value) =>
                setSettings((state) => ({
                  ...state,
                  openNodeSettingsOnCreate: value,
                }))
              }
              label="Open node settings on create"
              className="settings-toggle-field"
            />
            <HelperMessage>When enabled, newly created nodes open their settings panel immediately.</HelperMessage>
          </>
        )}
      </Field>
    </div>
  );
};
