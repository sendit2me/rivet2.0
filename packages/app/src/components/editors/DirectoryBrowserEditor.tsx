import Button from '@atlaskit/button';
import { Field, HelperMessage } from '@atlaskit/form';
import { type ChartNode, type DirectoryBrowserEditorDefinition } from '@rivet2/rivet-core';
import { type FC } from 'react';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';
import { isPathBasedIOProvider } from '../../io/IOProvider';
import { wrapAsync } from '../../utils/errorHandling';
import { useIOProvider } from '../../providers/ProvidersContext';

export const DefaultDirectoryBrowserEditor: FC<
  SharedEditorProps & {
    editor: DirectoryBrowserEditorDefinition<ChartNode>;
  }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const ioProvider = useIOProvider();
  const data = node.data as Record<string, unknown>;
  const helperMessage = getHelperMessage(editor, node.data);

  const pickDirectory = wrapAsync(
    async () => {
      if (!isPathBasedIOProvider(ioProvider)) return;
      const path = await ioProvider.openDirectory();
      if (path) {
        onChange({
          ...node,
          data: {
            ...data,
            [editor.dataKey]: path as string,
          },
        });
      }
    },
    'Open directory picker',
  );

  return (
    <Field name={editor.dataKey} label={editor.label}>
      {() => (
        <div>
          {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
          <Button onClick={pickDirectory} isDisabled={isReadonly || isDisabled}>
            Pick Directory
          </Button>
          <div className="current">{data[editor.dataKey] != null && <span>{data[editor.dataKey] as string}</span>}</div>
        </div>
      )}
    </Field>
  );
};
