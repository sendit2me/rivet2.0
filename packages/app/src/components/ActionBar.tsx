import { css } from '@emotion/react';
import clsx from 'clsx';
import { type FC, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useLoadRecording } from '../hooks/useLoadRecording';
import { useSaveRecording } from '../hooks/useSaveRecording';
import { graphRunningState, graphPausedState } from '../state/dataFlow';
import { lastRecordingState, loadedRecordingState } from '../state/execution';
import { defaultExecutorState } from '../state/settings';
import ChevronRightIcon from 'majesticons/line/chevron-right-line.svg?react';
import MultiplyIcon from 'majesticons/line/multiply-line.svg?react';
import PauseIcon from 'majesticons/line/pause-circle-line.svg?react';
import PlayIcon from 'majesticons/line/play-circle-line.svg?react';
import MoreMenuVerticalIcon from 'majesticons/line/more-menu-vertical-line.svg?react';
import Popup from '@atlaskit/popup';
import { useRemoteDebugger } from '../hooks/useRemoteDebugger';
import { ActionBarMoreMenu } from './ActionBarMoreMenu';
import { CopyAsTestCaseModal } from './CopyAsTestCaseModal';
import { useToggle } from 'ahooks';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { GentraceInteractors } from './gentrace/GentraceInteractors';
import { projectMetadataState } from '../state/savedGraphs';
import { graphMetadataState } from '../state/graph';
import { type GraphId } from '@ironclad/rivet-core';
import { wrapAsync } from '../utils/errorHandling';
import { getActionBarExecutionState } from '../state/selectors/executionSelectors.js';
import type { DebuggerPanelAnchor } from '../state/ui.js';

const styles = css`
  position: fixed;
  top: calc(20px + var(--project-selector-height));
  right: 20px;
  background: var(--grey-darker);
  border-radius: 8px;
  corner-shape: squircle;
  border: 1px solid var(--grey-dark);
  height: 32px;
  z-index: 220;
  display: flex;
  box-shadow: 3px 1px 10px rgba(0, 0, 0, 0.5);
  justify-content: flex-end;
  gap: 8px;

  .run-button button,
  .pause-button button,
  .unload-recording-button button,
  .run-test-button button,
  .save-recording-button button,
  .run-gentrace-button button,
  .more-menu,
  .remote-debugger-button button {
    border: none;
    padding: 0.5rem 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    height: 32px;
    border-radius: 10px;
    corner-shape: squircle;
  }

  .run-button button {
    background-color: var(--success);
    color: var(--grey-lightest);

    &:hover {
      background-color: var(--success-dark);
    }
  }

  .run-gentrace-button button,
  .pause-button button,
  .save-recording-button button {
    background-color: rgba(255, 255, 255, 0.1);

    &:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
  }

  .unload-recording-button button {
    background-color: var(--warning);
    color: var(--grey-dark);
  }

  .run-button.running button {
    background-color: var(--error);
  }

  .pause-button.paused button {
    background-color: var(--warning);
    color: var(--grey-dark);

    &:hover {
      background-color: var(--warning-dark);
    }
  }

  .run-test-button button {
    background-color: var(--grey-darkish);
    color: var(--grey-lightest);

    &:hover {
      background-color: var(--grey);
    }
  }

  .more-menu {
    background-color: transparent;
    font-size: var(--ui-font-size-icon-xl);
    height: 32px;
    line-height: 0;
    padding: 0;
    width: 32px;
    height: 32px;

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
  }

  .remote-debugger-button.active button {
    background-color: var(--error);
  }

  .remote-debugger-button.reconnecting button {
    background-color: var(--warning);
    color: var(--grey-dark);
  }
`;

export type ActionBarProps = {
  onRunGraph?: (options: { graphId?: GraphId }) => void;
  onRunTests?: () => void;
  onAbortGraph?: () => void;
  onPauseGraph?: () => void;
  onResumeGraph?: () => void;
};

