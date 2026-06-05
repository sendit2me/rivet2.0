import CrossIcon from '@atlaskit/icon/glyph/cross';
import { ModalHeader, ModalTitle } from '@atlaskit/modal-dialog';
import { css } from '@emotion/react';
import type { FC, ReactNode } from 'react';

const modalHeaderCloseButtonStyles = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(32px * var(--ui-font-scale, 1));
  height: calc(32px * var(--ui-font-scale, 1));
  padding: 0;
  color: var(--primary);
  background: transparent;
  border: 0;
  cursor: pointer;
  line-height: 0;
  margin-right: calc(-8px * var(--ui-font-scale, 1));

  &:hover,
  &:focus-visible {
    color: var(--primary-light);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    outline: none;
  }

  svg {
    color: currentColor;
  }
`;

export const AppModalHeader: FC<{
  title: ReactNode;
  onClose?: () => void;
}> = ({ title, onClose }) => (
  <ModalHeader>
    <ModalTitle>{title}</ModalTitle>
    {onClose && (
      <button type="button" css={modalHeaderCloseButtonStyles} aria-label="Close modal" onClick={onClose}>
        <CrossIcon label="Close Modal" primaryColor="currentColor" />
      </button>
    )}
  </ModalHeader>
);
