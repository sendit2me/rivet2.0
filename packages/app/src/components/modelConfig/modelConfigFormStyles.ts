import { css } from '@emotion/react';

/** Shared layout for the model-config entity forms (Profile / Skill / Preset). */
export const modelConfigFormStyles = css`
  display: flex;
  flex-direction: column;
  gap: 10px;

  .model-config-form-row-inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .model-config-form-subsection {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--grey-darkish);
  }

  .model-config-form-subsection-title {
    color: var(--foreground-muted);
    font-weight: var(--font-weight-semibold);
  }

  .model-config-form-subsection-help {
    margin: 0;
    color: var(--foreground-muted);
    font-size: var(--ui-font-size-sm);
    line-height: 1.4;
  }
`;
