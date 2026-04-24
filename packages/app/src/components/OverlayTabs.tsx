import { css } from '@emotion/react';
import { type FC, useEffect, useRef, useState } from 'react';

import { useAtom, useAtomValue } from 'jotai';
import clsx from 'clsx';
import { trivetState } from '../state/trivet.js';
import { useRunMenuCommand } from '../hooks/useMenuCommands.js';
import { isInTauri } from '../utils/tauri.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { overlayOpenState } from '../state/ui';
import { sidebarOpenState } from '../state/graphBuilder';
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

  .dropdown-menu .dropdown-button {
    background-color: transparent;
    color: var(--grey-lightest);
    border: none;
    padding: 0.5rem 1rem;
    cursor: pointer;

    &:hover {
      background-color: var(--grey);
    }
  }

  .file-menu {
    position: relative;
  }

  .file-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    background-color: var(--grey-darkest);
    border: 2px solid var(--grey-darkish);
    border-radius: 4px;
    box-shadow: 0 8px 16px var(--shadow-dark);
    font-family: 'Roboto Mono', monospace;
    color: var(--foreground);
    font-size: 13px;
    padding: 8px;
    z-index: 1;
    min-width: 150px;
  }

  .file-dropdown button {
    display: block;
    width: 100%;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    padding: 4px 8px;
    justify-content: flex-start;
    white-space: nowrap;
    text-align: left;
    font-size: 14px;
    transition:
      background-color 0.1s ease-out,
      color 0.1s ease-out;

    &:hover {
      background-color: var(--tertiary-light);
      color: var(--primary-text);
    }
  }

  .dropdown-button {
    background-color: transparent;
    color: var(--grey-lightest);
    border: none;
    padding: 0.5rem 1rem;
    cursor: pointer;

    &:hover {
      background-color: var(--grey);
      color: var(--primary-text);
    }
  }

  .file-dropdown.open {
    display: block;
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
  const runMenuCommandImpl = useRunMenuCommand();
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = useAtomValue(sidebarOpenState);

  const trivet = useAtomValue(trivetState);

  const runMenuCommand: typeof runMenuCommandImpl = (command) => {
    setFileMenuOpen(false);
    runMenuCommandImpl(command);
  };

  const communityEnabled = useFeatureFlag('community');

  useEffect(() => {
    if (!fileMenuOpen) {
      return;
    }

    const handleWindowMouseDown = (event: MouseEvent) => {
      if (fileMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setFileMenuOpen(false);
    };

    window.addEventListener('mousedown', handleWindowMouseDown);

    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
    };
  }, [fileMenuOpen]);

  return (
    <div css={styles} className={clsx({ 'sidebar-open': sidebarOpen })}>
      <div className="left-menu">
        {!isInTauri() && (
          <div ref={fileMenuRef} className="menu-item file-menu">
            <button
              className="dropdown-button"
              onMouseDown={(e) => {
                if (e.button === 0) {
                  setFileMenuOpen((open) => !open);
                }
              }}
            >
              File
            </button>
            <div className={clsx('file-dropdown', { open: fileMenuOpen })}>
              <button onMouseUp={() => runMenuCommand('new_project')}>New Project</button>
              <button onMouseUp={() => runMenuCommand('open_project')}>Open Project...</button>
              <button onMouseUp={() => runMenuCommand('save_project_as')}>Save Project As...</button>
              <button onMouseUp={() => runMenuCommand('settings')}>Settings</button>
              <button onMouseUp={() => runMenuCommand('export_graph')}>Export Graph</button>
              <button onMouseUp={() => runMenuCommand('import_graph')}>Import Graph</button>
            </div>
          </div>
        )}

        <div className={clsx('menu-item canvas-menu', { active: openOverlay === undefined })}>
          <button
            className="dropdown-item"
            onMouseDown={(e) => {
              if (e.button === 0) {
                setOpenOverlay(undefined);
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
              }
            }}
          >
            Data Studio
          </button>
        </div>
      </div>
    </div>
  );
};
