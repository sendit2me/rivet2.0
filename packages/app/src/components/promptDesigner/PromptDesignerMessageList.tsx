import Button from '@atlaskit/button';
import { type FC } from 'react';
import { PromptDesignerMessage } from './PromptDesignerComponents.js';

export interface PromptDesignerMessageListProps {
  messages: Parameters<typeof PromptDesignerMessage>[0]['message'][];
  addMessage: (index: number) => void;
  deleteMessage: (index: number) => void;
  messageChanged: (newMessage: Parameters<typeof PromptDesignerMessage>[0]['message'], index: number) => void;
}

export const PromptDesignerMessageList: FC<PromptDesignerMessageListProps> = ({
  messages,
  addMessage,
  deleteMessage,
  messageChanged,
}) => {
  return (
    <div className="message-list">
      <Button key="add-message-first" className="add-message" appearance="subtle-link" onClick={() => addMessage(-1)}>
        + Add message
      </Button>
      {messages.map((message, index) => (
        <div key={`message-block-${index}`}>
          <PromptDesignerMessage
            message={message}
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
        </div>
      ))}
    </div>
  );
};
