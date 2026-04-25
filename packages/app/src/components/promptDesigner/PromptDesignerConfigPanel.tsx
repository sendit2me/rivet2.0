import { type FC } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import Button from '@atlaskit/button';
import Select from '@atlaskit/select';
import { openai } from '@ironclad/rivet-core';
import type { PromptDesignerConfigurationState } from '../../state/promptDesigner';
import type { SetStateAction } from 'jotai';
import { LabeledToggle } from '../LabeledToggle.js';

export type PromptDesignerConfigPanelProps = {
  config: PromptDesignerConfigurationState;
  setConfig: (update: SetStateAction<PromptDesignerConfigurationState>) => void;
  onRun: () => void;
};

export const PromptDesignerConfigPanel: FC<PromptDesignerConfigPanelProps> = ({ config, setConfig, onRun }) => {
  return (
    <div className="panel">
      <div className="chat-config-area">
        <div className="chat-config-controls">
          <Field name="model" label="Model">
            {({ fieldProps }) => (
              <Select
                {...fieldProps}
                options={openai.openAiModelOptions}
                value={openai.openAiModelOptions.find((o) => o.value === config.data.model)!}
                placeholder="Select a model"
                onChange={(value) => setConfig((s) => ({ ...s, data: { ...s.data, model: value!.value } }))}
              />
            )}
          </Field>
          <Field name="temperature" label="Temperature">
            {({ fieldProps }) => (
              <TextField
                {...fieldProps}
                placeholder="Enter temperature"
                type="number"
                value={config.data.temperature}
                min={0}
                max={1}
                step={0.1}
                onChange={(e) =>
                  setConfig((s) => ({
                    ...s,
                    data: { ...s.data, temperature: (e.target as HTMLInputElement).valueAsNumber },
                  }))
                }
              />
            )}
          </Field>
          <Field name="useTopP">
            {() => (
              <LabeledToggle
                id="useTopP"
                isChecked={config.data.useTopP}
                onChange={(value) =>
                  setConfig((s) => ({
                    ...s,
                    data: { ...s.data, useTopP: value },
                  }))
                }
                label="Use Top P"
              />
            )}
          </Field>
          <Field name="topP" label="Top P">
            {({ fieldProps }) => (
              <TextField
                {...fieldProps}
                placeholder="Enter top p"
                type="number"
                value={config.data.top_p ?? 0}
                min={0}
                max={1}
                step={0.1}
                onChange={(e) =>
                  setConfig((s) => ({
                    ...s,
                    data: { ...s.data, topP: (e.target as HTMLInputElement).valueAsNumber },
                  }))
                }
              />
            )}
          </Field>
          <Field name="max-tokens" label="Max Tokens">
            {({ fieldProps }) => (
              <TextField
                {...fieldProps}
                placeholder="Enter max tokens"
                type="number"
                min={1}
                max={100}
                value={config.data.maxTokens}
                onChange={(e) =>
                  setConfig((s) => ({
                    ...s,
                    data: { ...s.data, maxTokens: (e.target as HTMLInputElement).valueAsNumber },
                  }))
                }
              />
            )}
          </Field>
          <Field name="frequencyPenalty" label="Frequency Penalty">
            {({ fieldProps }) => (
              <TextField
                {...fieldProps}
                placeholder="Enter frequency penalty"
                type="number"
                min={0}
                max={100}
                value={config.data.frequencyPenalty ?? 0}
                onChange={(e) =>
                  setConfig((s) => ({
                    ...s,
                    data: { ...s.data, frequencyPenalty: (e.target as HTMLInputElement).valueAsNumber },
                  }))
                }
              />
            )}
          </Field>
          <Field name="presencePenalty" label="Presence Penalty">
            {({ fieldProps }) => (
              <TextField
                {...fieldProps}
                placeholder="Enter presence penalty"
                type="number"
                min={0}
                max={100}
                value={config.data.presencePenalty ?? 0}
                onChange={(e) =>
                  setConfig((s) => ({
                    ...s,
                    data: { ...s.data, presencePenalty: (e.target as HTMLInputElement).valueAsNumber },
                  }))
                }
              />
            )}
          </Field>
        </div>
        <div className="controls-buttons">
          <Button appearance="primary" onClick={onRun}>
            Run
          </Button>
        </div>
      </div>
    </div>
  );
};
