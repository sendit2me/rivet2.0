import { type FC, type ReactNode, useRef, useState } from 'react';
import { type ChartNode } from '@ironclad/rivet-core';
import InlineEdit from '@atlaskit/inline-edit';
import Toggle from '@atlaskit/toggle';
import TextField from '@atlaskit/textfield';
import Textarea from '@atlaskit/textarea';
import Select from '@atlaskit/select';
import Button from '@atlaskit/button';
import { Tooltip } from '../Tooltip.js';
import { NodeColorPicker } from '../NodeColorPicker.js';
import {
  type SplitModeChoice,
  isSplitSequentialFromSplitMode,
  splitModeFromIsSplitSequential,
} from './splitMode.js';

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

type SegmentedChoiceOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedChoiceProps<T extends string> = {
  value: T;
  options: readonly SegmentedChoiceOption<T>[];
  ariaLabel: string;
  onChange: (value: T) => void;
  className?: string;
};

const SegmentedChoice = <T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
  className,
}: SegmentedChoiceProps<T>) => (
  <div className={className ? `segmented-choice ${className}` : 'segmented-choice'} role="group" aria-label={ariaLabel}>
    {options.map((option) => (
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

const splitModeOptions: readonly SegmentedChoiceOption<SplitModeChoice>[] = [
  { value: 'parallel', label: 'parallel runs' },
  { value: 'sequential', label: 'sequential' },
];

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
  const nodeDescriptionBeforeEditRef = useRef(node.description ?? '');
  const isVariant = selectedVariant !== undefined;
  const hasSavedVariants = variantOptions.length > 1;
  const showVariantEditor = hasSavedVariants || addVariantPopupOpen;
  const showVariantsLink = !hasSavedVariants;
  const nodeEnabledToggleId = `node-enabled-${node.id}`;
  const conditionalToggleId = `node-conditional-${node.id}`;
  const splitToggleId = `node-split-${node.id}`;
  const splitMode = splitModeFromIsSplitSequential(node.isSplitSequential);

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
      <div className="node-options-row">
        <section className="split-controls">
          <div className="split-toggle-row">
            <HeaderToggleField
              id={splitToggleId}
              isChecked={node.isSplitRun ?? false}
              onChange={(isSplitRun) => onUpdateNode({ ...node, isSplitRun })}
            >
              <span>Split runs</span>
            </HeaderToggleField>
          </div>

          {node.isSplitRun && (
            <div className="split-max">
              <SegmentedChoice
                className="split-mode"
                ariaLabel="Split mode"
                value={splitMode}
                options={splitModeOptions}
                onChange={(nextSplitMode) =>
                  onUpdateNode({
                    ...node,
                    isSplitSequential: isSplitSequentialFromSplitMode(nextSplitMode),
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
