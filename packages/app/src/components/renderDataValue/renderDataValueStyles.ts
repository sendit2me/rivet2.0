import { css } from '@emotion/react';

export const renderDataValueStyles = css`
  .chat-message.user header em {
    color: var(--text-color-accent-3);
  }

  .chat-message.assistant header em {
    color: var(--text-color-accent-2);
  }

  .chat-message.function header em {
    color: var(--grey-light);
  }

  .chat-message.system header em {
    color: var(--grey-light);
  }

  .message-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .chat-message-url-image {
    max-width: 300px;
    object-fit: contain;
  }
`;

export const multiOutputStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  .multi-output-item {
    border-bottom: 1px solid var(--grey-lightish);
    padding-bottom: 8px;

    &:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
  }

  &.chat-message-list {
    gap: 0;

    .multi-output-item {
      border-bottom: 1px solid var(--grey-lightish);
      padding: 4px 0 16px;
    }
  }

  .array-info {
    color: var(--grey-light);
    font-size: var(--ui-font-size-sm);
  }
`;
