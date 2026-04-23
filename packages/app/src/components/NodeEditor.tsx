import { type CSSProperties, type FC, useMemo, useState, type MouseEvent } from 'react';
import { editingNodeState } from '../state/graphBuilder.js';
import { nodesByIdState } from '../state/graph.js';
import styled from '@emotion/styled';
import { type ChartNode, type DataId } from '@ironclad/rivet-core';
import { useUnknownNodeComponentDescriptorFor } from '../hooks/useNodeTypes.js';
import { useProjectNodeRegistry } from '../hooks/useProjectNodeRegistry';
import { useHotkeys } from 'react-hotkeys-hook';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { isEqual, orderBy } from 'lodash-es';
import { ErrorBoundary } from 'react-error-boundary';
import { useSetStaticData } from '../hooks/useSetStaticData';
import { DefaultNodeEditor } from './editors/DefaultNodeEditor';
import { useAtomValue, useAtom } from 'jotai';
import { useEditNodeCommand } from '../commands/editNodeCommand';
import { NodeEditorGlobalControls } from './nodeEditor/NodeEditorGlobalControls.js';
import { NodeEditorResizeContext } from './nodeEditor/NodeEditorResizeContext.js';
import { ResizeHandle } from './ResizeHandle.js';
import { useNodeEditorWidth } from './nodeEditor/useNodeEditorWidth.js';

export const NodeEditorRenderer: FC = () => {
  const nodesById = useAtomValue(nodesByIdState);
  const [editingNodeId, setEditingNodeId] = useAtom(editingNodeState);

  const deselect = useStableCallback(() => {
    setEditingNodeId(null);
  });

  const selectedNode = editingNodeId ? nodesById[editingNodeId] : undefined;

  if (!editingNodeId || !selectedNode) {
    return null;
  }

  return (
    <ErrorBoundary fallback={null}>
      <NodeEditor selectedNode={selectedNode} onDeselect={deselect} />
    </ErrorBoundary>
  );
};

