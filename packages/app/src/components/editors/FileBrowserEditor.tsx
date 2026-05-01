import Button from '@atlaskit/button';
import { Field, HelperMessage } from '@atlaskit/form';
import {
  type FileBrowserEditorDefinition,
  type ChartNode,
  type DataId,
  uint8ArrayToBase64,
  type DataRef,
  type FilePathBrowserEditorDefinition,
} from '@ironclad/rivet-core';
import { nanoid } from 'nanoid/non-secure';
import prettyBytes from 'pretty-bytes';
import { type FC } from 'react';
import { useAtomValue } from 'jotai';
import { projectDataState } from '../../state/savedGraphs';
import { isPathBasedIOProvider } from '../../io/IOProvider';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';
import mime from 'mime';
import { wrapAsync } from '../../utils/errorHandling';
import { useIOProvider } from '../../providers/ProvidersContext';

export const DefaultFileBrowserEditor: FC<
  SharedEditorProps & {
    editor: FileBrowserEditorDefinition<ChartNode>;
  }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const ioProvider = useIOProvider();
  const data = node.data as Record<string, unknown>;
  const projectData = useAtomValue(projectDataState);
  const helperMessage = getHelperMessage(editor, node.data);

  const handleFileSelected = wrapAsync(
    async (binaryData: Uint8Array, fileName: string) => {
      const dataId = nanoid() as DataId;
      onChange(
        {
          ...node,
          data: {
            ...data,
            [editor.dataKey]: {
              refId: dataId,
            } satisfies DataRef,
            [editor.mediaTypeDataKey]: mime.getType(fileName) ?? 'application/octet-stream',
          },
        },
        {
          [dataId]: (await uint8ArrayToBase64(binaryData)) ?? '',
        },
      );
    },
    'Load file',
  );

  const pickFile = wrapAsync(
    async () => {
      await ioProvider.readFileAsBinary(handleFileSelected);
    },
    'Open file picker',
  );

  const dataRef = data[editor.dataKey] as DataRef | undefined;
  const b64Data = dataRef ? projectData?.[dataRef.refId] : undefined;

  const dataUri = b64Data ? `data:base64,${b64Data}` : undefined;
  const dataByteLength = b64Data ? Math.round(b64Data.length * 0.75) : undefined;

  return (
    <Field name={editor.dataKey} label={editor.label}>
      {() => (
        <div>
          {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
          <Button onClick={pickFile} isDisabled={isReadonly || isDisabled}>
            Pick File
          </Button>
          <div className="current">{dataUri && <span>Data ({prettyBytes(dataByteLength ?? NaN)})</span>}</div>
        </div>
      )}
    </Field>
  );
};

export const DefaultFilePathBrowserEditor: FC<
  SharedEditorProps & {
    editor: FilePathBrowserEditorDefinition<ChartNode>;
  }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const ioProvider = useIOProvider();
  const data = node.data as Record<string, unknown>;
  const helperMessage = getHelperMessage(editor, node.data);

  const pickFile = wrapAsync(
    async () => {
      if (!isPathBasedIOProvider(ioProvider)) return;
      const path = await ioProvider.openFilePath();
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
    'Open file path picker',
  );

  return (
    <Field name={editor.dataKey} label={editor.label}>
      {() => (
        <div>
          {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
          <Button onClick={pickFile} isDisabled={isReadonly || isDisabled}>
            Pick File
          </Button>
          <div className="current">{data[editor.dataKey] != null && <span>{data[editor.dataKey] as string}</span>}</div>
        </div>
      )}
    </Field>
  );
};
