import { type FC } from 'react';
import { useAtom } from 'jotai';
import { Field, Label } from '@atlaskit/form';
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
import { FieldHelperMessage } from '../../FieldHelperMessage.js';
import { SegmentedEditor } from '../../editors/SegmentedEditor.js';

export const UiSettingsPage: FC = () => {
  const [settings, setSettings] = useAtom(settingsState);
  const [theme, setTheme] = useAtom(themeState);
  const [uiFontSize, setUiFontSize] = useAtom(uiFontSizeState);
  const [zoomSensitivity, setZoomSensitivity] = useAtom(zoomSensitivityState);
  const [preservePortTextCase, setPreservePortTextCase] = useAtom(preservePortTextCaseState);
  const editorPreferences = resolveEditorPreferences(settings);
  const normalizedUiFontSize = clampUiFontSize(uiFontSize);
  const capitalizeNodePortNames = !preservePortTextCase;

  return (
    <div css={fields}>
      <SegmentedEditor
        value={theme}
        onChange={(value) => setTheme(value as Theme)}
        isReadonly={false}
        isDisabled={false}
        label="Theme"
        name="theme"
        options={themes}
      />
      <Field name="uiFontSize">
        {() => (
          <>
            <Label htmlFor="uiFontSize" testId="uiFontSize">
              UI font size: {normalizedUiFontSize}px
            </Label>
            <FieldHelperMessage>
              Scales Rivet UI text and icon glyphs. Code editor text uses its separate editor font-size controls.
            </FieldHelperMessage>
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
          </>
        )}
      </Field>
      <Field name="zoomSensitivity">
        {() => (
          <>
            <Label htmlFor="zoomSensitivity" testId="zoomSensitivity">
              Zoom sensitivity
            </Label>
            <FieldHelperMessage>
              The sensitivity of the zoom when using the mouse wheel. Lower values will zoom slower.
            </FieldHelperMessage>
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
          </>
        )}
      </Field>
      <Field name="capitalize-node-port-names">
        {() => (
          <>
            <LabeledToggle
              id="capitalize-node-port-names"
              isChecked={capitalizeNodePortNames}
              onChange={(value) => setPreservePortTextCase(!value)}
              label="Capitalize node port names"
              helperMessage={
                <>
                  When enabled, node port names are shown in uppercase, e.g. `newInputPort` is shown as `NEWINPUTPORT`.
                  Disable this to preserve the original text case for each port.
                </>
              }
              className="settings-toggle-field"
            />
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
              helperMessage="When enabled, some newly added nodes use default colors."
              className="settings-toggle-field"
            />
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
              helperMessage="When enabled, newly created nodes open their settings panel immediately."
              className="settings-toggle-field"
            />
          </>
        )}
      </Field>
    </div>
  );
};
