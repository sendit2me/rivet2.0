import { css } from '@emotion/react';
import { type FC } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { AppErrorBoundary } from './AppErrorBoundary';
import {
  promptDesignerState,
} from '../state/promptDesigner';
import { type NodeTestGroup } from '@valerypopoff/rivet2-core';
import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
import Button from '@atlaskit/button';
import { overlayOpenState } from '../state/ui';
import { wrapAsync } from '../utils/errorHandling';
import { usePromptDesignerMessages } from '../hooks/usePromptDesignerMessages';
import { PromptDesignerConfigPanel } from './promptDesigner/PromptDesignerConfigPanel';
import { PromptDesignerMessageList } from './promptDesigner/PromptDesignerMessageList.js';
import { PromptDesignerResponsePane } from './promptDesigner/PromptDesignerResponsePane.js';
import { PromptDesignerTestPanel } from './promptDesigner/PromptDesignerTestPanel';
import { usePromptDesignerAttachedNode } from './promptDesigner/usePromptDesignerAttachedNode.js';
import { usePromptDesignerRunActions } from './promptDesigner/usePromptDesignerRunActions.js';

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
    font-size: var(--ui-font-size-base);
    line-height: 22px;
    font-family: var(--font-family);
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
      font-family: var(--font-family);
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
    font-size: var(--ui-font-size-base);
    font-family: var(--font-family);
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

  .test-empty-state {
    padding: 16px 20px;
    color: var(--grey-lightest);
    font-size: var(--ui-font-size-sm);
    line-height: 1.4;
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
    border-radius: 20px;
    corner-shape: squircle;
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
    font-size: var(--ui-font-size-sm);

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

export const PromptDesigner: FC<PromptDesignerProps> = ({ onClose }) => {
  const { messages, setMessages, messageChanged, deleteMessage, addMessage } = usePromptDesignerMessages();
  const [promptDesigner, setPromptDesigner] = useAtom(promptDesignerState);
  const { attachedNode, config, setConfig, testGroups, addTestGroup, deleteTestGroup, testGroupChanged } =
    usePromptDesignerAttachedNode({
      setMessages,
    });
  const { handleCancel, handleStartTestGroup, inProgress, response, resultsForAttachedNode, tryRunSingle } =
    usePromptDesignerRunActions({
      configData: config.data,
      messages,
      samples: promptDesigner.samples,
    });

  return (
    <div css={styles}>
      <Button className="close-prompt-designer" appearance="subtle" onClick={onClose}>
        &times;
      </Button>

      <div className="prompt-designer-content">
        <div className="message-area">
          <PromptDesignerMessageList
            messages={messages}
            addMessage={addMessage}
            deleteMessage={deleteMessage}
            messageChanged={messageChanged}
          />
        </div>
        <div className="response-area">
          <PromptDesignerResponsePane response={response.response} results={resultsForAttachedNode} />
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
                onRun={wrapAsync(tryRunSingle, 'Run prompt designer test')}
              />
            </TabPanel>
            <TabPanel>
              <PromptDesignerTestPanel
                testGroups={testGroups}
                canEditTestGroups={attachedNode != null}
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
