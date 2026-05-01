import { css } from '@emotion/react';

export const fields = css`
  --settings-field-gap: calc(20px * var(--ui-font-scale));
  --settings-auto-configuration-gap: calc(16px * var(--ui-font-scale));

  display: flex;
  flex-direction: column;
  gap: var(--settings-field-gap);

  .auto-configurations {
    display: flex;
    flex-direction: column;
    gap: var(--settings-auto-configuration-gap);
  }

  .settings-toggle-field {
    color: var(--grey-light);
    font-size: var(--ui-font-size-base);
  }
`;
