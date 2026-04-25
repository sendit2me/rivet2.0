import { css } from '@emotion/react';
import { type FC } from 'react';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import clsx from 'clsx';
import { trivetState } from '../state/trivet.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { overlayOpenState } from '../state/ui';
import {
  emptyGraphSearchState,
  openOrFocusGraphSearchState,
  searchingGraphState,
  sidebarOpenState,
} from '../state/graphBuilder';
import { useFeatureFlag } from '../hooks/useFeatureFlag';

const styles = css`
  display: flex;
  justify-content: center;
  align-items: flex-start;
  z-index: 200;
  position: absolute;
  top: var(--project-selector-height);
  left: 50%;
  transform: translateX(-50%);
  min-height: 40px;
  max-width: calc(100vw - 16px);

  .left-menu {
    display: flex;
    align-items: stretch;
    gap: 0;
    max-width: 100%;
    user-select: none;
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

    border: 1px solid var(--grey);
    border-top: none;
    border-right: none;

    margin: 0;
    display: flex;
    min-width: 0;
    min-height: 24px;

    border-radius: 0 0 8px 8px;
    background: var(--grey-darkerish);

    box-shadow: 0 3px 3px rgba(0, 0, 0, 0.2);
  }

  .menu-item > button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.5rem 1rem;
    color: inherit;
    line-height: 1.2;
    min-height: 24px;
    min-width: 0;
    text-align: center;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .menu-item:hover {
    background-color: var(--grey);
  }

  .menu-item.active {
    background-color: var(--primary);
    color: var(--foreground-on-primary);
    border-top: 1px solid var(--primary);

    &:hover {
      background-color: var(--primary-light);
    }
  }

  .menu-item:last-of-type {
    border-right: 1px solid var(--grey);
  }

  .search-menu {
    align-self: center;
    background: var(--grey-darker);
    border: 1px solid var(--grey);
    border-radius: 4px;
    margin-left: 8px;
    min-height: 24px;

    > button {
      gap: 6px;
      min-height: 24px;
      padding: 0.2rem 0.7rem;
      white-space: nowrap;

      svg {
        flex: 0 0 auto;
        height: 14px;
        width: 14px;
      }
    }
  }

  .search-menu:hover {
    background-color: var(--grey);
  }

  .remote-debugger {
    position: relative;
  }

  .trivet-menu button {
    display: flex;
    flex-direction: row;

    .spinner {
      margin-left: 4px;
    }

    &.active .spinner svg {
      color: var(--grey-dark);
    }
  }
`;

export const OverlayTabs: FC = () => {
  const [openOverlay, setOpenOverlay] = useAtom(overlayOpenState);
  const setGraphSearch = useSetAtom(searchingGraphState);
  const sidebarOpen = useAtomValue(sidebarOpenState);

  const trivet = useAtomValue(trivetState);

  const communityEnabled = useFeatureFlag('community');

  return (
    <div css={styles} className={clsx({ 'sidebar-open': sidebarOpen })}>
      <div className="left-menu">
        <div className={clsx('menu-item canvas-menu', { active: openOverlay === undefined })}>
          <button
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay(undefined);
                setGraphSearch(emptyGraphSearchState);
              }
            }}
          >
            Canvas
          </button>
        </div>

        <div className={clsx('menu-item plugins', { active: openOverlay === 'plugins' })}>
          <button
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay((s) => (s === 'plugins' ? undefined : 'plugins'));
                setGraphSearch(emptyGraphSearchState);
              }
            }}
          >
            Plugins
          </button>
        </div>

        {communityEnabled && (
          <div className={clsx('menu-item community', { active: openOverlay === 'community' })}>
            <button
              className="dropdown-item"
              onMouseDown={(e) => {
                if (e.button === 0) {
                  setOpenOverlay((s) => (s === 'community' ? undefined : 'community'));
                  setGraphSearch(emptyGraphSearchState);
                }
              }}
            >
              Community
            </button>
          </div>
        )}

        <div className={clsx('menu-item prompt-designer-menu', { active: openOverlay === 'promptDesigner' })}>
          <button
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay((s) => (s === 'promptDesigner' ? undefined : 'promptDesigner'));
                setGraphSearch(emptyGraphSearchState);
              }
            }}
          >
            Prompt Designer
          </button>
        </div>
        <div className={clsx('menu-item trivet-menu', { active: openOverlay === 'trivet' })}>
          <button
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay((s) => (s === 'trivet' ? undefined : 'trivet'));
                setGraphSearch(emptyGraphSearchState);
              }
            }}
          >
            Trivet Tests
            {trivet.runningTests && (
              <div className="spinner">
                <LoadingSpinner />
              </div>
            )}
          </button>
        </div>
        <div className={clsx('menu-item chat-viewer-menu', { active: openOverlay === 'chatViewer' })}>
          <button
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay((s) => (s === 'chatViewer' ? undefined : 'chatViewer'));
                setGraphSearch(emptyGraphSearchState);
              }
            }}
          >
            Chat Viewer
          </button>
        </div>
        <div className={clsx('menu-item data-studio', { active: openOverlay === 'dataStudio' })}>
          <button
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay((s) => (s === 'dataStudio' ? undefined : 'dataStudio'));
                setGraphSearch(emptyGraphSearchState);
              }
            }}
          >
            Data Studio
          </button>
        </div>
        <div className="menu-item search-menu">
          <button
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
    </div>
  );
};

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
