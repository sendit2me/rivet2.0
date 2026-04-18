import { type FC, type ReactNode, useRef } from 'react';
import { type ChartNode } from '@ironclad/rivet-core';
import InlineEdit from '@atlaskit/inline-edit';
import Toggle from '@atlaskit/toggle';
import TextField from '@atlaskit/textfield';
import Textarea from '@atlaskit/textarea';
import Select from '@atlaskit/select';
import Button from '@atlaskit/button';
import { Tooltip } from '../Tooltip.js';
import { NodeColorPicker } from '../NodeColorPicker.js';

type HeaderToggleFieldProps = {
  id: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
  children: ReactNode;
  className?: string;
};

const HeaderToggleField: FC<HeaderToggleFieldProps> = ({ id, isChecked, onChange, children, className }) => (
  <div className={className ? `toggle-field ${className}` : 'toggle-field'}>
    <Toggle id={id} isChecked={isChecked} onChange={(event) => onChange(event.target.checked)} />
    <label htmlFor={id}>{children}</label>
  </div>
);

export const NodeEditorGlobalControls: FC<{
  node: ChartNode;
  selectedVariant: string | undefined;
  setSelectedVariant: (value: string | undefined) => void;
  addVariantPopupOpen: boolean;
  setAddVariantPopupOpen: (value: boolean) => void;
  variantOptions: { value: string; label: string }[];
  selectedVariantOption: { value: string; label: string } | undefined;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onColorChange: (color: { bg: string; border: string } | undefined) => void;
  onDisabledChange: (disabled: boolean) => void;
  onUpdateNode: (node: ChartNode) => void;
  onApplyVariant: () => void;
  onDeleteVariant: () => void;
  onSaveAsVariant: (id: string) => void;
}> = ({
  node,
  selectedVariant,
  setSelectedVariant,
  addVariantPopupOpen,
  setAddVariantPopupOpen,
  variantOptions,
  selectedVariantOption,
  onTitleChange,
  onDescriptionChange,
  onColorChange,
  onDisabledChange,
  onUpdateNode,
  onApplyVariant,
  onDeleteVariant,
  onSaveAsVariant,
}) => {
  const nodeTitleBeforeEditRef = useRef(node.title ?? '');
  const isVariant = selectedVariant !== undefined;
  const hasSavedVariants = variantOptions.length > 1;
  const showVariantEditor = hasSavedVariants || addVariantPopupOpen;
  const showVariantsLink = !hasSavedVariants;
  const nodeEnabledToggleId = `node-enabled-${node.id}`;
  const conditionalToggleId = `node-conditional-${node.id}`;
  const splitToggleId = `node-split-${node.id}`;
  const splitSequentialToggleId = `node-split-sequential-${node.id}`;

  return (
    <div className="section section-global-controls">
      <div className="node-type-row">
        <HeaderToggleField
          id={nodeEnabledToggleId}
          isChecked={!node.disabled}
          onChange={(isEnabled) => onDisabledChange(!isEnabled)}
          className="node-type-chip"
        >
          <span className="node-type-label">Active</span>
        </HeaderToggleField>
        <Tooltip content="Exposes a conditional input port to the node, allowing to be executed only if the condition is met.">
          <HeaderToggleField
            id={conditionalToggleId}
            isChecked={node.isConditional ?? false}
            onChange={(isConditional) => onUpdateNode({ ...node, isConditional })}
          >
            <span>Conditional node</span>
          </HeaderToggleField>
        </Tooltip>
      </div>
      <div className="node-metadata-row">
        <div className="node-color-picker">
          <NodeColorPicker currentColor={node.visualData.color} onChange={onColorChange} />
        </div>
        <div className="node-metadata-fields">
          <div className="node-title-field">
            <InlineEdit
              key={`node-title-${node.id}`}
              label="Node title"
              defaultValue={node.title ?? ''}
              onEdit={() => {
                nodeTitleBeforeEditRef.current = node.title ?? '';
              }}
              onCancel={() => {
                if ((node.title ?? '') !== nodeTitleBeforeEditRef.current) {
                  onTitleChange(nodeTitleBeforeEditRef.current);
                }
              }}
              onConfirm={(title) => {
                if ((node.title ?? '') !== title) {
                  onTitleChange(title);
                }
              }}
              hideActionButtons
              readViewFitContainerWidth
              readView={() => (
                <div className={node.title ? 'title-read-content' : 'title-read-content is-empty'}>
                  {node.title || 'Some title'}
                </div>
              )}
              editView={(fieldProps, ref) => (
                <TextField
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
                    const nextTitle = event.currentTarget.value;
                    fieldProps.onChange(nextTitle);
                    onTitleChange(nextTitle);
                  }}
                  placeholder="Some title"
                />
              )}
            />
          </div>
          <div className="node-description-field">
            <InlineEdit
              key={`node-description-${node.id}`}
              label="Node description"
              defaultValue={node.description ?? ''}
              onConfirm={onDescriptionChange}
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
                  onChange={(event) => fieldProps.onChange(event.currentTarget.value)}
                  placeholder="Description..."
                  minimumRows={3}
                  resize="smart"
                />
              )}
            />
          </div>
        </div>
      </div>
      <div className="node-options-row">
        <section className="split-controls">
          <div className="split-toggle-row">
            <HeaderToggleField
              id={splitToggleId}
              isChecked={node.isSplitRun ?? false}
              onChange={(isSplitRun) => onUpdateNode({ ...node, isSplitRun })}
            >
              <span>Split</span>
            </HeaderToggleField>
          </div>

          {node.isSplitRun && (
            <div className="split-max">
              <HeaderToggleField
                id={splitSequentialToggleId}
                isChecked={node.isSplitSequential ?? false}
                onChange={(isSplitSequential) =>
                  onUpdateNode({
                    ...node,
                    isSplitSequential,
                  })
                }
              >
                <span>Sequential</span>
              </HeaderToggleField>
              <label className="split-max-label">Max iterations:</label>
              <TextField
                className="split-max-input"
                type="number"
                min={1}
                step={1}
                placeholder="Max"
                value={node.splitRunMax ?? 10}
                onChange={(event) => {
                  const rawValue = (event.target as HTMLInputElement).valueAsNumber;
                  const splitRunMax = Math.max(1, Math.trunc(Number.isFinite(rawValue) ? rawValue : 1));

                  onUpdateNode({
                    ...node,
                    splitRunMax,
                  });
                }}
              />
            </div>
          )}
        </section>
        <section className="variants">
          {showVariantsLink && !showVariantEditor && (
            <Button appearance="subtle-link" onClick={() => setAddVariantPopupOpen(!addVariantPopupOpen)}>
              Variants...
            </Button>
          )}
        </section>
      </div>
      {showVariantEditor && (
        <div className="variant-editor-row">
          {hasSavedVariants && (
            <Select
              className="variant-select"
              options={variantOptions}
              value={selectedVariantOption}
              onChange={(val) => setSelectedVariant(val!.value === '' ? undefined : val!.value)}
            />
          )}
          {isVariant ? (
            <div className="variant-buttons">
              <Button appearance="primary" onClick={onApplyVariant}>
                Apply
              </Button>
              <Button appearance="danger" onClick={onDeleteVariant}>
                Delete Variant
              </Button>
            </div>
          ) : (
            <TextField
              className="variant-name-input"
              placeholder="Enter a name for the variant..."
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSaveAsVariant((event.target as HTMLInputElement).value);
                  setAddVariantPopupOpen(false);
                }
              }}
            />
          )}
          {showVariantsLink && (
            <section className="variants variants-inline">
              <Button appearance="subtle-link" onClick={() => setAddVariantPopupOpen(!addVariantPopupOpen)}>
                Variants...
              </Button>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
