import { type FC, useCallback, useEffect, useRef, useState } from 'react';
import InlineEdit from '@atlaskit/inline-edit';
import Textarea from '@atlaskit/textarea';
import TextField from '@atlaskit/textfield';
import { type ChartNode } from '@valerypopoff/rivet2-core';
import { NodeColorPicker } from '../NodeColorPicker.js';

const METADATA_AUTOSAVE_DEBOUNCE_MS = 300;

function useDebouncedMetadataCommit(onCommit: (value: string) => void) {
  const timeoutRef = useRef<number | null>(null);
  const pendingValueRef = useRef<string | undefined>();
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const clearPending = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancelPending = useCallback(() => {
    clearPending();
    pendingValueRef.current = undefined;
  }, [clearPending]);

  const commitNow = useCallback(
    (value: string) => {
      cancelPending();
      onCommitRef.current(value);
    },
    [cancelPending],
  );

  const commitSoon = useCallback(
    (value: string) => {
      clearPending();
      pendingValueRef.current = value;
      timeoutRef.current = window.setTimeout(() => {
        const pendingValue = pendingValueRef.current;
        timeoutRef.current = null;
        pendingValueRef.current = undefined;

        if (pendingValue !== undefined) {
          onCommitRef.current(pendingValue);
        }
      }, METADATA_AUTOSAVE_DEBOUNCE_MS);
    },
    [clearPending],
  );

  useEffect(
    () => () => {
      cancelPending();
    },
    [cancelPending],
  );

  return { cancelPending, commitNow, commitSoon };
}

const NodeTitleInlineEditor: FC<{
  nodeId: string;
  title: string | undefined;
  onTitleChange: (title: string) => void;
}> = ({ nodeId, title, onTitleChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? '');
  const { commitNow, commitSoon } = useDebouncedMetadataCommit(onTitleChange);
  const isEditingRef = useRef(isEditing);
  const titleBeforeEditRef = useRef(title ?? '');

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraftTitle(title ?? '');
    }
  }, [title]);

  const startEditing = () => {
    titleBeforeEditRef.current = draftTitle;
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (draftTitle !== titleBeforeEditRef.current) {
      setDraftTitle(titleBeforeEditRef.current);
      commitNow(titleBeforeEditRef.current);
    }

    setIsEditing(false);
  };

  const finishEditing = () => {
    commitNow(draftTitle);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TextField
        autoFocus
        id={`node-title-${nodeId}`}
        name={`node-title-${nodeId}`}
        value={draftTitle}
        onBlur={finishEditing}
        onChange={(event) => {
          const nextTitle = event.currentTarget.value;
          setDraftTitle(nextTitle);
          commitSoon(nextTitle);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditing();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            finishEditing();
          }
        }}
        placeholder="Some title"
      />
    );
  }

  return (
    <button type="button" className="node-title-read-button" aria-label="Edit node title" onClick={startEditing}>
      <div className={draftTitle ? 'title-read-content' : 'title-read-content is-empty'}>
        {draftTitle || 'Some title'}
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
  const latestNodeDescriptionRef = useRef(node.description ?? '');
  const nodeDescriptionBeforeEditRef = useRef(node.description ?? '');
  const {
    cancelPending: cancelPendingDescription,
    commitNow: commitDescriptionNow,
    commitSoon: commitDescriptionSoon,
  } = useDebouncedMetadataCommit(onDescriptionChange);

  useEffect(() => {
    latestNodeDescriptionRef.current = node.description ?? '';
  }, [node.description]);

  useEffect(() => {
    cancelPendingDescription();
    nodeDescriptionBeforeEditRef.current = latestNodeDescriptionRef.current;
  }, [cancelPendingDescription, node.id]);

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
              nodeDescriptionBeforeEditRef.current = latestNodeDescriptionRef.current;
            }}
            onCancel={() => {
              cancelPendingDescription();

              if (latestNodeDescriptionRef.current !== nodeDescriptionBeforeEditRef.current) {
                commitDescriptionNow(nodeDescriptionBeforeEditRef.current);
              }
            }}
            onConfirm={(description) => {
              cancelPendingDescription();

              if (latestNodeDescriptionRef.current !== description) {
                commitDescriptionNow(description);
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
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                onChange={(event) => {
                  const nextDescription = event.currentTarget.value;
                  fieldProps.onChange(nextDescription);
                  commitDescriptionSoon(nextDescription);
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
