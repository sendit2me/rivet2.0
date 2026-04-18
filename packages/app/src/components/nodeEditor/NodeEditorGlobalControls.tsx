import { type FC, type ReactNode } from 'react';
import { type ChartNode } from '@ironclad/rivet-core';
import { InlineEditableTextfield } from '@atlaskit/inline-edit';
import Toggle from '@atlaskit/toggle';
import TextField from '@atlaskit/textfield';
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
  displayName: string;
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
  displayName,
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
  const isVariant = selectedVariant !== undefined;
  const hasSavedVariants = variantOptions.length > 1;
  const showVariantEditor = hasSavedVariants || addVariantPopupOpen;
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
          <span className="node-type-label">{displayName}</span>
        </HeaderToggleField>
      </div>
      <div className="node-metadata-row">
        <div className="node-color-picker">
          <NodeColorPicker currentColor={node.visualData.color} onChange={onColorChange} />
        </div>
        <div className="node-title-field">
          <InlineEditableTextfield
            key={`node-title-${node.id}`}
            label="Node title"
            placeholder="Some title"
            defaultValue={node.title}
            onConfirm={onTitleChange}
            hideActionButtons
            readViewFitContainerWidth
          />
        </div>
        <div className="node-description-field">
          <InlineEditableTextfield
            key={`node-description-${node.id}`}
            label="Node description"
            defaultValue={node.description ?? ''}
            onConfirm={onDescriptionChange}
            placeholder="Description..."
            hideActionButtons
            readViewFitContainerWidth
          />
        </div>
      </div>
      <div className="node-conditional-row">
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
      <div className="node-options-row">
        <section className="split-controls">
          <HeaderToggleField
            id={splitToggleId}
            isChecked={node.isSplitRun ?? false}
            onChange={(isSplitRun) => onUpdateNode({ ...node, isSplitRun })}
          >
            <span>Split</span>
          </HeaderToggleField>

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
                placeholder="Max"
                value={node.splitRunMax ?? 10}
                onChange={(event) =>
                  onUpdateNode({
                    ...node,
                    splitRunMax: (event.target as HTMLInputElement).valueAsNumber,
                  })
                }
              />
            </div>
          )}
        </section>
        <section className="variants">
          {!hasSavedVariants && (
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
        </div>
      )}
    </div>
  );
};
