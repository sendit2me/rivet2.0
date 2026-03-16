import { useAtom } from 'jotai';
import { produce } from 'immer';
import { type ChatMessage } from '@ironclad/rivet-core';
import { promptDesignerMessagesState } from '../state/promptDesigner';
import { useStableCallback } from './useStableCallback.js';

export function usePromptDesignerMessages() {
  const [{ messages }, setMessages] = useAtom(promptDesignerMessagesState);

  const messageChanged = (newMessage: ChatMessage, index: number) => {
    setMessages((s) => ({
      ...s,
      messages: s.messages.map((m, i) => (i === index ? newMessage : m)),
    }));
  };

  const deleteMessage = useStableCallback((index: number) => {
    setMessages((s) => ({
      ...s,
      messages: [...s.messages.slice(0, index), ...s.messages.slice(index + 1)],
    }));
  });

  const addMessage = useStableCallback((index: number) => {
    setMessages((s) =>
      produce(s, (draft) => {
        draft.messages.splice(index + 1, 0, { type: 'user', message: '' });
      }),
    );
  });

  return {
    messages,
    setMessages,
    messageChanged,
    deleteMessage,
    addMessage,
  };
}
