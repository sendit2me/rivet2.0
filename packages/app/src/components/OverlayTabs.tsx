import { css } from '@emotion/react';
import { type FC, type ReactNode } from 'react';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import clsx from 'clsx';
import { trivetState } from '../state/trivet.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { type OverlayKey, overlayOpenState } from '../state/ui';
import { emptyGraphSearchState, openOrFocusGraphSearchState, searchingGraphState } from '../state/graphBuilder';
import { useFeatureFlag } from '../hooks/useFeatureFlag';

const styles = css`
  display: flex;
  align-items: stretch;
  align-self: stretch;
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(760px, 65vw);
  z-index: 200;
  border-left: 1px solid var(--grey-darkest);

  .left-menu {
    display: flex;
    align-items: stretch;
    gap: 0;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    user-select: none;
  }

  .left-menu::-webkit-scrollbar {
    display: none;
  }

  .menu-item {
    position: relative;
    background-color: transparent;
    color: var(--grey-light);
    border: none;
    transition:
      background-color 0.2s ease-out,
      color 0.2s ease-out,
      border-color 0.2s ease-out;

    border-bottom: 1px solid var(--grey);
    border-right: 1px solid var(--grey-darkest);

    margin: 0;
    display: flex;
    flex: 0 0 auto;
    min-width: 0;
    height: calc(100% + 1px);
    margin-bottom: -1px;

    background: var(--grey-darkerish);
  }

  .menu-item > button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 12px;
    color: inherit;
    font-size: var(--ui-font-size-sm);
    line-height: 1;
    min-height: 0;
    min-width: 0;
    text-align: center;
    white-space: nowrap;
  }

  .menu-item:hover {
    background-color: var(--grey-darkish);
  }

  .menu-item.active {
    background-color: var(--primary);
    color: var(--foreground-on-primary);
    border-bottom-color: var(--primary);

    &:hover {
      background-color: var(--primary-dark);
      border-bottom-color: var(--primary-dark);
    }
  }

  .search-menu {
    > button {
      gap: 6px;

      svg {
        flex: 0 0 auto;
        height: 14px;
        width: 14px;
      }
    }
  }

  .trivet-menu button {
    display: flex;
    flex-direction: row;

    .spinner {
      margin-left: 4px;
    }
  }

  .trivet-menu.active .spinner svg {
    color: var(--grey-dark);
  }
`;

const WORKSPACE_TABS: Array<{ key: OverlayKey; label: string; className: string }> = [
  { key: 'plugins', label: 'Plugins', className: 'plugins' },
  { key: 'community', label: 'Community', className: 'community' },
  { key: 'promptDesigner', label: 'Prompt Designer', className: 'prompt-designer-menu' },
  { key: 'trivet', label: 'Trivet Tests', className: 'trivet-menu' },
  { key: 'chatViewer', label: 'Chat Viewer', className: 'chat-viewer-menu' },
  { key: 'dataStudio', label: 'Data Studio', className: 'data-studio' },
];

export const OverlayTabs: FC = () => {
  const [openOverlay, setOpenOverlay] = useAtom(overlayOpenState);
  const setGraphSearch = useSetAtom(searchingGraphState);

  const trivet = useAtomValue(trivetState);

  const communityEnabled = useFeatureFlag('community');

  const openWorkspace = (workspace: OverlayKey) => {
    setOpenOverlay((current) => (current === workspace ? undefined : workspace));
    setGraphSearch(emptyGraphSearchState);
  };

  const visibleWorkspaceTabs = WORKSPACE_TABS.filter((tab) => tab.key !== 'community' || communityEnabled);

  return (
    <nav css={styles} aria-label="Workspace navigation">
      <div className="left-menu">
        {visibleWorkspaceTabs.map((tab) => (
          <WorkspaceTab
            key={tab.key}
            className={tab.className}
            active={openOverlay === tab.key}
            onOpen={() => openWorkspace(tab.key)}
          >
            {tab.label}
            {tab.key === 'trivet' && trivet.runningTests && (
              <div className="spinner">
                <LoadingSpinner />
              </div>
            )}
          </WorkspaceTab>
        ))}
        <div className="menu-item search-menu">
          <button
            type="button"
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay(undefined);
                setGraphSearch((state) =>
                  state.searching ? emptyGraphSearchState : openOrFocusGraphSearchState(state),
                );
              }
            }}
          >
            <SearchIcon />
            Search
          </button>
        </div>
      </div>
    </nav>
  );
};

const WorkspaceTab: FC<{
  active: boolean;
  children: ReactNode;
  className: string;
  onOpen: () => void;
}> = ({ active, children, className, onOpen }) => (
  <div className={clsx('menu-item', className, { active })}>
    <button
      type="button"
      className="dropdown-item"
      onMouseDown={(e) => {
        if (e.button === 0) {
          onOpen();
        }
      }}
    >
      {children}
    </button>
  </div>
);

const SearchIcon: FC = () => (
  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
    <path
      d="M10.75 17.5a6.75 6.75 0 1 1 0-13.5 6.75 6.75 0 0 1 0 13.5ZM16 16l4 4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);
