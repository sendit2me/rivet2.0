import Button from '@atlaskit/button';
import CrossIcon from '@atlaskit/icon/glyph/cross';
import { ModalHeader, ModalTitle } from '@atlaskit/modal-dialog';
import { css } from '@emotion/react';
import type { FC, ReactNode } from 'react';

const modalHeaderCloseButtonStyles = css`
  margin-right: calc(-8px * var(--ui-font-scale, 1));
`;

export const AppModalHeader: FC<{
  title: ReactNode;
  onClose?: () => void;
}> = ({ title, onClose }) => (
  <ModalHeader>
    <ModalTitle>{title}</ModalTitle>
    {onClose && (
      <Button appearance="link" css={modalHeaderCloseButtonStyles} onClick={onClose}>
        <CrossIcon label="Close Modal" primaryColor="currentColor" />
      </Button>
    )}
  </ModalHeader>
);
