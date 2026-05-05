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
import { PopupMenu, PopupMenuItem } from './PopupMenu.js';
import BugIcon from 'majesticons/line/bug-2-line.svg?react';
import GearIcon from 'majesticons/line/settings-cog-line.svg?react';
import QuestionIcon from 'majesticons/line/question-circle-line.svg?react';
import { useSetAtom, useAtom } from 'jotai';

const moreMenuStyles = css`
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
      margin-left: -0.2em;
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

  const openDebuggerPanel = (event: MouseEvent<HTMLButtonElement>) => {
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
    <PopupMenu extraCss={moreMenuStyles}>
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
      <PopupMenuItem icon={BugIcon} onClick={openDebuggerPanel}>
        Remote Debugger
      </PopupMenuItem>
      <PopupMenuItem onClick={doLoadRecording}>
        Load Recording
      </PopupMenuItem>
      <PopupMenuItem onClick={onCopyAsTestCase}>
        Copy Inputs for Trivet
      </PopupMenuItem>
      <PopupMenuItem icon={GearIcon} separatorBefore onClick={openSettings}>
        Settings
      </PopupMenuItem>
      <PopupMenuItem icon={QuestionIcon} onClick={openHelp}>
        Help
      </PopupMenuItem>
    </PopupMenu>
  );
};
