import { type FC } from 'react';
import { type ChartNode } from '@ironclad/rivet-core';
import { Field } from '@atlaskit/form';
import { InlineEditableTextfield } from '@atlaskit/inline-edit';
import Toggle from '@atlaskit/toggle';
import TextField from '@atlaskit/textfield';
import Select from '@atlaskit/select';
import Button from '@atlaskit/button';
import Popup from '@atlaskit/popup';
import { Tooltip } from '../Tooltip.js';
import { NodeColorPicker } from '../NodeColorPicker.js';

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

  return (
    <div className="section section-global-controls">
      <div className="node-color-picker">
        <Toggle isChecked={!node.disabled} onChange={(event) => onDisabledChange(!event.target.checked)} />
        <NodeColorPicker currentColor={node.visualData.color} onChange={onColorChange} />
      </div>
      <InlineEditableTextfield
        key={`node-title-${node.id}`}
        label="Node Title"
        placeholder="Enter a name for the node..."
        defaultValue={node.title}
        onConfirm={onTitleChange}
        readViewFitContainerWidth
      />
      <InlineEditableTextfield
        key={`node-description-${node.id}`}
        label="Node Description"
        defaultValue={node.description ?? ''}
        onConfirm={onDescriptionChange}
        placeholder="Optional description..."
        readViewFitContainerWidth
      ></InlineEditableTextfield>
      <div />
      <Field name="isSplitRun" label="Split">
        {({ fieldProps }) => (
          <section className="split-controls">
            <div className="split-controls-toggle">
              <Toggle
                {...fieldProps}
                isChecked={node.isSplitRun}
                onChange={(isSplitRun) => onUpdateNode({ ...node, isSplitRun: isSplitRun.target.checked })}
              />
            </div>

            {node.isSplitRun && (
              <div className="split-max">
                <label>
                  Sequential
                  <Toggle
                    label="asda"
                    isChecked={node.isSplitSequential ?? false}
                    onChange={(isSequential) =>
                      onUpdateNode({
                        ...node,
                        isSplitSequential: isSequential.target.checked,
                      })
                    }
                  />
                </label>
                <label>Max:</label>
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
        )}
      </Field>
      <Field name="variants" label="Variant">
        {({ fieldProps }) => (
          <section className="variants">
            {variantOptions.length > 1 && (
              <Select
                className="variant-select"
                {...fieldProps}
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
              <Popup
                isOpen={addVariantPopupOpen}
                trigger={(triggerProps) => (
                  <Button
                    {...triggerProps}
                    appearance="subtle-link"
                    onClick={() => setAddVariantPopupOpen(!addVariantPopupOpen)}
                  >
                    Save As Variant
                  </Button>
                )}
                content={() => (
                  <div>
                    <Field name="variantName" label="Variant Name">
                      {({ fieldProps }) => (
                        <TextField
                          {...fieldProps}
                          placeholder="Enter a name for the variant..."
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              onSaveAsVariant((event.target as HTMLInputElement).value);
                              setAddVariantPopupOpen(false);
                            }
                          }}
                        />
                      )}
                    </Field>
                  </div>
                )}
              />
            )}
          </section>
        )}
      </Field>
      <div />
      <Field name="conditional" label="Conditional Node">
        {({ fieldProps }) => (
          <section className="split-controls">
            <div className="split-controls-toggle">
              <Tooltip content="Exposes a conditional input port to the node, allowing to be executed only if the condition is met.">
                <Toggle
                  {...fieldProps}
                  isChecked={node.isConditional}
                  onChange={(conditional) => onUpdateNode({ ...node, isConditional: conditional.target.checked })}
                />
              </Tooltip>
            </div>
          </section>
        )}
      </Field>
    </div>
  );
};
