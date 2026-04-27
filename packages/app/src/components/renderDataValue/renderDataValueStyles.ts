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
  gap: calc(10px * var(--ui-font-scale));

  .multi-output-item {
    position: relative;
    padding-left: calc(10px * var(--ui-font-scale));

    .pre-wrap {
      margin: 0;
    }

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: calc(2px * var(--ui-font-scale));
      border-radius: 999px;
      background: var(--grey-lightish);
    }
  }

  &.chat-message-list {
    gap: 0;

    .multi-output-item {
      border-bottom: 1px solid var(--grey-lightish);
      padding: 4px 0 16px;

      &::before {
        display: none;
      }

      &:last-child {
        border-bottom: none;
      }
    }
  }

  .array-info {
    color: var(--grey-light);
    font-size: var(--ui-font-size-sm);
  }
`;
