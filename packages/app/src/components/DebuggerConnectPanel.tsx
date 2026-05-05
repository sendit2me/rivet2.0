import Button from '@atlaskit/button';
import TextField from '@atlaskit/textfield';
import { css } from '@emotion/react';
import { type ChangeEvent, type FC, useEffect, useRef, useState } from 'react';
import { Field } from '@atlaskit/form';
import { useRemoteDebugger } from '../hooks/useRemoteDebugger';
import { debuggerPanelAnchorState, type DebuggerPanelAnchor, debuggerPanelOpenState } from '../state/ui';
import { debuggerDefaultUrlState } from '../state/settings';
import { useSetAtom, useAtom, useAtomValue } from 'jotai';
import {
  DEBUGGER_PANEL_WIDTH,
  DEBUGGER_PANEL_Z_INDEX,
  resolveDebuggerPanelPosition,
} from '../utils/debuggerPanelPosition.js';
import { popupMenuSurfaceStyles } from './PopupMenu.js';

export function useToggleRemoteDebugger() {
  const setDebuggerPanelOpen = useSetAtom(debuggerPanelOpenState);
  const setDebuggerPanelAnchor = useSetAtom(debuggerPanelAnchorState);
  const { sessionState: remoteDebugger, disconnect } = useRemoteDebugger();
  const isActuallyRemoteDebugging = remoteDebugger.status !== 'idle' && !remoteDebugger.isInternalExecutor;
  const isExternalDebuggerReconnecting = remoteDebugger.reconnecting && !remoteDebugger.isInternalExecutor;

  return () => {
    if (isActuallyRemoteDebugging || isExternalDebuggerReconnecting) {
      disconnect();
    } else {
      setDebuggerPanelAnchor(undefined);
      setDebuggerPanelOpen(true);
    }
  };
}

export const DebuggerPanelRenderer: FC = () => {
  const [debuggerPanelOpen, setDebuggerPanelOpen] = useAtom(debuggerPanelOpenState);
  const debuggerPanelAnchor = useAtomValue(debuggerPanelAnchorState);
  const setDebuggerPanelAnchor = useSetAtom(debuggerPanelAnchorState);

  const { connect } = useRemoteDebugger();

  function closeDebuggerPanel() {
    setDebuggerPanelOpen(false);
    setDebuggerPanelAnchor(undefined);
  }

  function handleConnectRemoteDebugger(url: string) {
    closeDebuggerPanel();
    connect(url);
  }

  if (!debuggerPanelOpen) {
    return null;
  }

  return (
    <DebuggerConnectPanel
      anchor={debuggerPanelAnchor}
      onConnect={handleConnectRemoteDebugger}
      onCancel={closeDebuggerPanel}
    />
  );
};

const styles = css`
  ${popupMenuSurfaceStyles};
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: fixed;
  padding: 4px 16px 16px 16px; // atlaskit padding on top
  width: ${DEBUGGER_PANEL_WIDTH}px;
  z-index: ${DEBUGGER_PANEL_Z_INDEX};

  .inputs {
  }

  .buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;

    .connect {
      background-color: var(--primary);
      color: var(--foreground-on-primary) !important;
    }
  }
`;

export type DebuggerConnectPanelProps = {
  anchor?: DebuggerPanelAnchor;
  onConnect?: (url: string) => void;
  onCancel?: () => void;
};

export const DebuggerConnectPanel: FC<DebuggerConnectPanelProps> = ({ anchor, onConnect, onCancel }) => {
  const [defaultConnectUrl, setDefaultConnectUrl] = useAtom(debuggerDefaultUrlState);
  const [connectUrl, setConnectUrl] = useState(defaultConnectUrl);

  const textField = useRef<HTMLInputElement>(null);

  function doConnect() {
    onConnect?.(connectUrl);
    setDefaultConnectUrl(connectUrl);
  }

  useEffect(() => {
    if (textField.current) {
      textField.current.focus();
      textField.current.setSelectionRange(0, textField.current.value.length);
    }
  }, []);

  return (
    <div
      css={styles}
      style={resolveDebuggerPanelPosition({
        anchor,
        viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
      })}
    >
      <div className="inputs">
        <Field label="Connection URL (leave blank for default localhost)" name="url">
          {() => (
            <TextField
              ref={textField}
              autoFocus
              value={connectUrl}
              placeholder="(Default)"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setConnectUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  doConnect();
                }
              }}
            />
          )}
        </Field>
      </div>

      <div className="buttons">
        <Button className="cancel" onClick={() => onCancel?.()}>
          Cancel
        </Button>
        <Button className="connect" onClick={doConnect}>
          Connect
        </Button>
      </div>
    </div>
  );
};
