import { css } from '@emotion/react';

/** Shared layout for the model-config entity forms (Profile / Skill / Preset). */
export const modelConfigFormStyles = css`
  display: flex;
  flex-direction: column;
  gap: 10px;

  /* Phase C slot: object-valued editors (a Skill's extraBody, a Preset's overrides) drop in as
     additional fields below the scalar fields — no restructure needed. */
  .model-config-form-row-inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;
