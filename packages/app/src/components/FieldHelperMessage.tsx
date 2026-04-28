import { HelperMessage } from '@atlaskit/form';
import { css } from '@emotion/react';
import clsx from 'clsx';
import type { FC, ReactNode } from 'react';

const fieldHelperMessageStyles = css`
  margin-top: 2px;
  margin-bottom: 12px;

  & > div {
    margin-block: 0;
  }
`;

export const FieldHelperMessage: FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={clsx('field-helper-message', className)} css={fieldHelperMessageStyles}>
    <HelperMessage>{children}</HelperMessage>
  </div>
);
