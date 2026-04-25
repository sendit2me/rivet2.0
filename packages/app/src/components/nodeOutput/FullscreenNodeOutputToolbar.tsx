import { css } from '@emotion/react';
import CopyIcon from 'majesticons/line/clipboard-line.svg?react';
import FlaskIcon from 'majesticons/line/flask-line.svg?react';
import { type FC, type KeyboardEventHandler, type Ref } from 'react';
import { LabeledToggle } from '../LabeledToggle.js';

const fullscreenOutputToolbarCss = css`
  display: inline-flex;
  gap: 8px;

  border: 1px solid var(--grey);
  background: var(--grey-darker);
  border-radius: 4px;
  box-shadow: 4px 4px 8px var(--shadow-dark);
  margin-bottom: 8px;
  padding: 8px 12px;

  .toolbar-icon {
    width: 24px;
    height: 24px;
    font-size: 24px;
    opacity: 0.2;
    cursor: pointer;
    transition: opacity 0.2s;
    z-index: 1;
  }

  .toolbar-icon:hover {
    opacity: 1;
  }

  .copy-json-button {
    opacity: 0.2;
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
    font-size: 10px;
    transition: opacity 0.2s;
    z-index: 1;
    height: 24px;
    display: inline-flex;
    align-items: center;

    &:hover {
      opacity: 1;
    }
  }

  .markdown-toggle {
    display: flex;
    align-items: center;
    user-select: none;
    color: var(--foreground);
  }

  .search-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 280px;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0 8px;
  }

  .search-input {
    width: 100%;
    min-width: 140px;
    border: 1px solid var(--grey);
    background: rgba(255, 255, 255, 0.05);
    color: var(--foreground);
    border-radius: 4px;
    padding: 4px 8px;
    font: inherit;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .search-nav-button {
    cursor: pointer;
    border: 1px solid var(--grey);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    border-radius: 4px;
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
  }

  .search-nav-button:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .search-count {
    color: var(--grey-lighter);
    font-size: 12px;
    min-width: 52px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`;

export type FullscreenNodeOutputToolbarProps = {
  renderMarkdown: boolean;
  onToggleRenderMarkdown: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  currentMatchIndex: number;
  totalMatchCount: number;
  onPreviousMatch: () => void;
  onNextMatch: () => void;
  searchInputRef: Ref<HTMLInputElement>;
  onSearchInputKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onCopyValue: () => void;
  onCopyJson: () => void;
  onOpenPromptDesigner?: () => void;
};

export const FullscreenNodeOutputToolbar: FC<FullscreenNodeOutputToolbarProps> = ({
  renderMarkdown,
  onToggleRenderMarkdown,
  query,
  onQueryChange,
  currentMatchIndex,
  totalMatchCount,
  onPreviousMatch,
  onNextMatch,
  searchInputRef,
  onSearchInputKeyDown,
  onCopyValue,
  onCopyJson,
  onOpenPromptDesigner,
}) => {
  return (
    <div css={fullscreenOutputToolbarCss}>
      <LabeledToggle
        id="fullscreen-output-render-markdown"
        isChecked={renderMarkdown}
        onChange={onToggleRenderMarkdown}
        label="Render Markdown"
        className="markdown-toggle"
      />
      <div className="search-group">
        <input
          ref={searchInputRef}
          className="search-input"
          placeholder="Search output"
          spellCheck={false}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchInputKeyDown}
        />
        <button className="search-nav-button" onClick={onPreviousMatch} disabled={totalMatchCount === 0} title="Previous match">
          {'<'}
        </button>
        <button className="search-nav-button" onClick={onNextMatch} disabled={totalMatchCount === 0} title="Next match">
          {'>'}
        </button>
        <span className="search-count">
          {totalMatchCount === 0 ? '0 / 0' : `${Math.min(currentMatchIndex + 1, totalMatchCount)} / ${totalMatchCount}`}
        </span>
      </div>
      <div className="toolbar-icon copy-button" onClick={onCopyValue} title="Copy Value">
        <CopyIcon />
      </div>
      <div className="copy-json-button" onClick={onCopyJson} title="Copy as JSON">
        JSON
      </div>
      {onOpenPromptDesigner && (
        <div className="toolbar-icon prompt-designer-button" onClick={onOpenPromptDesigner}>
          <FlaskIcon />
        </div>
      )}
    </div>
  );
};
