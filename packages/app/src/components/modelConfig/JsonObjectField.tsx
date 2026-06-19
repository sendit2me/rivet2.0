import { type FC, useState } from 'react';
import { Field } from '@atlaskit/form';
import TextArea from '@atlaskit/textarea';
import { css } from '@emotion/react';

const styles = css`
  .json-object-field-error {
    margin-top: 4px;
    color: var(--error, #e5493a);
    font-size: var(--ui-font-size-sm);
    line-height: 1.4;
  }
`;

function toText(value: Record<string, unknown> | undefined): string {
  if (value === undefined || Object.keys(value).length === 0) {
    return '';
  }
  return JSON.stringify(value, null, 2);
}

/** Result of interpreting the JSON textarea: empty ⇒ clear; object ⇒ commit; error ⇒ don't commit. */
export type JsonObjectParseResult =
  | { kind: 'empty' }
  | { kind: 'object'; value: Record<string, unknown> }
  | { kind: 'error'; message: string };

/** Pure parse-and-validate for {@link JsonObjectField}. Empty ⇒ clear; valid JSON object ⇒ commit;
 *  invalid JSON or a non-object (array/scalar) ⇒ an error (caller must not commit). */
export function parseJsonObjectInput(raw: string): JsonObjectParseResult {
  if (raw.trim() === '') {
    return { kind: 'empty' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'error', message: 'Invalid JSON — fix to apply (not saved while invalid).' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'error', message: 'Must be a JSON object, e.g. { "key": "value" }.' };
  }

  return { kind: 'object', value: parsed as Record<string, unknown> };
}

/**
 * Presentational editor for an optional object value, edited as JSON (the deferred 004 / SPEC D3
 * piece). Pure: `value` in, `onChange` out, no store access — reused by the node `extraBody` custom
 * editor and by the Skill / Preset-overrides forms.
 *
 * Parse-on-edit with inline validation: empty ⇒ `onChange(undefined)`; valid JSON **object** ⇒
 * `onChange(parsed)`; invalid JSON or a non-object (array/scalar) ⇒ an inline error and the value is
 * **not committed** (no `onChange`) — never a string-backed shadow field (rejected in 004).
 */
export const JsonObjectField: FC<{
  value: Record<string, unknown> | undefined;
  onChange: (next: Record<string, unknown> | undefined) => void;
  label: string;
  name?: string;
  helperMessage?: string;
  isReadonly?: boolean;
}> = ({ value, onChange, label, name = 'json-object', helperMessage, isReadonly = false }) => {
  const [text, setText] = useState<string>(() => toText(value));
  const [error, setError] = useState<string | undefined>(undefined);

  const handleChange = (raw: string) => {
    setText(raw);

    const result = parseJsonObjectInput(raw);
    if (result.kind === 'error') {
      setError(result.message);
      return; // value not committed while invalid
    }

    setError(undefined);
    onChange(result.kind === 'empty' ? undefined : result.value);
  };

  return (
    <div css={styles}>
      <Field name={name} label={label} isDisabled={isReadonly}>
        {() => (
          <>
            <TextArea
              value={text}
              minimumRows={3}
              isReadOnly={isReadonly}
              isInvalid={error !== undefined}
              placeholder={helperMessage ?? '{ }'}
              onChange={(e) => handleChange((e.target as HTMLTextAreaElement).value)}
            />
            {error && <div className="json-object-field-error">{error}</div>}
          </>
        )}
      </Field>
    </div>
  );
};
