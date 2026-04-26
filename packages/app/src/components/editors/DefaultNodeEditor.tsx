import { type FC, useEffect, useState } from 'react';
import { type ChartNode, type EditorDefinition } from '@ironclad/rivet-core';
import { css } from '@emotion/react';
import { type SharedEditorProps } from './SharedEditorProps';
import { DefaultNodeEditorField } from './DefaultNodeEditorField';
import { useGetRivetUIContext } from '../../hooks/useGetRivetUIContext';
import { useProjectNodeRegistry } from '../../hooks/useProjectNodeRegistry';
import { produce } from 'immer';
import { handleError } from '../../utils/errorHandling.js';
import { getEditorListKey, getEditorRenderRows } from './editorUtils';

export const defaultEditorContainerStyles = css`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  align-content: start;
  gap: 16px;
  flex: 1 1 auto;
  min-height: 0;

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .row.has-side-control {
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 16px;
  }

  .use-input-toggle {
    align-self: start;
    margin-top: 36px;
    display: flex;
    align-items: flex-start;
  }

  .use-input-toggle-button {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--grey-darkish);
    border-radius: 16px;
    corner-shape: squircle;
    background: var(--grey-darkest);
    color: var(--foreground-muted);
    cursor: pointer;
    transition:
      background-color 0.15s ease-out,
      border-color 0.15s ease-out,
      color 0.15s ease-out;
  }

  .use-input-toggle-button:focus {
    outline: none;
  }

  .use-input-toggle-button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .use-input-toggle-button:hover:not(:disabled) {
    background: var(--grey-darkerish);
    color: var(--grey-light);
  }

  .use-input-toggle-button.is-active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .use-input-toggle-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .use-input-toggle-button svg {
    width: 18px;
    height: 18px;
  }

  .data-type-selector {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: 16px;
  }

  .editor-wrapper-wrapper {
    min-height: 0;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .row > :first-child label[id$='-label'],
  .row .editor-wrapper-wrapper > label {
    margin-bottom: 8px !important;
  }

  .node-editor-code-helper {
    margin-bottom: 10px;
    white-space: pre-line;
  }

  .node-editor-code-helper-after {
    margin-top: 8px;
    margin-bottom: 0;
  }

  .node-editor-code-helper > div {
    margin-block: 0;
  }

  .editor-viewport-shell {
    position: relative;
    min-height: 0;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 10px 10px 14px;
    background-color: var(--grey-darkest);
    border-radius: 16px;
    corner-shape: squircle;
  }

  .editor-wrapper {
    flex: 1 1 auto;
    min-height: 0;
    background-color: var(--grey-darker);
    border-radius: 12px;
    corner-shape: squircle;
    overflow: hidden;
  }

  .editor-container {
    height: 100%;
    min-height: 0;
    background-color: var(--grey-darker);
  }

  .row.code {
    align-items: start;
  }

  .row.code > :first-child {
    min-width: 0;
  }

  .node-editor-static-code-editor {
    min-height: 500px;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    gap: 0;
    padding: 10px;
    background-color: var(--grey-dark);
    border-radius: 16px;
    corner-shape: squircle;
  }

  .node-editor-static-code-editor .editor-container {
    flex: 1 1 auto;
    min-height: 0;
    border-radius: 12px;
    corner-shape: squircle;
    overflow: hidden;
  }

  .editor-status-line {
    margin-top: 6px;
    color: var(--foreground-muted);
    font-size: var(--ui-font-size-compact);
    font-family: 'Roboto Mono', monospace;
    line-height: 1.4;
  }

  .node-editor-code-resize-handle {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 10px;
    cursor: ns-resize;
    background: transparent;
    border-bottom: none;
  }

  .row.toggle .toggle-editor-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-block: 6px;
  }

  .row.toggle .toggle-editor-control-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .row.toggle .toggle-editor-switch,
  .row.toggle .toggle-editor-switch > * {
    margin-left: 0 !important;
  }

  .row.toggle .toggle-editor-switch > label[data-size] {
    margin: 0 0 0 -4px !important;
  }

  .row.toggle .toggle-editor-switch > label[data-size]:has(input:focus:not(:focus-visible)) {
    border-color: transparent !important;
    outline: none !important;
    box-shadow: none !important;
  }

  .row.toggle .toggle-editor-label {
    margin: 0;
    min-width: 75px;
    cursor: pointer;
  }

  .row.toggle .toggle-editor-label label {
    cursor: pointer;
  }

  .row.toggle .toggle-editor-helper {
    margin-left: 0;
  }

  .row.toggle .toggle-editor-helper > div {
    margin: 0;
  }

  .row.toggle .use-input-toggle label:first-child {
    min-width: unset;
  }

  .row.segmented .segmented-choice {
    margin-top: 2px;
  }

  .row.segmented .segmented-choice-option:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .inline-editor-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 180px));
    gap: 16px;
    align-items: start;
  }

  .node-editor-color-picker {
    width: min(180px, 100%);
  }
`;

export const DefaultNodeEditor: FC<
  Omit<SharedEditorProps, 'isDisabled'> & {
    onClose?: () => void;
  }
> = ({ node, onChange, isReadonly, onClose }) => {
  const [editors, setEditors] = useState<EditorDefinition<ChartNode>[]>([]);
  const [editorRefreshNonce, setEditorRefreshNonce] = useState(0);

  const getUIContext = useGetRivetUIContext();
  const projectNodeRegistry = useProjectNodeRegistry();
  const refreshEditors = () => setEditorRefreshNonce((value) => value + 1);

  useEffect(() => {
    (async () => {
      try {
        const dynamicImpl = projectNodeRegistry.createDynamicImpl(node);

        let loadedEditors = await dynamicImpl.getEditors(await getUIContext({ node }));

        loadedEditors = produce(loadedEditors, (draft) => {
          const autoFocused = draft.find((e) => e.autoFocus);
          if (!autoFocused) {
            const firstStringOrCodeEditor = draft.find(
              (e) =>
                e.type === 'string' ||
                e.type === 'code' ||
                e.type === 'number' ||
                e.type === 'dropdown' ||
                e.type === 'anyData',
            );
            if (firstStringOrCodeEditor) {
              firstStringOrCodeEditor.autoFocus = true;
            }
          }
        });

        setEditors(loadedEditors);
      } catch (err) {
        handleError(err, 'Failed to load editors for node', {
          metadata: {
            nodeId: node.id,
            nodeType: node.type,
          },
        });
      }
    })();
  }, [editorRefreshNonce, getUIContext, node, projectNodeRegistry]);

  const renderEditorField = (editor: EditorDefinition<ChartNode>, index: number) => {
    const isDisabled = editor.disableIf?.(node.data) ?? false;

    return (
      <DefaultNodeEditorField
        key={getEditorListKey(editor, index)}
        node={node}
        onChange={onChange}
        editor={editor}
        isReadonly={isReadonly}
        isDisabled={isDisabled}
        onClose={onClose}
        onRefreshEditors={refreshEditors}
      />
    );
  };

  return (
    <div css={defaultEditorContainerStyles}>
      {getEditorRenderRows(editors).map((row) => {
        if (row.type === 'inline') {
          return (
            <div className="inline-editor-row" key={row.key}>
              {row.editors.map((inlineEditor, inlineIndex) =>
                renderEditorField(inlineEditor, row.startIndex + inlineIndex),
              )}
            </div>
          );
        }

        return renderEditorField(row.editor, row.index);
      })}
    </div>
  );
};
