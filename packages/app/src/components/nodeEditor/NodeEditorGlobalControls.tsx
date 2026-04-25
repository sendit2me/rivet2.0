import { type FC, type ReactNode } from 'react';
import { type ChartNode } from '@ironclad/rivet-core';
import Toggle from '@atlaskit/toggle';
import TextField from '@atlaskit/textfield';
import Select from '@atlaskit/select';
import Button from '@atlaskit/button';
import { Tooltip } from '../Tooltip.js';
import { NodeMetadataEditor } from './NodeMetadataEditor.js';

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

type SplitModeChoice = 'parallel' | 'sequential';

const splitModeOptions: readonly { value: SplitModeChoice; label: string }[] = [
  { value: 'parallel', label: 'parallel runs' },
  { value: 'sequential', label: 'sequential' },
];

const SplitModeChoiceControl: FC<{
  value: SplitModeChoice;
  onChange: (value: SplitModeChoice) => void;
}> = ({ value, onChange }) => (
  <div className="segmented-choice split-mode" role="group" aria-label="Split mode">
    {splitModeOptions.map((option) => (
      <button
        key={option.value}
        type="button"
        className={`segmented-choice-option${option.value === value ? ' is-active' : ''}`}
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
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
  const isVariant = selectedVariant !== undefined;
  const hasSavedVariants = variantOptions.length > 1;
  const showVariantEditor = hasSavedVariants || addVariantPopupOpen;
  const showVariantsLink = !hasSavedVariants;
  const nodeEnabledToggleId = `node-enabled-${node.id}`;
  const conditionalToggleId = `node-conditional-${node.id}`;
  const splitToggleId = `node-split-${node.id}`;
  const splitMode: SplitModeChoice = node.isSplitSequential ? 'sequential' : 'parallel';

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
      <NodeMetadataEditor
        node={node}
        onTitleChange={onTitleChange}
        onDescriptionChange={onDescriptionChange}
        onColorChange={onColorChange}
      />
      <div className="node-options-row">
        <section className="split-controls">
          <div className="split-toggle-row">
            <HeaderToggleField
              id={splitToggleId}
              isChecked={node.isSplitRun ?? false}
              onChange={(isSplitRun) => onUpdateNode({ ...node, isSplitRun })}
            >
              <span className="split-toggle-copy">
                <span className="split-toggle-label">Run per item</span>
                <span className="split-toggle-description">Run the node for each item in the array input</span>
              </span>
            </HeaderToggleField>
          </div>

          {node.isSplitRun && (
            <div className="split-max">
              <SplitModeChoiceControl
                value={splitMode}
                onChange={(nextSplitMode) =>
                  onUpdateNode({
                    ...node,
                    isSplitSequential: nextSplitMode === 'sequential',
                  })
                }
              />
              <label className="split-max-label">Max runs:</label>
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
