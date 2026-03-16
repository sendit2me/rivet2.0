import { css } from '@emotion/react';
import { type FC, useEffect, useState, useRef } from 'react';
import { atom, useAtom, useAtomValue } from 'jotai';
import { AppErrorBoundary } from './AppErrorBoundary';
import {
  promptDesignerAttachedChatNodeState,
  promptDesignerConfigurationState,
  promptDesignerResponseState,
  promptDesignerState,
  promptDesignerTestGroupResultsByNodeIdState,
} from '../state/promptDesigner';
import { nodesByIdState, nodesState } from '../state/graph.js';
import { type InputsOrOutputsWithRefs, lastRunDataByNodeState } from '../state/dataFlow.js';
import {
  type ChatNode,
  type DataValue,
  type GraphId,
  type NodeId,
  type NodeTestGroup,
  arrayizeDataValue,
  getError,
  isArrayDataValue,
  type ScalarDataValue,
  type Inputs,
} from '@ironclad/rivet-core';
import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
import Button from '@atlaskit/button';
import { nanoid } from 'nanoid/non-secure';
import { mapValues } from 'lodash-es';
import { overlayOpenState } from '../state/ui';
import { getChatNodeMessages } from '../../../core/src/model/nodes/ChatNodeBase';
import { syncWrapper } from '../utils/syncWrapper';
import { useDatasetProvider } from '../providers/ProvidersContext';
import { useGetAdHocInternalProcessContext } from '../hooks/useGetAdHocInternalProcessContext';
import { usePromptDesignerMessages } from '../hooks/usePromptDesignerMessages';
import {
  PromptDesignerMessage,
  PromptDesignerTestGroupResultList,
} from './promptDesigner/PromptDesignerComponents';
import { runAdHocChat, useRunPromptDesignerTestGroupSampleCount } from './promptDesigner/PromptDesignerTestRunner';
import { PromptDesignerConfigPanel } from './promptDesigner/PromptDesignerConfigPanel';
import { PromptDesignerTestPanel } from './promptDesigner/PromptDesignerTestPanel';

const styles = css`
  position: fixed;
  top: var(--project-selector-height);
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--grey-darker);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
  z-index: 150;

  .close-prompt-designer {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 10;
    cursor: pointer;
  }

  .prompt-designer-content {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr;
    height: 100%;
  }

  .message-area {
    border-right: 1px solid var(--grey);
    padding: 20px;
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding-top: 32px;
  }

  .message-list {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .message {
    border-bottom: 1px solid var(--grey);
    padding: 10px 5px;
    cursor: pointer;
    font-size: 14px;
    line-height: 22px;
    font-family: 'Roboto', sans-serif;
    display: flex;
    flex-direction: column;
    position: relative;
    gap: 8px;

    .message-author-type {
      width: 100px;
    }

    .message-text {
      width: 100%;
    }

    .message-delete-button-container {
      width: 40px;
      position: absolute;
      top: 10px;
      right: 5px;
    }

    .message-text pre {
      font-family: 'Roboto', sans-serif;
      user-select: none;
    }
  }

  .response-area {
    border-right: 1px solid var(--grey);
    padding: 20px;
    height: 100%;
    overflow: auto;
    padding-top: 32px;
  }

  .controls-area {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .panel {
    width: 100%;
    height: 100%;
  }

  .controls-buttons {
    padding: 20px;
    display: flex;
    justify-content: flex-end;
  }

  .message-editor {
    width: 100%;
    font-size: 14px;
    font-family: 'Roboto', sans-serif;
    line-height: 22px;
    resize: none;
    overflow: hidden;
    border: solid 1px transparent;
    background: transparent;
    outline: none;
    padding: 10px;
    &:focus {
      border: solid 1px var(--grey-lightest);
    }

    &:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }
  }

  .chat-config-area {
    display: grid;
    height: 100%;
    grid-template-rows: 1fr auto;
  }

  .chat-config-controls {
    padding: 20px;
    border-bottom: 1px solid var(--grey);
  }

  .test-config-area {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
  }

  .test-config {
    padding: 20px;
    border-bottom: 1px solid var(--grey);
  }

  .test-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-bottom: 1px solid var(--grey);
  }

  .test-group {
    border-bottom: 1px solid var(--grey);
    padding: 10px;
    position: relative;
  }

  .test-group-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .delete-test-group-button {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 10;
  }

  .test-group-tests {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  }

  .test-group-test-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .test-group-result {
    border: 1px solid var(--grey);
    border-radius: 10px;
    padding: 10px;
    position: relative;
  }

  .test-group-result-response {
    max-height: 300px;
    overflow: auto;
    border-bottom: 1px solid var(--grey);
  }

  .test-group-result-conditions {
    padding: 10px;

    .test-group-result-condition-result {
      display: flex;
      gap: 8px;
      align-items: center;

      .pass {
        color: var(--success);
      }

      .fail {
        color: var(--error);
      }
    }
  }

  .test-group-results {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .test-group-result-expand {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 10;
  }

  .add-message {
    justify-self: stretch;
    display: flex;
    justify-content: center;
    font-size: 12px;

    &:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }
  }
`;

