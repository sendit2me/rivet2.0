import { css } from '@emotion/react';

export const fields = css`
  display: flex;
  flex-direction: column;
  gap: 20px;

  .auto-configurations {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-toggle-field {
    color: var(--grey-light);
    font-size: 14px;
  }
`;
