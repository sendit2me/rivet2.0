import { type FC } from 'react';
import { Field, HelperMessage } from '@atlaskit/form';
import Select from '@atlaskit/select';
import { getLlmSelectorOptions, LLM_SELECTOR_NONE_VALUE } from '../../utils/llmSelectorOptions';

/**
 * Shared field for the LLM selectors (Feature 005 Phase A; re-pointed to the project in Phase B).
 * Builds options from the given model-config entities via `getLlmSelectorOptions` (None + sorted +
 * dangling-id row) and renders an Atlaskit Select. Its own module (R3) so the node selectors and the
 * authoring forms both reuse it without an import cycle (forms ← field, selectors ← modal ← forms).
 */
export const LlmSelectorField: FC<{
  items: ReadonlyArray<{ id: string; name?: string }>;
  value: string | undefined;
  name: string;
  label: string;
  isReadonly: boolean;
  helperMessage?: string;
  placeholder: string;
  onChange: (selected: string) => void;
}> = ({ items, value, name, label, isReadonly, helperMessage, placeholder, onChange }) => {
  const options = getLlmSelectorOptions(items, { selectedId: value });
  const selectedOption = options.find((option) => option.value === (value ?? LLM_SELECTOR_NONE_VALUE));

  return (
    <Field name={name} label={label} isDisabled={isReadonly}>
      {({ fieldProps }) => (
        <>
          {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
          <Select
            {...fieldProps}
            isDisabled={isReadonly}
            options={options}
            value={selectedOption}
            onChange={(selected) => onChange(selected!.value)}
            placeholder={placeholder}
          />
        </>
      )}
    </Field>
  );
};