export const PromptDesignerRenderer: FC = () => {
  const [openOverlay, setOpenOverlay] = useAtom(overlayOpenState);

  if (openOverlay !== 'promptDesigner') {
    return null;
  }

  return (
    <AppErrorBoundary context="Prompt Designer" fallback={<div>Failed to render Prompt Designer</div>}>
      <PromptDesigner onClose={() => setOpenOverlay(undefined)} />
    </AppErrorBoundary>
  );
};

export type PromptDesignerProps = {
  onClose: () => void;
};

const lastPromptDesignerAttachedNodeState = atom<NodeId | undefined>(undefined);

export const PromptDesigner: FC<PromptDesignerProps> = ({ onClose }) => {
  const datasetProvider = useDatasetProvider();
  const { messages, setMessages, messageChanged, deleteMessage, addMessage } = usePromptDesignerMessages();
  const attachedNodeId = useAtomValue(promptDesignerAttachedChatNodeState);
  const [, setNodes] = useAtom(nodesState);
  const nodeOutput = useAtomValue(lastRunDataByNodeState);
  const [config, setConfig] = useAtom(promptDesignerConfigurationState);
  const [response, setResponse] = useAtom(promptDesignerResponseState);
  const [promptDesigner, setPromptDesigner] = useAtom(promptDesignerState);
  const nodesById = useAtomValue(nodesByIdState);

  const attachedNode = attachedNodeId?.nodeId ? (nodesById[attachedNodeId.nodeId] as ChatNode) : undefined;

  const testGroups = attachedNode?.tests ?? [];

  const [lastPromptDesignerAttachedNode, setLastPromptDesignerAttachedNode] = useAtom(
    lastPromptDesignerAttachedNodeState,
  );

  useEffect(() => {
    if (!attachedNode || lastPromptDesignerAttachedNode === attachedNode.id) {
      return;
    }

    const { data } = attachedNode;
    setConfig({
      data: {
        maxTokens: data.maxTokens,
        model: data.model,
        presencePenalty: data.presencePenalty,
        frequencyPenalty: data.frequencyPenalty,
        temperature: data.temperature,
        useTopP: data.useTopP,
        enableFunctionUse: data.enableFunctionUse,
        numberOfChoices: data.numberOfChoices,
        stop: data.stop,
        top_p: data.top_p,
        user: data.user,
      },
    });

    const nodeDataForAttachedNode = attachedNodeId ? nodeOutput[attachedNodeId.nodeId] : undefined;
    const nodeDataForAttachedNodeProcess = attachedNodeId
      ? nodeDataForAttachedNode?.find((n) => n.processId === attachedNodeId.processId)?.data
      : undefined;

    if (nodeDataForAttachedNodeProcess?.inputData) {
      let inputData = nodeDataForAttachedNodeProcess.inputData;
      // If node is a split run, just grab the first input data.
      if (attachedNode.isSplitRun) {
        inputData = mapValues(inputData, (val) =>
          isArrayDataValue(val as DataValue) ? arrayizeDataValue(val as ScalarDataValue)[0] : val,
        ) as InputsOrOutputsWithRefs;
      }
      const { messages } = getChatNodeMessages(inputData as Inputs);
      setMessages({
        messages,
      });
    }

    setLastPromptDesignerAttachedNode(attachedNode.id);
  }, [
    attachedNode,
    attachedNodeId,
    nodeOutput,
    setConfig,
    setMessages,
    lastPromptDesignerAttachedNode,
    setLastPromptDesignerAttachedNode,
  ]);

  const attachedNodeChanged = (newNode: ChatNode) => {
    setNodes((prev) => prev.map((n) => (n.id === newNode.id ? newNode : n)));
  };

  const testGroupChanged = (newTestGroup: NodeTestGroup, index: number) => {
    if (!attachedNode) {
      return;
    }

    attachedNodeChanged({
      ...attachedNode,
      tests: (attachedNode.tests ?? []).map((t, i) => (i === index ? newTestGroup : t)),
    });
  };

  const addTestGroup = () => {
    if (!attachedNode) {
      return;
    }

    attachedNodeChanged({
      ...attachedNode,
      tests: [
        ...(attachedNode.tests ?? []),
        {
          id: nanoid() as NodeId,
          tests: [],
          evaluatorGraphId: '' as GraphId,
        },
      ],
    });
  };

  const deleteTestGroup = (index: number) => {
    if (!attachedNode) {
      return;
    }

    attachedNodeChanged({
      ...attachedNode,
      tests: (attachedNode.tests ?? []).filter((_, i) => i !== index),
    });
  };

  const runTestGroup = useRunPromptDesignerTestGroupSampleCount(datasetProvider);

  const [testGroupResultsByNodeId, setTestGroupResultsByNodeId] = useAtom(promptDesignerTestGroupResultsByNodeIdState);

  const resultsForAttachedNode = testGroupResultsByNodeId[attachedNodeId?.nodeId ?? ''];

  const abortController = useRef<AbortController>();
  const [inProgress, setInProgress] = useState(false);
  const getAdHocInternalProcessContext = useGetAdHocInternalProcessContext();

  const tryRunSingle = async () => {
    try {
      abortController.current?.abort();
      abortController.current = new AbortController();
      setInProgress(true);
      setResponse({});

      if (attachedNodeId?.nodeId) {
        setTestGroupResultsByNodeId((s) => ({ ...s, [attachedNodeId.nodeId]: [] }));
      }

      const response = await runAdHocChat(
        messages,
        config.data,
        await getAdHocInternalProcessContext({
          onPartialResult: (partialResult) => {
            setResponse({ response: partialResult });
          },
          signal: abortController.current.signal,
        }),
      );

      setResponse({
        response,
      });
    } catch (err) {
      console.error(getError(err));
    } finally {
      abortController.current = undefined;
      setInProgress(false);
    }
  };

  const handleStartTestGroup = async (testGroup: NodeTestGroup) => {
    if (!attachedNodeId?.nodeId) {
      return;
    }

    abortController.current?.abort();
    abortController.current = new AbortController();
    setInProgress(true);
    setResponse({});
    setTestGroupResultsByNodeId((s) => ({ ...s, [attachedNodeId.nodeId]: [] }));

    try {
      await runTestGroup(
        testGroup,
        messages,
        promptDesigner.samples,
        {
          onPartialResults: (partialResults) => {
            setTestGroupResultsByNodeId((s) => ({
              ...s,
              [attachedNodeId.nodeId]: partialResults,
            }));
          },
        },
        config.data,
      );
    } catch (err) {
      console.error(getError(err));
    } finally {
      abortController.current = undefined;
      setInProgress(false);
    }
  };

  const handleCancel = () => {
    abortController.current?.abort();
    abortController.current = undefined;
    setInProgress(false);
  };

  return (
    <div css={styles}>
      <Button className="close-prompt-designer" appearance="subtle" onClick={onClose}>
        &times;
      </Button>

      <div className="prompt-designer-content">
        <div className="message-area">
          <div className="message-list">
            <Button
              key="add-message-first"
              className="add-message"
              appearance="subtle-link"
              onClick={() => addMessage(-1)}
            >
              + Add message
            </Button>
            {messages.map((message, index) => (
              <>
                <PromptDesignerMessage
                  message={message}
                  key={`message-${index}`}
                  onChange={(newMessage) => messageChanged(newMessage, index)}
                  onDelete={() => deleteMessage(index)}
                />
                <Button
                  key={`add-message-${index}`}
                  className="add-message"
                  appearance="subtle-link"
                  onClick={() => addMessage(index)}
                >
                  + Add message
                </Button>
              </>
            ))}
          </div>
        </div>
        <div className="response-area">
          {resultsForAttachedNode?.length ? (
            <PromptDesignerTestGroupResultList results={resultsForAttachedNode} />
          ) : (
            <pre className="pre-wrap response-text">{response.response ?? ''}</pre>
          )}
        </div>
        <div className="controls-area">
          <Tabs id="prompt-designer-tabs">
            <TabList>
              <Tab>Config</Tab>
              <Tab>Test</Tab>
            </TabList>
            <TabPanel>
              <PromptDesignerConfigPanel
                config={config}
                setConfig={setConfig}
                onRun={syncWrapper(tryRunSingle)}
              />
            </TabPanel>
            <TabPanel>
              <PromptDesignerTestPanel
                testGroups={testGroups}
                promptDesigner={promptDesigner}
                setPromptDesigner={setPromptDesigner}
                onTestGroupChanged={testGroupChanged}
                onDeleteTestGroup={deleteTestGroup}
                onAddTestGroup={addTestGroup}
                onStartTestGroup={handleStartTestGroup}
                inProgress={inProgress}
                onCancel={handleCancel}
              />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
