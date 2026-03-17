import { useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { type NodeTestGroup } from '@ironclad/rivet-core';
import {
  promptDesignerAttachedChatNodeState,
  promptDesignerResponseState,
  promptDesignerTestGroupResultsByNodeIdState,
} from '../../state/promptDesigner.js';
import { useDatasetProvider } from '../../providers/ProvidersContext.js';
import { useGetAdHocInternalProcessContext } from '../../hooks/useGetAdHocInternalProcessContext.js';
import { runAdHocChat, useRunPromptDesignerTestGroupSampleCount } from './PromptDesignerTestRunner.js';
import { handleError } from '../../utils/errorHandling.js';

export const usePromptDesignerRunActions = ({
  configData,
  messages,
  samples,
}: {
  configData: Parameters<typeof runAdHocChat>[1];
  messages: Parameters<typeof runAdHocChat>[0];
  samples: number;
}) => {
  const datasetProvider = useDatasetProvider();
  const attachedNodeId = useAtomValue(promptDesignerAttachedChatNodeState);
  const [response, setResponse] = useAtom(promptDesignerResponseState);
  const [testGroupResultsByNodeId, setTestGroupResultsByNodeId] = useAtom(promptDesignerTestGroupResultsByNodeIdState);
  const runTestGroup = useRunPromptDesignerTestGroupSampleCount(datasetProvider);
  const getAdHocInternalProcessContext = useGetAdHocInternalProcessContext();
  const abortController = useRef<AbortController>();
  const [inProgress, setInProgress] = useState(false);

  const resultsForAttachedNode = testGroupResultsByNodeId[attachedNodeId?.nodeId ?? ''];

  const clearAttachedNodeResults = () => {
    if (!attachedNodeId?.nodeId) {
      return;
    }

    setTestGroupResultsByNodeId((state) => ({ ...state, [attachedNodeId.nodeId]: [] }));
  };

  const tryRunSingle = async () => {
    try {
      abortController.current?.abort();
      abortController.current = new AbortController();
      setInProgress(true);
      setResponse({});
      clearAttachedNodeResults();

      const nextResponse = await runAdHocChat(
        messages,
        configData,
        await getAdHocInternalProcessContext({
          onPartialResult: (partialResult) => {
            setResponse({ response: partialResult });
          },
          signal: abortController.current.signal,
        }),
      );

      setResponse({ response: nextResponse });
    } catch (error) {
      handleError(error, 'Failed to run prompt designer chat', {
        metadata: {
          attachedNodeId: attachedNodeId?.nodeId,
          messageCount: messages.length,
        },
      });
    } finally {
      abortController.current = undefined;
      setInProgress(false);
    }
  };

  const handleStartTestGroup = async (testGroup: NodeTestGroup) => {
    if (!attachedNodeId?.nodeId) {
      return;
    }

    abortController.current?.abort();
    abortController.current = new AbortController();
    setInProgress(true);
    setResponse({});
    clearAttachedNodeResults();

    try {
      await runTestGroup(
        testGroup,
        messages,
        samples,
        {
          onPartialResults: (partialResults) => {
            setTestGroupResultsByNodeId((state) => ({
              ...state,
              [attachedNodeId.nodeId]: partialResults,
            }));
          },
        },
        configData,
      );
    } catch (error) {
      handleError(error, 'Failed to run prompt designer test group', {
        metadata: {
          attachedNodeId: attachedNodeId.nodeId,
          sampleCount: samples,
          testCaseCount: testGroup.tests.length,
        },
      });
    } finally {
      abortController.current = undefined;
      setInProgress(false);
    }
  };

  const handleCancel = () => {
    abortController.current?.abort();
    abortController.current = undefined;
    setInProgress(false);
  };

  return {
    handleCancel,
    handleStartTestGroup,
    inProgress,
    response,
    resultsForAttachedNode,
    tryRunSingle,
  };
};