export const ActionBar: FC<ActionBarProps> = ({ onRunGraph, onAbortGraph, onPauseGraph, onResumeGraph }) => {
  const actionBarRef = useRef<HTMLDivElement>(null);
  const graphMetadata = useAtomValue(graphMetadataState);
  const projectMetadata = useAtomValue(projectMetadataState);
  const lastRecording = useAtomValue(lastRecordingState);
  const saveRecording = useSaveRecording();

  const graphRunning = useAtomValue(graphRunningState);
  const graphPaused = useAtomValue(graphPausedState);

  const loadedRecording = useAtomValue(loadedRecordingState);
  const { unloadRecording } = useLoadRecording();
  const [menuIsOpen, toggleMenuIsOpen] = useToggle();
  const selectedExecutor = useAtomValue(defaultExecutorState);

  const { sessionState: remoteDebugger, disconnect } = useRemoteDebugger();
  const actionBarExecutionState = getActionBarExecutionState({
    graphPaused,
    graphRunning,
    selectedExecutor,
    session: remoteDebugger,
  });
  const [copyAsTestCaseModalOpen, toggleCopyAsTestCaseModalOpen] = useToggle();

  const plugins = useDependsOnPlugins();

  const gentracePlugin = plugins.find((plugin) => plugin.id === 'gentrace');
  const isGentracePluginEnabled = !!gentracePlugin;

  const hasMainGraph = projectMetadata.mainGraphId != null;
  const isMainGraph = hasMainGraph && graphMetadata?.id === projectMetadata.mainGraphId;

  const getDebuggerPanelAnchor = (): DebuggerPanelAnchor | undefined => {
    const rect = actionBarRef.current?.getBoundingClientRect();

    return rect
      ? {
          bottom: rect.bottom,
          right: rect.right,
        }
      : undefined;
  };

  return (
    <div css={styles} ref={actionBarRef}>
      {actionBarExecutionState.showRemoteDebuggerBanner && (
        <div
          className={clsx('remote-debugger-button active', {
            reconnecting: remoteDebugger.reconnecting,
          })}
        >
          <button onClick={() => disconnect()}>
            {remoteDebugger.reconnecting ? 'Remote Debugger (Reconnecting...)' : 'Disconnect Remote Debugger'}
          </button>
        </div>
      )}

      {loadedRecording && (
        <div className={clsx('unload-recording-button')}>
          <button onClick={() => unloadRecording()}>Unload Recording</button>
        </div>
      )}
      {graphRunning && (
        <div className={clsx('pause-button', { paused: graphPaused })}>
          <button onClick={graphPaused ? onResumeGraph : onPauseGraph}>
            {graphPaused ? (
              <>
                Resume <PlayIcon />
              </>
            ) : (
              <>
                Pause <PauseIcon />
              </>
            )}
          </button>
        </div>
      )}

      {isGentracePluginEnabled && <GentraceInteractors />}

      {lastRecording && (
        <div className={clsx('save-recording-button')}>
          <button onClick={saveRecording}>Save Recording</button>
        </div>
      )}
      <div className={clsx('run-button', { running: graphRunning, recording: !!loadedRecording })}>
        {actionBarExecutionState.canRun && (
          <button onClick={() => (graphRunning ? onAbortGraph?.() : onRunGraph?.({ graphId: graphMetadata?.id }))}>
            {graphRunning ? (
              <>
                Abort <MultiplyIcon />
              </>
            ) : loadedRecording ? (
              <>
                Play Recording <ChevronRightIcon />
              </>
            ) : (
              <>
                {hasMainGraph && !isMainGraph ? `Run ${graphMetadata?.name}` : 'Run'} <ChevronRightIcon />
              </>
            )}
          </button>
        )}
      </div>
      {hasMainGraph && !isMainGraph && !graphRunning && (
        <div className={clsx('run-button', { running: graphRunning })}>
          {actionBarExecutionState.canRun && (
            <button
              onClick={() => (graphRunning ? onAbortGraph?.() : onRunGraph?.({ graphId: projectMetadata.mainGraphId }))}
            >
              {graphRunning ? (
                <>
                  Abort <MultiplyIcon />
                </>
              ) : (
                <>
                  Run Main <ChevronRightIcon />
                </>
              )}
            </button>
          )}
        </div>
      )}
      <Popup
        isOpen={menuIsOpen}
        onClose={toggleMenuIsOpen.setLeft}
        content={() => (
          <ActionBarMoreMenu
            getDebuggerPanelAnchor={getDebuggerPanelAnchor}
            onClose={toggleMenuIsOpen.setLeft}
            onCopyAsTestCase={toggleCopyAsTestCaseModalOpen.setRight}
          />
        )}
        placement="bottom-end"
        trigger={(triggerProps) => (
          <button
            className="more-menu"
            {...triggerProps}
            onMouseDown={(e) => {
              if (e.button === 0) {
                toggleMenuIsOpen.toggle();
                e.preventDefault();
              }
            }}
          >
            <MoreMenuVerticalIcon />
          </button>
        )}
      />
      <CopyAsTestCaseModal open={copyAsTestCaseModalOpen} onClose={toggleCopyAsTestCaseModalOpen.setLeft} />
    </div>
  );
};
