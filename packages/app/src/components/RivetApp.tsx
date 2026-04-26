import { useWindowsHotkeysFix } from '../hooks/useWindowsHotkeysFix';
import { GraphBuilder } from './GraphBuilder.js';
import { OverlayTabs } from './OverlayTabs.js';
import { type FC, useEffect, useMemo } from 'react';
import { type GraphId } from '@ironclad/rivet-core';
import { css } from '@emotion/react';
import { SettingsModal } from './SettingsModal.js';
import { setGlobalTheme } from '@atlaskit/tokens';
import { LeftSidebar } from './LeftSidebar.js';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { PromptDesignerRenderer } from './PromptDesigner.js';
import { useGraphExecutor } from '../hooks/useGraphExecutor.js';
import { useMenuCommands } from '../hooks/useMenuCommands.js';
import { TrivetRenderer } from './trivet/Trivet.js';
import { ActionBar } from './ActionBar';
import { DebuggerPanelRenderer } from './DebuggerConnectPanel';
import { ChatViewerRenderer } from './ChatViewer';
import { useAtomValue } from 'jotai';
import { defaultExecutorState, themeState } from '../state/settings';
import clsx from 'clsx';
import { useLoadStaticData } from '../hooks/useLoadStaticData';
import { DataStudioRenderer } from './dataStudio/DataStudio';
import { StatusBar } from './StatusBar';
import { PluginsOverlayRenderer } from './PluginsOverlay';
import { useCheckForUpdate } from '../hooks/useCheckForUpdate';
import useAsyncEffect from 'use-async-effect';
import { UpdateModalRenderer } from './UpdateModal';
import { useMonitorUpdateStatus } from '../hooks/useMonitorUpdateStatus';
import { ProjectSelector } from './ProjectSelector';
import { NewProjectModalRenderer } from './NewProjectModal';
import { useWindowTitle } from '../hooks/useWindowTitle';
import { CommunityOverlayRenderer } from './community/CommunityOverlay';
import { HelpModal } from './HelpModal';
import { openedProjectsSortedIdsState } from '../state/savedGraphs';
import { NoProject } from './NoProject';
import { AppErrorBoundary } from './AppErrorBoundary';
import { wrapAsync } from '../utils/errorHandling';
import { useExecutorSession } from '../hooks/useExecutorSession';
import { useRestorePersistedWorkspace } from '../hooks/useRestorePersistedWorkspace.js';
import { DeleteGraphInputConfirmModalRenderer } from './DeleteGraphInputConfirmModal';
import { uiFontSizeState } from '../state/ui.js';
import { getUiFontSizeCssVariables } from '../utils/uiFontSize.js';

const styles = css`
  overflow: hidden;
  font-size: var(--ui-font-size-base);
`;

setGlobalTheme({
  colorMode: 'dark',
});

export const RivetApp: FC = () => {
  const selectedExecutor = useAtomValue(defaultExecutorState);
  useExecutorSession(selectedExecutor);
  const { tryRunGraph, tryRunTests, tryAbortGraph, tryPauseGraph, tryResumeGraph } = useGraphExecutor();
  const theme = useAtomValue(themeState);
  const uiFontSize = useAtomValue(uiFontSizeState);
  const openedProjectIds = useAtomValue(openedProjectsSortedIdsState);
  const uiFontSizeCssVariables = useMemo(() => getUiFontSizeCssVariables(uiFontSize), [uiFontSize]);

  const noProjectOpen = openedProjectIds.length === 0;

  useLoadStaticData();
  useRestorePersistedWorkspace();

  const runGraph = wrapAsync(tryRunGraph, 'Run graph');
  const runTests = wrapAsync(tryRunTests, 'Run tests');
  const runGraphFromSidebar = wrapAsync(async (graphId: GraphId) => tryRunGraph({ graphId }), 'Run graph from sidebar');

  useMenuCommands({
    onRunGraph: runGraph,
  });

  useWindowsHotkeysFix();

  const checkForUpdate = useCheckForUpdate();

  useAsyncEffect(async () => {
    await checkForUpdate();
  }, []);

  useMonitorUpdateStatus();
  useWindowTitle();

  useEffect(() => {
    const rootStyle = document.documentElement.style;

    for (const [name, value] of Object.entries(uiFontSizeCssVariables)) {
      rootStyle.setProperty(name, value);
    }

    return () => {
      for (const name of Object.keys(uiFontSizeCssVariables)) {
        rootStyle.removeProperty(name);
      }
    };
  }, [uiFontSizeCssVariables]);

  return (
    <div className={clsx('app', theme ? `theme-${theme}` : 'theme-default')} css={styles} style={uiFontSizeCssVariables}>
      {noProjectOpen ? (
        <>
          <NoProject />
          <NewProjectModalRenderer />
          <AppErrorBoundary context="Settings Modal" fallback={<div>Failed to render Settings</div>}>
            <SettingsModal />
          </AppErrorBoundary>
        </>
      ) : (
        <>
          <ProjectSelector />
          <OverlayTabs />
          <ActionBar
            onRunGraph={runGraph}
            onRunTests={runTests}
            onAbortGraph={tryAbortGraph}
            onPauseGraph={tryPauseGraph}
            onResumeGraph={tryResumeGraph}
          />
          <StatusBar />
          <DebuggerPanelRenderer />
          <LeftSidebar onRunGraph={runGraphFromSidebar} />
          <GraphBuilder />
          <AppErrorBoundary context="Settings Modal" fallback={<div>Failed to render Settings</div>}>
            <SettingsModal />
          </AppErrorBoundary>
          <PromptDesignerRenderer />
          <TrivetRenderer tryRunTests={tryRunTests} />
          <ChatViewerRenderer />
          <DataStudioRenderer />
          <PluginsOverlayRenderer />
          <UpdateModalRenderer />
          <NewProjectModalRenderer />
          <DeleteGraphInputConfirmModalRenderer />
          <CommunityOverlayRenderer />
        </>
      )}
      <HelpModal />
      <ToastContainer enableMultiContainer position="bottom-right" hideProgressBar newestOnTop />
      <ToastContainer
        enableMultiContainer
        containerId="wide"
        style={{ width: 600 }}
        position="bottom-right"
        hideProgressBar
        newestOnTop
      />
    </div>
  );
};
