import { useEffect, useRef } from 'react';
import { useSaveProject } from './useSaveProject.js';
import { match } from 'ts-pattern';
import { useLoadProjectWithFileBrowser } from './useLoadProjectWithFileBrowser.js';
import { settingsModalOpenState } from '../components/SettingsModal.js';
import { graphState } from '../state/graph.js';
import { useLoadRecording } from './useLoadRecording.js';
import { helpModalOpenState, newProjectModalOpenState } from '../state/ui';
import { useToggleRemoteDebugger } from '../components/DebuggerConnectPanel';
import { graphRunHistoryByViewState, lastRunDataByNodeState, selectedGraphRunByViewState } from '../state/dataFlow';
import { useImportGraph } from './useImportGraph';
import { useAtom, useSetAtom } from 'jotai';
import { useIOProvider } from '../providers/ProvidersContext.js';
import { type NativeWindowHandle } from '../utils/platform/core.js';
import { getCurrentWindowHandle } from '../utils/platform/window.js';

export type MenuIds =
  | 'settings'
  | 'quit'
  | 'new_project'
  | 'open_project'
  | 'save_project'
  | 'save_project_as'
  | 'export_graph'
  | 'import_graph'
  | 'run'
  | 'load_recording'
  | 'remote_debugger'
  | 'toggle_devtools'
  | 'clear_outputs'
  | 'get_help';

const handlerState: {
  handler: (e: { payload: MenuIds }) => void;
} = { handler: () => {} };

export function useRunMenuCommand() {
  return (command: MenuIds) => {
    const { handler } = handlerState;

    handler({ payload: command });
  };
}

export function useMenuCommands(
  options: {
    onRunGraph?: () => void;
  } = {},
) {
  const { onRunGraph } = options;
  const ioProvider = useIOProvider();
  const [graphData] = useAtom(graphState);
  const { saveProject, saveProjectAs } = useSaveProject();
  const setNewProjectModalOpen = useSetAtom(newProjectModalOpenState);
  const loadProject = useLoadProjectWithFileBrowser();
  const setSettingsOpen = useSetAtom(settingsModalOpenState);
  const { loadRecording } = useLoadRecording();
  const toggleRemoteDebugger = useToggleRemoteDebugger();
  const setLastRunData = useSetAtom(lastRunDataByNodeState);
  const setGraphRunHistoryByView = useSetAtom(graphRunHistoryByViewState);
  const setSelectedGraphRunByView = useSetAtom(selectedGraphRunByViewState);
  const importGraph = useImportGraph();
  const setHelpModalOpen = useSetAtom(helpModalOpenState);
  const mainWindowRef = useRef<NativeWindowHandle | null>(null);

  useEffect(() => {
    const handler: (e: { payload: MenuIds }) => void = ({ payload }) => {
      match(payload as MenuIds)
        .with('settings', () => {
          setSettingsOpen(true);
        })
        .with('quit', () => {
          void mainWindowRef.current?.close();
        })
        .with('new_project', () => {
          setNewProjectModalOpen(true);
        })
        .with('open_project', () => {
          loadProject();
        })
        .with('save_project', () => {
          saveProject();
        })
        .with('save_project_as', () => {
          saveProjectAs();
        })
        .with('export_graph', () => {
          ioProvider.saveGraphData(graphData);
        })
        .with('import_graph', () => {
          importGraph();
        })
        .with('run', () => {
          onRunGraph?.();
        })
        .with('load_recording', () => {
          loadRecording();
        })
        .with('remote_debugger', () => {
          toggleRemoteDebugger();
        })
        .with('toggle_devtools', () => {})
        .with('clear_outputs', () => {
          setLastRunData({});
          setGraphRunHistoryByView({});
          setSelectedGraphRunByView({});
        })
        .with('get_help', () => {
          setHelpModalOpen(true);
        })
        .exhaustive();
    };

    handlerState.handler = handler;

    return () => {
      if (handlerState.handler === handler) {
        handlerState.handler = () => {};
      }
    };
  }, [
    saveProject,
    saveProjectAs,
    loadProject,
    setSettingsOpen,
    graphData,
    onRunGraph,
    ioProvider,
    loadRecording,
    importGraph,
    toggleRemoteDebugger,
    setLastRunData,
    setGraphRunHistoryByView,
    setSelectedGraphRunByView,
    setNewProjectModalOpen,
    setHelpModalOpen,
  ]);

  useEffect(() => {
    let unlistenMenu: (() => void | Promise<void>) | undefined;

    void getCurrentWindowHandle()
      .then(async (windowHandle) => {
        mainWindowRef.current = windowHandle;
        if (windowHandle?.onMenuClicked) {
          unlistenMenu = await windowHandle.onMenuClicked((e) => {
            handlerState.handler(e as { payload: MenuIds });
          });
        }
      })
      .catch((err) => {
        console.warn(`Error getting main window, likely not running in tauri: ${err}`);
      });

    return () => {
      mainWindowRef.current = null;
      void unlistenMenu?.();
    };
  }, []);
}