const Container = styled.div`
  position: absolute;
  top: var(--project-selector-height);
  right: 0;
  bottom: 0;
  z-index: 210;
  width: var(--node-editor-panel-width);
  max-width: 1000px;
  min-width: 500px;

  .node-editor-width-resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 14px;
    transform: translateX(-50%);
    cursor: col-resize;
    z-index: 2;
    touch-action: none;
    background: transparent;
  }

  &[data-is-resizing='true'] .panel-container {
    backdrop-filter: none;
  }

  .panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--grey-light);
    --label-color: var(--grey-light);
    --ds-text-subtlest: var(--grey-light);
    --ds-font-family-body: var(--font-family-monospace);
    --ds-font-family-heading: var(--font-family-monospace);
    --ds-font-family-code: var(--font-family-monospace);
    --label-font-family: var(--font-family-monospace);
    background-color: var(--grey-dark-bluish-seethrough);
    backdrop-filter: blur(2px);
    font-family: var(--font-family-monospace);
    width: 100%;
    box-shadow: -4px 0 3px rgba(0, 0, 0, 0.1);
    border-left: 1px solid var(--grey);
  }

  .panel-container input,
  .panel-container textarea,
  .panel-container button,
  .panel-container label {
    font-family: inherit;
  }

  .panel-container input::placeholder,
  .panel-container textarea::placeholder {
    color: var(--foreground-muted);
    opacity: 1;
  }

  /* Atlaskit HelperMessage hardcodes its own font family, so reset it in the panel scope. */
  .panel-container [aria-live='polite'],
  .panel-container [aria-live='polite'] * {
    font-family: inherit !important;
  }

  .panel {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
    padding: 16px 24px 16px;
    overflow: auto;
  }

  .section-node {
    flex: 1 0 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .section-node-content {
    flex: 1 0 auto;
    min-height: 300px;
    position: relative;
    display: flex;
  }

  .bottom-spacer {
    height: 0px;
  }

  .unknown-node {
    color: var(--primary-text);
  }

  .section-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 24px;
    background-color: rgba(0, 0, 0, 0.1);

    .node-id {
      font-size: 12px;
      color: var(--foreground-muted);
      font-family: var(--font-family-monospace);
      padding: 0 16px;
      line-height: 24px;
      cursor: pointer;
    }
  }

  .section-global-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: -16px -24px 18px;
    padding: 16px 24px 18px;
    background-color: var(--black-seethrough);
  }

  .node-type-row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    min-height: 30px;
  }

  .node-type-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
  }

  .node-type-label {
    color: var(--grey-light);
    font-size: 14px;
    line-height: 1;
  }

  .node-metadata-row {
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    align-items: start;
    gap: 14px;
    width: 100%;
    min-width: 0;
  }

  .node-metadata-fields {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    margin-left: -8px;
  }

  .node-title-field {
    margin-top: 0px;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    justify-self: stretch;
    overflow: hidden;
    font-weight: 900;
  }

  .node-description-field {
    margin-top: -4px;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    justify-self: stretch;
  }

  .node-title-field > div,
  .node-title-field form,
  .node-title-field form > div,
  .node-title-field .node-title-read-button {
    width: 100%;
    margin: 0;
    max-width: none;
    min-width: 0;
  }

  .node-title-field label,
  .node-description-field label {
    display: none;
  }

  .node-title-field .node-title-read-button {
    height: 40px;
    min-height: 0;
    padding: 0;
    line-height: 1;
    background: transparent;
    border: 0;
    display: flex;
    align-items: stretch;
    box-sizing: border-box;
    border-radius: 2px;
    overflow: hidden;
    text-align: left;
  }

  .node-title-field .node-title-read-button .title-read-content {
    width: 100%;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    font-size: 14px;
    line-height: 38px;
    box-sizing: border-box;
    font-family: var(--font-family-monospace);
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .node-title-field .title-read-content.is-empty {
    color: var(--foreground-muted);
  }

  .node-title-field input {
    width: 100%;
    height: 40px;
    min-height: 40px;
    padding: 0 12px;
    font-size: 14px;
    line-height: 38px;
    box-sizing: border-box;
    font-family: var(--font-family-monospace);
    background-color: var(--grey-darkerish);
    border: 1px solid var(--grey);
    border-radius: 2px;
    color: var(--grey-light);
  }

  .node-title-field input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .node-title-field .node-title-read-button:hover {
    background-color: rgba(255, 255, 255, 0.04);
  }

  .node-description-field,
  .node-description-field > form,
  .node-description-field form > div,
  .node-description-field [data-read-view-fit-container-width='true'] {
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  .node-description-field form > div {
    margin: 0;
  }

  .node-description-field [data-read-view-fit-container-width='true'] {
    display: block;
    min-height: 14px;
    border-radius: 2px;
    overflow: hidden;
  }

  .node-description-field [data-read-view-fit-container-width='true']:hover {
    background-color: rgba(255, 255, 255, 0.04);
  }

  .node-description-field .description-read-content {
    width: 100%;
    min-height: 14px;
    padding: 10px 12px;
    box-sizing: border-box;
    font-size: 14px;
    line-height: 1.4;
    color: var(--grey-light);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .node-description-field .description-read-content.is-empty {
    color: var(--foreground-muted);
  }

  .node-description-field textarea {
    width: 100%;
    min-height: 14px;
    padding: 10px 12px;
    box-sizing: border-box;
    font-size: 14px;
    line-height: 1.4;
    font-family: var(--font-family-monospace);
    background-color: var(--grey-darkerish);
    border: 1px solid var(--grey);
    border-radius: 2px;
    color: var(--grey-light);
  }

  .node-description-field textarea:focus {
    outline: none;
    border-color: var(--primary);
  }

  .toggle-field {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--grey-light);
    font-size: 14px;
    white-space: nowrap;
  }

  .toggle-field > label[data-size]:has(input:focus:not(:focus-visible)) {
    border-color: transparent !important;
    outline: none !important;
    box-shadow: none !important;
  }

  .toggle-field label {
    margin: 0;
    cursor: pointer;
  }

  .node-options-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    min-width: 0;
    min-height: 40px;
  }

  .split-controls {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    min-width: 0;
    min-height: 40px;
    justify-content: flex-start;
  }

  .split-toggle-row {
    display: flex;
    align-items: center;
    min-height: 40px;
  }

  .split-max {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: nowrap;
    min-height: 32px;
    margin-top: -4px;
    margin-left: 4px;

    .split-max-input {
      max-width: 80px;
    }
  }

  .split-mode {
    flex: 0 0 auto;
  }

  .segmented-choice {
    display: inline-flex;
    align-items: stretch;
    min-height: 21px;
    gap: 2px;
    background: transparent;
  }

  .segmented-choice-option {
    min-width: 0;
    height: 21px;
    padding: 0 10px;
    border: 0;
    border-radius: 0;
    background: var(--ds-background-neutral-bold, #505f79);
    color: var(--grey-darkest);
    font: inherit;
    font-size: 13px;
    line-height: 21px;
    cursor: pointer;
  }

  .segmented-choice-option:first-of-type {
    border-radius: 999px 0 0 999px;
    padding-left: 12px;
  }

  .segmented-choice-option:last-of-type {
    border-radius: 0 999px 999px 0;
    padding-right: 12px;
  }

  .segmented-choice-option:hover {
    background: var(--ds-background-neutral-bold-hovered, #738496);
  }

  .segmented-choice-option.is-active {
    background: var(--ds-background-success-bold, #4bce97);
    color: var(--grey-darkest);
  }

  .segmented-choice-option:focus-visible {
    outline: 2px solid var(--success-light);
    outline-offset: 1px;
  }

  .split-max-label {
    color: var(--grey-light);
    font-size: 14px;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .variants {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    min-width: 0;
    min-height: 40px;
    align-self: flex-end;
  }

  .variants-inline {
    min-height: 0;
  }

  .variant-select {
    min-width: 150px;
  }

  .variant-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .variant-editor-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    min-height: 40px;
  }

  .variant-name-input {
    width: 280px;
  }

  .node-color-picker {
    display: flex;
    align-items: center;
    width: 100%;
    margin-top: 11px;
    margin-left: 3px;
  }

  .node-color-picker .node-color-picker-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 56px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    box-sizing: border-box;
  }

  .node-color-picker .node-color-picker-swatch {
    width: 100%;
    height: 100%;
  }
`;

