import { useState, type FC, ReactNode } from 'react';
import { type SharedEditorProps } from '../SharedEditorProps';
import {
  getError,
  type ChartNode,
  type CustomEditorDefinition,
  coreCreateProcessor,
  deserializeProject,
  ExecutionRecorder,
  registerBuiltInNodes,
  NodeRegistration,
  plugins as corePlugins,
} from '@ironclad/rivet-core';
import { Field } from '@atlaskit/form';
import Button from '@atlaskit/button';
import { css } from '@emotion/react';
import Select from '@atlaskit/select';
import { toast } from 'react-toastify';
import codeGeneratorProject from '../../../../graphs/code-node-generator.rivet-project?raw';
import { useAtom, useAtomValue } from 'jotai';
import { settingsState } from '../../../state/settings';
import { fillMissingSettingsFromEnvironmentVariables } from '../../../utils/tauri';
import { useDependsOnPlugins } from '../../../hooks/useDependsOnPlugins';
import { marked } from 'marked';
import { modelSelectorOptions } from '../../../utils/modelSelectorOptions';
import TextArea from '@atlaskit/textarea';
import { selectedAssistModelState } from '../../../state/ai';
import { nativeCreateDir, nativeWriteFile } from '../../../utils/platform/fs.js';
import { handleError } from '../../../utils/errorHandling.js';
import { useMultilineEditorFontSize } from '../../../hooks/useMultilineEditorFontSize.js';
import Collapsible from 'react-collapsible';
import ChevronDownIcon from 'majesticons/line/chevron-down-line.svg?react';
import ChevronUpIcon from 'majesticons/line/chevron-up-line.svg?react';

const styles = css`
  grid-column: span 2;

  .ai-assist-toggle-container {
    display: flex;
    flex-direction: column;
  }

  .ai-assist-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    margin: 0 -16px;
    border: none;
    background: none;
    cursor: pointer;
    outline: none;
    border-radius: 4px;
    transition: background 0.2s ease-out;
    font-size: 14px;
    font-family: inherit;
    color: var(--label-color);
    font-weight: var(--label-font-weight);

    .indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    }

    &:hover {
      background: var(--grey-darkish);
    }
  }

  .ai-assist-body {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ai-assist-panel {
    border-bottom: 1px solid var(--grey-darkish);
    margin-top: 2px;
    padding: 8px 0 16px;
  }

  .model-and-button {
    width: 350px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
`;

export interface AiAssistEditorBaseProps<TNodeData, TOutputs> {
  node: ChartNode;
  data: TNodeData;
  isReadonly: boolean;
  isDisabled: boolean;
  editor: CustomEditorDefinition<ChartNode>;
  onChange: (node: ChartNode) => void;
  graphName: string;
  updateData: (data: TNodeData, result: TOutputs) => TNodeData | null;
  placeholder: string;
  label?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  onError?: (error: any) => void;
  onSuccess?: (updatedNode: ChartNode) => void;
  getErrorMessage?: (outputs: TOutputs) => string;
  getIsError?: (outputs: TOutputs) => boolean;
}

