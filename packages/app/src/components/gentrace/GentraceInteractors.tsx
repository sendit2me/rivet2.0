import Popup from '@atlaskit/popup';
import { css } from '@emotion/react';
import { ExecutionRecorder, runGentraceTests, runRemoteGentraceTests } from '@valerypopoff/rivet2-core';
import { useToggle } from 'ahooks';
import clsx from 'clsx';
import EditPen from 'majesticons/line/edit-pen-2-line.svg?react';
import TestTube from 'majesticons/line/test-tube-filled-line.svg?react';

import GentraceImage from '../../assets/vendor_logos/gentrace.svg?react';
import { toast } from 'react-toastify';
import { useRemoteDebugger } from '../../hooks/useRemoteDebugger';
import { useExecutorSessionRuntime } from '../../providers/ExecutorSessionContext';
import { useProjectNodeRegistry } from '../../hooks/useProjectNodeRegistry';
import { TauriNativeApi } from '../../model/native/TauriNativeApi';
import { graphState } from '../../state/graph';
import { projectContextState, projectState } from '../../state/savedGraphs.js';
import { settingsState } from '../../state/settings';
import { fillMissingSettingsFromEnvironmentVariables } from '../../utils/tauri';
import GentracePipelinePicker, { type GentracePipeline } from './GentracePipelinePicker';
import { useAtomValue } from 'jotai';
import { wrapAsync } from '../../utils/errorHandling';
import { useEnvironmentProvider } from '../../providers/ProvidersContext.js';
import { getProjectContextValues } from '../../utils/projectContextValues.js';
import { PopupMenuContainer } from '../PopupMenu.js';

export const GentraceInteractors = () => {
  const project = useAtomValue(projectState);
  const graph = useAtomValue(graphState);
  const savedSettings = useAtomValue(settingsState);
  const projectContext = useAtomValue(projectContextState(project.metadata.id));
  const executorSessionRuntime = useExecutorSessionRuntime();
  const environmentProvider = useEnvironmentProvider();
  const projectNodeRegistry = useProjectNodeRegistry();

  const remoteDebugger = useRemoteDebugger();

  const gentracePipelineSettings = graph?.metadata?.attachedData?.gentracePipeline as GentracePipeline | undefined;
  const currentGentracePipelineSlug = gentracePipelineSettings?.slug;

  const [gentracePipelineSelectorOpen, toggleGentracePipelineSelectorOpen] = useToggle(false);

  const onRun = async () => {
    const settings = await fillMissingSettingsFromEnvironmentVariables(
      savedSettings,
      projectNodeRegistry.getPlugins(),
      {
        environmentProvider,
      },
    );

    if (!graph.metadata?.id) {
      return;
    }

    if (!currentGentracePipelineSlug) {
      toast.warn('No Gentrace pipeline added.');
      return;
    }

    const contextValues = getProjectContextValues(projectContext);

    toast.info(`Running Gentrace pipeline ${currentGentracePipelineSlug} tests ...`);
    let testResultId: string | null = null;

    try {
      if (executorSessionRuntime.getRuntimeState().capabilities.canRecordSocket) {
        const testResponse = await runRemoteGentraceTests(
          currentGentracePipelineSlug,
          settings,
          project,
          graph,
          async (inputs) => {
            const sessionState = executorSessionRuntime.getRuntimeState();
            if (!sessionState.capabilities.canSendRun) {
              throw new Error(
                `Remote executor cannot accept a Gentrace graph run right now (status: ${
                  sessionState.status
                }, target: ${sessionState.target?.type ?? 'none'}).`,
              );
            }

            if (sessionState.capabilities.canUploadProject) {
              const projectUploadSent = remoteDebugger.send('set-dynamic-data', {
                project: {
                  ...project,
                  graphs: {
                    ...project.graphs,
                    [graph.metadata!.id!]: graph,
                  },
                },
                settings: await fillMissingSettingsFromEnvironmentVariables(
                  savedSettings,
                  projectNodeRegistry.getPlugins(),
                  {
                    environmentProvider,
                  },
                ),
              });
              if (!projectUploadSent) {
                throw new Error('Remote executor disconnected before the Gentrace project upload could be sent.');
              }
            }

            const recorder = new ExecutionRecorder();

            const recorderPromise = executorSessionRuntime.recordSocketEvents((socket) => recorder.recordSocket(socket));
            if (!recorderPromise) {
              throw new Error('Remote executor is not ready to record Gentrace execution.');
            }

            const requestId = executorSessionRuntime.createRemoteExecutionRequest();

            const runSent = remoteDebugger.send('run', { requestId, graphId: graph.metadata!.id!, inputs, contextValues });
            if (!runSent) {
              void recorderPromise.catch(() => {});
              throw new Error('Remote executor disconnected before the Gentrace graph run could be sent.');
            }

            await recorderPromise;

            return recorder.getRecording();
          },
        );
        testResultId = testResponse.resultId;
      } else {
        const testResponse = await runGentraceTests(
          currentGentracePipelineSlug,
          settings,
          project,
          graph,
          new TauriNativeApi(),
          contextValues,
        );
        testResultId = testResponse.resultId;
      }
    } catch (e: any) {
      const serverResult = e?.response?.data?.message ?? e?.message;
      toast.error(
        <div>
          <div
            css={css`
              margin-bottom: 10px;
            `}
          >
            Error running Gentrace pipeline {currentGentracePipelineSlug} tests:
          </div>

          <div>
            <code
              css={css`
                font-size: var(--ui-font-size-sm);
              `}
            >
              {serverResult}
            </code>
          </div>
        </div>,
        {
          autoClose: false,
          closeOnClick: false,
          draggable: false,
        },
      );
      return;
    }

    const url = `http://gentrace.ai/pipeline/${gentracePipelineSettings.id}/results/${testResultId}?size=compact`;

    toast.info(
      <div>
        <div>Gentrace pipeline {currentGentracePipelineSlug} tests finished.</div>
        <div>
          View results here{' '}
          <a href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
        </div>
      </div>,
      {
        autoClose: false,
        closeOnClick: false,
        draggable: false,
      },
    );
  };

  return (
    <>
      <Popup
        isOpen={gentracePipelineSelectorOpen}
        onClose={toggleGentracePipelineSelectorOpen.setLeft}
        popupComponent={PopupMenuContainer}
        content={() => <GentracePipelinePicker onClose={toggleGentracePipelineSelectorOpen.setLeft} />}
        placement="bottom-end"
        trigger={(triggerProps) => (
          <div className={clsx('run-gentrace-button')}>
            <button
              {...triggerProps}
              onMouseDown={(e) => {
                if (e.button === 0) {
                  toggleGentracePipelineSelectorOpen.toggle();
                  e.preventDefault();
                }
              }}
              css={css`
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: center;
              `}
            >
              <div>
                <GentraceImage height="17px" width="17px" />
              </div>
              {currentGentracePipelineSlug ? 'Change' : 'Add'} Gentrace Pipeline
              <EditPen />
            </button>
          </div>
        )}
      />

      <div className={clsx('run-gentrace-button')}>
        <button onClick={wrapAsync(onRun, 'Run Gentrace tests')} css={``}>
          <div>
            <GentraceImage height="17px" width="17px" />
          </div>
          Run Gentrace Tests
          <TestTube />
        </button>
      </div>
    </>
  );
};
