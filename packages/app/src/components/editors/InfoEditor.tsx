import { HelperMessage, Label } from '@atlaskit/form';
import { type ChartNode, type InfoEditorDefinition } from '@valerypopoff/rivet2-core';
import { type FC } from 'react';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';

export const InfoEditor: FC<
  Pick<SharedEditorProps, 'node'> & {
    editor: InfoEditorDefinition<ChartNode>;
  }
> = ({ node, editor }) => {
  const helperMessage = getHelperMessage(editor, node.data);

  if (!editor.label.trim() && !helperMessage) {
    return null;
  }

  return (
    <div className="editor-wrapper-wrapper node-editor-info">
      {editor.label.trim() && <Label htmlFor="">{editor.label}</Label>}
      {helperMessage && (
        <div className="node-editor-info-helper">
          <HelperMessage>{helperMessage}</HelperMessage>
        </div>
      )}
    </div>
  );
};
