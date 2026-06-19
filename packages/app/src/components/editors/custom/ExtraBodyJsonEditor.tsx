import { type CustomEditorDefinition, type ChartNode } from '@valerypopoff/rivet2-core';
import { type FC } from 'react';
import { type SharedEditorProps } from '../SharedEditorProps';
import { JsonObjectField } from '../../modelConfig/JsonObjectField';

/**
 * Custom-editor adapter (Feature 005 Phase C1) binding the node's object `extraBody` to the shared
 * {@link JsonObjectField}. Registered for `customEditorId: 'extraBodyJson'`. Lives in the node's
 * advanced/override group, so it is hidden behind the "Show overrides" preference by default — the
 * clean-node default (no `extraBody`) stays byte-identical.
 */
export const ExtraBodyJsonEditor: FC<
  SharedEditorProps & {
    editor: CustomEditorDefinition<ChartNode>;
  }
> = ({ node, onChange, editor, isReadonly, isDisabled }) => {
  const data = node.data as Record<string, unknown>;
  const dataKey = editor.dataKey ?? 'extraBody';
  const value = data[dataKey] as Record<string, unknown> | undefined;

  return (
    <JsonObjectField
      value={value}
      label={editor.label}
      name={dataKey}
      isReadonly={isReadonly || isDisabled}
      helperMessage={typeof editor.helperMessage === 'string' ? editor.helperMessage : undefined}
      onChange={(next) =>
        onChange({
          ...node,
          data: {
            ...data,
            [dataKey]: next,
          },
        })
      }
    />
  );
};
