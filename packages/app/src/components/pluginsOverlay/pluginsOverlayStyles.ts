import { css } from '@emotion/react';

export const pluginsOverlayStyles = css`
  position: fixed;
  left: 250px;
  top: var(--project-selector-height);
  right: 0;
  bottom: 0;
  background: var(--grey-darker);
  padding: 64px 32px 0 32px;
  z-index: 150;

  display: flex;
  flex-direction: column;

  > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--grey);
  }

  > main {
    flex: 1 1 auto;
    overflow: auto;
    min-height: 0;
  }

  > footer {
    border-top: 1px solid var(--grey);
    display: flex;
    align-items: center;
    padding: 16px 0;
  }
`;

export const pluginsOverlayBodyStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;

  .add-npm-plugin {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .inputs {
      display: grid;
      grid-template-columns: 3fr 1fr;
      column-gap: 8px;
    }
  }

  .helperMessage > div > span {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    code {
      line-height: 11px;
      font-size: 11px;
    }

    .copy-plugin-dir-button {
      cursor: pointer;

      &:hover {
        color: white;
      }
    }
  }

  .plugin-list {
    display: flex;
    flex-direction: column;
    background: var(--grey-dark);
    border: 1px solid var(--grey);
    flex: 1;
    position: relative;
  }
`;