type NodeEditorProps = { selectedNode: ChartNode; onDeselect: () => void };

export type NodeChanged = (changed: ChartNode, newData?: Record<DataId, string>) => void;

export const NodeEditor: FC<NodeEditorProps> = ({ selectedNode, onDeselect }) => {
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();
  const [addVariantPopupOpen, setAddVariantPopupOpen] = useState(false);
  const { containerRef, isResizing, panelWidth, resizeHandleProps } = useNodeEditorWidth();

  const setStaticData = useSetStaticData();
  const editNode = useEditNodeCommand();

  const updateNode = useStableCallback((node: ChartNode, newData?: Record<DataId, string>) => {
    // Otherwise the editor "changes" and causes deleted nodes to reappear...
    if (isEqual(node, selectedNode)) {
      return;
    }

    editNode({ nodeId: node.id, newNode: node });

    if (newData) {
      setStaticData(newData);
    }
  });

  const isVariant = selectedVariant !== undefined;
  const { Editor } = useUnknownNodeComponentDescriptorFor(selectedNode);

  const nodeForEditor = {
    ...selectedNode,
    data: isVariant ? selectedNode.variants?.find(({ id }) => id === selectedVariant)?.data : selectedNode.data,
  };

  useHotkeys('esc', onDeselect, [onDeselect]);

  const nodeDescriptionChanged = useStableCallback((description: string) => {
    updateNode({ ...selectedNode, description });
  });

  const nodeTitleChanged = useStableCallback((title: string) => {
    updateNode({ ...selectedNode, title });
  });

  const nodeColorChanged = useStableCallback((color: { bg: string; border: string } | undefined) => {
    updateNode({ ...selectedNode, visualData: { ...selectedNode.visualData, color } });
  });

  const nodeDisabledChanged = useStableCallback((disabled: boolean) => {
    updateNode({ ...selectedNode, disabled });
  });

  const variantOptions = useMemo(() => {
    const appliedOption = { value: '', label: '(Current)' };

    return [
      appliedOption,
      ...orderBy(selectedNode.variants?.map(({ id }) => ({ value: id, label: id })) ?? [], 'label'),
    ];
  }, [selectedNode.variants]);

  const selectedVariantOption =
    selectedVariant === undefined ? variantOptions[0] : variantOptions.find(({ value }) => value === selectedVariant);

  function handleSaveAsVariant(id: string) {
    const node = { ...selectedNode, variants: [...(selectedNode.variants ?? []), { id, data: selectedNode.data }] };
    updateNode(node);
    setSelectedVariant(id);
  }

  function handleDeleteVariant() {
    const node = {
      ...selectedNode,
      variants: selectedNode.variants?.filter(({ id }) => id !== selectedVariant),
    };
    updateNode(node);
    setSelectedVariant(undefined);
  }

  function handleApplyVariant() {
    const node = {
      ...selectedNode,
      data: selectedNode.variants?.find(({ id }) => id === selectedVariant)?.data,
    };
    updateNode(node);
    setSelectedVariant(undefined);
  }

  const selectText = (event: MouseEvent<HTMLElement>) => {
    const range = document.createRange();
    range.selectNodeContents(event.target as HTMLElement);
    const selection = window.getSelection();
    selection!.removeAllRanges();
    selection!.addRange(range);
  };

  const showGlobalControls = selectedNode.type !== 'comment';
  const projectNodeRegistry = useProjectNodeRegistry();
  const nodeDisplayName = `${projectNodeRegistry.getDynamicDisplayName(selectedNode.type)} node`;
  const containerStyle = {
    '--node-editor-panel-width': `${panelWidth}px`,
  } as CSSProperties;

  return (
    <NodeEditorResizeContext.Provider value={isResizing}>
      <Container ref={containerRef} style={containerStyle} data-is-resizing={isResizing}>
        <ResizeHandle className="node-editor-width-resize-handle" {...resizeHandleProps} />
        <div className="panel-container">
          <div className="panel">
            {showGlobalControls && (
              <NodeEditorGlobalControls
                node={selectedNode}
                selectedVariant={selectedVariant}
                setSelectedVariant={setSelectedVariant}
                addVariantPopupOpen={addVariantPopupOpen}
                setAddVariantPopupOpen={setAddVariantPopupOpen}
                variantOptions={variantOptions}
                selectedVariantOption={selectedVariantOption}
                onTitleChange={nodeTitleChanged}
                onDescriptionChange={nodeDescriptionChanged}
                onColorChange={nodeColorChanged}
                onDisabledChange={nodeDisabledChanged}
                onUpdateNode={updateNode}
                onApplyVariant={handleApplyVariant}
                onDeleteVariant={handleDeleteVariant}
                onSaveAsVariant={handleSaveAsVariant}
              />
            )}

            <div className="section section-node">
              <div className="section-node-content">
                {Editor ? (
                  <Editor node={nodeForEditor} onChange={isVariant ? () => {} : updateNode} />
                ) : (
                  <DefaultNodeEditor
                    node={nodeForEditor}
                    isReadonly={isVariant}
                    onChange={isVariant ? () => {} : updateNode}
                    onClose={onDeselect}
                  />
                )}
              </div>
              <div className="bottom-spacer" />
            </div>
          </div>
          <div className="section section-footer">
            <span className="node-id" onClick={selectText}>
              {`${nodeDisplayName}, ${selectedNode.id}`}
            </span>
          </div>
        </div>
      </Container>
    </NodeEditorResizeContext.Provider>
  );
};