export const AiAssistEditorBase = <TNodeData, TOutputs>({
  node,
  data,
  isReadonly,
  isDisabled,
  onChange,
  graphName,
  updateData,
  placeholder,
  label = 'Generate Using AI',
  collapsible = false,
  defaultOpen = true,
  onError,
  onSuccess,
  getErrorMessage,
  getIsError,
}: AiAssistEditorBaseProps<TNodeData, TOutputs>) => {
  const [prompt, setPrompt] = useState('');
  const [working, setWorking] = useState(false);

  const settings = useAtomValue(settingsState);
  const plugins = useDependsOnPlugins();

  const record = true;

  const [modelAndApi, setModelAndApi] = useAtom(selectedAssistModelState);
  const { fontSize, handleKeyDown: handleMultilineEditorFontSizeKeyDown } = useMultilineEditorFontSize();

  const generate = async () => {
    try {
      const [project] = deserializeProject(codeGeneratorProject);
      const [api, model] = modelAndApi.split(':');

      const recorder = new ExecutionRecorder();

      const registry = registerBuiltInNodes(new NodeRegistration());
      registry.registerPlugin(corePlugins.anthropic);

      const processor = coreCreateProcessor(project, {
        graph: graphName,
        inputs: {
          prompt,
          model: model!,
          api: api!,
        },
        registry,
        ...(await fillMissingSettingsFromEnvironmentVariables(settings, plugins)),
      });

      if (record) {
        recorder.record(processor.processor);
      }

      setWorking(true);

      const outputs = (await processor.run()) as TOutputs;

      if (record) {
        const fileName = `recordings/${graphName.replace(/ /g, '-')}-${Date.now()}.rivet-recording`;

        await nativeCreateDir('recordings', {
          dir: 'AppLog',
          recursive: true,
        });

        await nativeWriteFile(fileName, recorder.serialize(), {
          dir: 'AppLog',
        });
      }

      const isErrorResponse = getIsError ? getIsError(outputs) : false;

      if (!isErrorResponse) {
        const updatedData = updateData(data, outputs);

        if (updatedData) {
          const updatedNode = {
            ...node,
            data: updatedData,
          };

          onChange(updatedNode);

          // Call success callback if provided
          if (onSuccess) {
            onSuccess(updatedNode);
          }
        }
      } else {
        // Handle error response
        const responseText = getErrorMessage ? getErrorMessage(outputs) : 'An error occurred';

        const markdownResponse = marked(responseText);
        toast.info(<div dangerouslySetInnerHTML={{ __html: markdownResponse }}></div>, {
          autoClose: false,
          containerId: 'wide',
          toastId: 'ai-assist-response',
        });
      }
    } catch (err) {
      const error = getError(err);
      handleError(error, 'Failed to generate AI assist content', {
        metadata: {
          graphName,
          modelAndApi,
          nodeId: node.id,
          promptLength: prompt.length,
        },
      });

      // Call error callback if provided
      if (onError) {
        onError(error);
      }
    } finally {
      setWorking(false);
    }
  };

  const selectedModel = modelSelectorOptions.find((option) => option.value === modelAndApi);

  const editorBody = (
    <div className={collapsible ? 'ai-assist-panel' : undefined}>
      <div className="ai-assist-body">
        <TextArea
          isDisabled={isDisabled || working}
          isReadOnly={isReadonly}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={placeholder}
          className="text-area"
          onKeyDown={(e) => {
            if (handleMultilineEditorFontSizeKeyDown(e.nativeEvent)) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              generate();
            }
          }}
          minimumRows={3}
          style={{ fontSize }}
        />
        <div className="model-and-button">
          <Select
            options={modelSelectorOptions}
            value={selectedModel}
            onChange={(option) => setModelAndApi(option!.value)}
            isDisabled={isDisabled || working}
            className="model-selector"
          />
          <Button appearance="primary" onClick={() => void generate()} isDisabled={isDisabled || working}>
            Generate
          </Button>
        </div>
      </div>
    </div>
  );

  if (!collapsible) {
    return (
      <Field name="aiAssist" label={label}>
        {() => <div css={styles}>{editorBody}</div>}
      </Field>
    );
  }

  const toggle = (isOpen?: boolean) => (
    <div className="ai-assist-toggle-container">
      <button type="button" className="ai-assist-toggle">
        <span className="label">{label}</span>
        <span className="indicator">{isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}</span>
      </button>
    </div>
  );

  return (
    <div css={styles}>
      <Collapsible
        open={defaultOpen}
        trigger={toggle(false)}
        triggerClassName="ai-assist-toggle-container"
        triggerOpenedClassName="ai-assist-toggle-container open"
        triggerWhenOpen={toggle(true)}
        transitionTime={150}
        easing="ease-out"
      >
        {editorBody}
      </Collapsible>
    </div>
  );
};
