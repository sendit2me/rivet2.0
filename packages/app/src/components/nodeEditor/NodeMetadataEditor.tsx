import { type FC, useRef, useState } from 'react';
import InlineEdit from '@atlaskit/inline-edit';
import Textarea from '@atlaskit/textarea';
import TextField from '@atlaskit/textfield';
import { type ChartNode } from '@ironclad/rivet-core';
import { NodeColorPicker } from '../NodeColorPicker.js';

const NodeTitleInlineEditor: FC<{
  nodeId: string;
  title: string | undefined;
  onTitleChange: (title: string) => void;
}> = ({ nodeId, title, onTitleChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const titleBeforeEditRef = useRef(title ?? '');
  const currentTitle = title ?? '';

  const startEditing = () => {
    titleBeforeEditRef.current = currentTitle;
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (currentTitle !== titleBeforeEditRef.current) {
      onTitleChange(titleBeforeEditRef.current);
    }

    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TextField
        autoFocus
        id={`node-title-${nodeId}`}
        name={`node-title-${nodeId}`}
        value={currentTitle}
        onBlur={() => setIsEditing(false)}
        onChange={(event) => onTitleChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditing();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            setIsEditing(false);
          }
        }}
        placeholder="Some title"
      />
    );
  }

  return (
    <button type="button" className="node-title-read-button" aria-label="Edit node title" onClick={startEditing}>
      <div className={currentTitle ? 'title-read-content' : 'title-read-content is-empty'}>
        {currentTitle || 'Some title'}
      </div>
    </button>
  );
};

export const NodeMetadataEditor: FC<{
  node: ChartNode;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onColorChange: (color: { bg: string; border: string } | undefined) => void;
}> = ({ node, onTitleChange, onDescriptionChange, onColorChange }) => {
  const nodeDescriptionBeforeEditRef = useRef(node.description ?? '');

  return (
    <div className="node-metadata-row">
      <div className="node-color-picker">
        <NodeColorPicker currentColor={node.visualData.color} onChange={onColorChange} />
      </div>
      <div className="node-metadata-fields">
        <div className="node-title-field">
          <NodeTitleInlineEditor key={node.id} nodeId={node.id} title={node.title} onTitleChange={onTitleChange} />
        </div>
        <div className="node-description-field">
          <InlineEdit
            key={`node-description-${node.id}`}
            label="Node description"
            defaultValue={node.description ?? ''}
            onEdit={() => {
              nodeDescriptionBeforeEditRef.current = node.description ?? '';
            }}
            onCancel={() => {
              if ((node.description ?? '') !== nodeDescriptionBeforeEditRef.current) {
                onDescriptionChange(nodeDescriptionBeforeEditRef.current);
              }
            }}
            onConfirm={(description) => {
              if ((node.description ?? '') !== description) {
                onDescriptionChange(description);
              }
            }}
            hideActionButtons
            readViewFitContainerWidth
            readView={() => (
              <div className={node.description ? 'description-read-content' : 'description-read-content is-empty'}>
                {node.description || 'Description...'}
              </div>
            )}
            editView={(fieldProps, ref) => (
              <Textarea
                ref={ref}
                id={fieldProps.id}
                name={fieldProps.name}
                value={fieldProps.value ?? ''}
                isRequired={fieldProps.isRequired}
                isDisabled={fieldProps.isDisabled}
                isInvalid={fieldProps.isInvalid}
                onBlur={fieldProps.onBlur}
                onFocus={fieldProps.onFocus}
                onChange={(event) => {
                  const nextDescription = event.currentTarget.value;
                  fieldProps.onChange(nextDescription);
                  onDescriptionChange(nextDescription);
                }}
                placeholder="Description..."
                minimumRows={3}
                resize="smart"
              />
            )}
          />
        </div>
      </div>
    </div>
  );
};
