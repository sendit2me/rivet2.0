import { type FC } from 'react';
import { type LlmPresetOverrides } from '@valerypopoff/rivet2-core';
import { modelConfigFormStyles } from './modelConfigFormStyles.js';
import {
  ConnectionFields,
  BehaviorFields,
  CONNECTION_KEYS,
  BEHAVIOR_KEYS,
  mergeKeys,
  pickKeys,
} from './modelConfigFields.js';
import { JsonObjectField } from './JsonObjectField.js';

/**
 * Presentational editor for a Preset's `overrides` (Feature 005 Phase C1). `LlmPresetOverrides` is a
 * **partial** — an absent key means "inherit from the resolved Profile + Skill". So the shared field
 * groups run in `override` mode, where each scalar field has a per-field presence toggle: the editor
 * reads/writes by key PRESENCE, making "not overridden" distinguishable from "set to empty/zero".
 * Emits `undefined` when nothing is overridden, so the preset carries no empty `overrides` object.
 * Pure: `value` in, `onChange` out, no store access.
 */
export const LlmOverridesForm: FC<{
  value: LlmPresetOverrides | undefined;
  onChange: (next: LlmPresetOverrides | undefined) => void;
  isReadonly?: boolean;
}> = ({ value, onChange, isReadonly = false }) => {
  const overrides = value ?? {};
  const emit = (next: LlmPresetOverrides) => onChange(Object.keys(next).length > 0 ? next : undefined);

  return (
    <div css={modelConfigFormStyles}>
      <ConnectionFields
        value={pickKeys(overrides, CONNECTION_KEYS)}
        onChange={(conn) => emit(mergeKeys(overrides, CONNECTION_KEYS, conn))}
        mode="override"
        idPrefix="override"
        isReadonly={isReadonly}
      />
      <BehaviorFields
        value={pickKeys(overrides, BEHAVIOR_KEYS)}
        onChange={(behavior) => emit(mergeKeys(overrides, BEHAVIOR_KEYS, behavior))}
        mode="override"
        idPrefix="override"
        isReadonly={isReadonly}
      />
      <JsonObjectField
        value={overrides.extraBody}
        label="Extra Body (JSON)"
        name="override-extraBody"
        isReadonly={isReadonly}
        helperMessage="Generic per-request body params; deep-merged over the Skill's extraBody. Leave blank to inherit."
        onChange={(next) => {
          const merged = { ...overrides };
          if (next === undefined) {
            delete merged.extraBody;
          } else {
            merged.extraBody = next;
          }
          emit(merged);
        }}
      />
    </div>
  );
};
