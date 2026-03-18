import { produce } from 'immer';
import { useSetAtom } from 'jotai';
import { type ProcessEvents } from '@ironclad/rivet-core';
import { type ExecutionDataFlowApi } from './useExecutionDataFlow';
import { lastRunDataByNodeState } from '../state/dataFlow';
import { cloneNodeInputOrOutputDataForHistory, sanitizeInputsOrOutputs } from '../utils/executionDataTransforms';
import { useDataRefs } from '../providers/ProvidersContext';

export type NodeExecutionEventsApi = {
  onNodeError: (data: ProcessEvents['nodeError']) => void;
  onNodeExcluded: (data: ProcessEvents['nodeExcluded']) => void;
  onNodeFinish: (data: ProcessEvents['nodeFinish']) => void;
  onNodeOutputsCleared: (data: ProcessEvents['nodeOutputsCleared']) => void;
  onNodeStart: (data: ProcessEvents['nodeStart']) => void;
  onPartialOutput: (data: ProcessEvents['partialOutput']) => void;
};

export function useNodeExecutionEvents({
  setDataForNode,
  setSelectedNodePageLatest,
}: Pick<ExecutionDataFlowApi, 'setDataForNode' | 'setSelectedNodePageLatest'>): NodeExecutionEventsApi {
  const dataRefs = useDataRefs();
  const setLastRunData = useSetAtom(lastRunDataByNodeState);

  const onNodeStart = ({ node, inputs, processId, execution }: ProcessEvents['nodeStart']) => {
    setDataForNode(node.id, processId, execution, {
      inputData: sanitizeInputsOrOutputs(inputs),
      status: { type: 'running' },
      startedAt: Date.now(),
    });
    setSelectedNodePageLatest(node.id, execution);
  };

  const onNodeFinish = ({ node, outputs, processId, execution }: ProcessEvents['nodeFinish']) => {
    setDataForNode(node.id, processId, execution, {
      outputData: sanitizeInputsOrOutputs(outputs),
      status: { type: 'ok' },
      finishedAt: Date.now(),
    });
    setSelectedNodePageLatest(node.id, execution);
  };

  const onNodeExcluded = ({ node, processId, inputs, outputs, reason, execution }: ProcessEvents['nodeExcluded']) => {
    setDataForNode(node.id, processId, execution, {
      inputData: sanitizeInputsOrOutputs(inputs),
      outputData: sanitizeInputsOrOutputs(outputs),
      status: { type: 'notRan', reason },
      startedAt: Date.now(),
      finishedAt: Date.now(),
    });
    setSelectedNodePageLatest(node.id, execution);
  };

  const onNodeError = ({ node, error, processId, execution }: ProcessEvents['nodeError']) => {
    setDataForNode(node.id, processId, execution, {
      status: { type: 'error', error: typeof error === 'string' ? error : error.toString() },
      finishedAt: Date.now(),
    });
    setSelectedNodePageLatest(node.id, execution);
  };

  const onPartialOutput = ({ node, outputs, index, processId, execution }: ProcessEvents['partialOutput']) => {
    const sanitizedOutputs = sanitizeInputsOrOutputs(outputs);

    if (node.isSplitRun) {
      setLastRunData((prev) =>
        produce(prev, (draft) => {
          if (!draft[node.id]) {
            draft[node.id] = [];
          }

          const existingProcess = draft[node.id]!.find((process) => process.processId === processId);
          if (existingProcess) {
            existingProcess.graphId = execution.graphId;
            existingProcess.graphRunId = execution.graphRunId;
            existingProcess.rootRunId = execution.rootRunId;
            existingProcess.data.splitOutputData = {
              ...existingProcess.data.splitOutputData,
              [index]: cloneNodeInputOrOutputDataForHistory(sanitizedOutputs, dataRefs)!,
            };
          } else {
            draft[node.id]!.push({
              processId,
              graphId: execution.graphId,
              graphRunId: execution.graphRunId,
              rootRunId: execution.rootRunId,
              data: {
                splitOutputData: {
                  [index]: cloneNodeInputOrOutputDataForHistory(sanitizedOutputs, dataRefs)!,
                },
              },
            });
          }
        }),
      );
    } else {
      setDataForNode(node.id, processId, execution, {
        outputData: sanitizedOutputs,
      });
    }

    setSelectedNodePageLatest(node.id, execution);
  };

  const onNodeOutputsCleared = ({ node, processId, execution }: ProcessEvents['nodeOutputsCleared']) => {
    setLastRunData((prev) =>
      produce(prev, (draft) => {
        if (processId) {
          const index = draft[node.id]?.findIndex((process) => process.processId === processId);
          if (index !== undefined && index !== -1) {
            draft[node.id]!.splice(index, 1);
          }
        } else {
          delete draft[node.id];
        }
      }),
    );

    setSelectedNodePageLatest(node.id, execution);
  };

  return {
    onNodeError,
    onNodeExcluded,
    onNodeFinish,
    onNodeOutputsCleared,
    onNodeStart,
    onPartialOutput,
  };
}
