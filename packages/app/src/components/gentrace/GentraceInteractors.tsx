import Popup from '@atlaskit/popup';
import { css } from '@emotion/react';
import { entries } from '../../utils/typeSafety';
import {
  type DataValue,
  ExecutionRecorder,
  runGentraceTests,
  runRemoteGentraceTests,
} from '@ironclad/rivet-core';
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

export const GentraceInteractors = () => {
  const project = useAtomValue(projectState);
  const graph = useAtomValue(graphState);
  const savedSettings = useAtomValue(settingsState);
  const projectContext = useAtomValue(projectContextState(project.metadata.id));
  const executorSessionRuntime = useExecutorSessionRuntime();
  const projectNodeRegistry = useProjectNodeRegistry();

  const remoteDebugger = useRemoteDebugger();
  const executorSession = remoteDebugger.sessionState;

  const gentracePipelineSettings = graph?.metadata?.attachedData?.gentracePipeline as GentracePipeline | undefined;
  const currentGentracePipelineSlug = gentracePipelineSettings?.slug;

  const [gentracePipelineSelectorOpen, toggleGentracePipelineSelectorOpen] = useToggle(false);

  const onRun = async () => {
    const settings = await fillMissingSettingsFromEnvironmentVariables(
      savedSettings,
      projectNodeRegistry.getPlugins(),
    );

    if (!graph.metadata?.id) {
      return;
    }

    if (!currentGentracePipelineSlug) {
      toast.warn('No Gentrace pipeline added.');
      return;
    }

    toast.info(`Running Gentrace pipeline ${currentGentracePipelineSlug} tests ...`);
    let testResultId: string | null = null;

    try {
      if (executorSession.status === 'ready' && executorSession.socket) {
        const testResponse = await runRemoteGentraceTests(
          currentGentracePipelineSlug,
          settings,
          project,
          graph,
          async (inputs) => {
            if (executorSession.remoteUploadAllowed) {
              remoteDebugger.send('set-dynamic-data', {
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
                ),
              });
            }

            const recorder = new ExecutionRecorder();

            const recorderPromise = recorder.recordSocket(executorSession.socket!);

            const contextValues = entries(projectContext).reduce(
              (acc, [key, value]) => ({
                ...acc,
                [key]: value.value,
              }),
              {} as Record<string, DataValue>,
            );
            const requestId = executorSessionRuntime.createRemoteExecutionRequest();

            remoteDebugger.send('run', { requestId, graphId: graph.metadata!.id!, inputs, contextValues });

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
                font-size: 12px;
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
