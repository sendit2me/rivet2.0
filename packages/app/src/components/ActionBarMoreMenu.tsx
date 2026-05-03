import { css } from '@emotion/react';
import { type FC, type MouseEvent } from 'react';
import { useLoadRecording } from '../hooks/useLoadRecording';
import { useExecutorSessionState } from '../hooks/useExecutorSession';
import { getExecutorOptions, selectedExecutorState } from '../state/settings';
import { useExecutorSessionHostConfig } from '../providers/ExecutorSessionContext.js';
import {
  debuggerPanelAnchorState,
  type DebuggerPanelAnchor,
  debuggerPanelOpenState,
  helpModalOpenState,
} from '../state/ui';
import { settingsModalOpenState } from './SettingsModal';
import { SegmentedEditor } from './editors/SegmentedEditor';
import LinkIcon from 'majesticons/line/link-circle-line.svg?react';
import GearIcon from 'majesticons/line/settings-cog-line.svg?react';
import ForwardCircleIcon from 'majesticons/line/forward-circle-line.svg?react';
import CopyIcon from 'majesticons/line/clipboard-plus-line.svg?react';
import QuestionIcon from 'majesticons/line/question-circle-line.svg?react';
import { useSetAtom, useAtom } from 'jotai';

const moreMenuStyles = css`
  background-color: var(--grey-darkish);
  border-radius: 8px;
  corner-shape: squircle;
  border: 1px solid var(--grey-dark);
  box-shadow: 3px 1px 10px rgba(0, 0, 0, 0.5);
  min-width: 280px;
  display: flex;
  flex-direction: column;

  * {
    font-family: 'Roboto', sans-serif;
  }

  .menu-item-button {
    padding: 0.5rem 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    height: 48px;
    border-radius: var(--ui-button-radius);
    corner-shape: squircle;
    background-color: transparent;
    border: none;
    font-size: var(--ui-font-size-base);
    color: var(--grey-lighter);

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
  }

  .executor {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.4rem;
    padding: 0.625rem 1rem 0.75rem;
    min-height: 72px;
    color: var(--grey-lighter);
    font-size: var(--ui-font-size-base);

    .executor-title,
    .select-executor-remote {
      color: var(--grey-lighter);
      font-size: var(--ui-font-size-base);
      line-height: 1.25;
      display: flex;
      align-items: center;
    }

    .select-executor-remote {
      font-weight: 700;
      min-height: calc(32px * var(--ui-font-scale));
    }

    .segmented-editor-field {
      flex: 1 1 auto;
      min-width: 0;
    }

    .segmented-choice {
      width: calc(100% + 3px);
      margin-left: -0.15em;
    }

    .segmented-choice-option {
      flex: 1 1 0;
      font-size: var(--ui-font-size-base);
    }
  }
`;

export const ActionBarMoreMenu: FC<{
  getDebuggerPanelAnchor: () => DebuggerPanelAnchor | undefined;
  onClose: () => void;
  onCopyAsTestCase: () => void;
}> = ({ getDebuggerPanelAnchor, onClose, onCopyAsTestCase }) => {
  const setSettingsOpen = useSetAtom(settingsModalOpenState);
  const setDebuggerPanelOpen = useSetAtom(debuggerPanelOpenState);
  const setDebuggerPanelAnchor = useSetAtom(debuggerPanelAnchorState);
  const [selectedExecutor, setSelectedExecutor] = useAtom(selectedExecutorState);
  const { loadRecording } = useLoadRecording();
  const setHelpModalOpen = useSetAtom(helpModalOpenState);
  const hostConfig = useExecutorSessionHostConfig();
  const executorOptions = getExecutorOptions({ hasInternalExecutorUrl: !!hostConfig?.internalExecutorUrl });

  const openDebuggerPanel = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setDebuggerPanelAnchor(getDebuggerPanelAnchor() ?? {
      bottom: rect.bottom,
      right: rect.right,
    });
    setDebuggerPanelOpen(true);
    onClose();
  };

  const doLoadRecording = () => {
    loadRecording();
    onClose();
  };

  const openSettings = () => {
    setSettingsOpen(true);
    onClose();
  };

  const openHelp = () => {
    setHelpModalOpen(true);
    onClose();
  };

  const remoteDebugger = useExecutorSessionState();
  const isActuallyRemoteDebugging = remoteDebugger.status !== 'idle' && !remoteDebugger.isInternalExecutor;

  const setExecutorMode = (value: string | boolean) => {
    if (value === 'browser' || value === 'nodejs') {
      setSelectedExecutor(value);
    }
  };

  return (
    <div css={moreMenuStyles}>
      <div className="menu-item executor">
        <span className="executor-title">Executor</span>
        {isActuallyRemoteDebugging ? (
          <span className="select-executor-remote">Remote</span>
        ) : (
          <SegmentedEditor
            value={selectedExecutor}
            onChange={setExecutorMode}
            isReadonly={false}
            isDisabled={false}
            label=""
            ariaLabel="Executor mode"
            name="executor-mode"
            options={executorOptions}
          />
        )}
      </div>
      <div className="menu-item menu-item-button remote-debugger" onClick={openDebuggerPanel}>
        <LinkIcon /> Remote Debugger
      </div>
      <div className="menu-item menu-item-button load-recording" onClick={doLoadRecording}>
        <ForwardCircleIcon /> Load Recording
      </div>
      <div className="menu-item menu-item-button copy-inputs-as-trivet-json" onClick={onCopyAsTestCase}>
        <CopyIcon /> Copy Inputs for Trivet
      </div>
      <div className="menu-item menu-item-button settings" onClick={openSettings}>
        <GearIcon /> Settings
      </div>
      <div className="menu-item menu-item-button help" onClick={openHelp}>
        <QuestionIcon /> Help
      </div>
    </div>
  );
};
