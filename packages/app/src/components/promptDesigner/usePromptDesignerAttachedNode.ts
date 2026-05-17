import { useEffect } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { atom, useAtom, useAtomValue } from 'jotai';
import { promptDesignerAttachedChatNodeState, promptDesignerConfigurationState } from '../../state/promptDesigner.js';
import { nodesByIdState, nodesState } from '../../state/graph.js';
import { lastRunDataByNodeState } from '../../state/dataFlow.js';
import {
  type ChatNode,
  type GraphId,
  type Inputs,
  type NodeId,
  type NodeTestGroup,
  arrayizeDataValue,
  isArrayDataType,
  isFunctionDataType,
  type ScalarOrArrayDataValue,
  getChatNodeMessages,
} from '@valerypopoff/rivet2-core';
import { useClearCurrentGraphHistory } from '../../commands/Command.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { tryRestoreStoredPortMap } from '../../utils/executionDataReaders.js';
import { handleError } from '../../utils/errorHandling.js';

const lastPromptDesignerAttachedNodeState = atom<NodeId | undefined>(undefined);

export const usePromptDesignerAttachedNode = ({
  setMessages,
}: {
  setMessages: (state: { messages: ReturnType<typeof getChatNodeMessages>['messages'] }) => void;
}) => {
  const attachedNodeId = useAtomValue(promptDesignerAttachedChatNodeState);
  const nodesById = useAtomValue(nodesByIdState);
  const nodeOutput = useAtomValue(lastRunDataByNodeState);
  const [, setNodes] = useAtom(nodesState);
  const [config, setConfig] = useAtom(promptDesignerConfigurationState);
  const [lastPromptDesignerAttachedNode, setLastPromptDesignerAttachedNode] = useAtom(
    lastPromptDesignerAttachedNodeState,
  );
  const clearCurrentGraphHistory = useClearCurrentGraphHistory();
  const dataRefs = useDataRefs();

  const attachedNode = attachedNodeId?.nodeId ? (nodesById[attachedNodeId.nodeId] as ChatNode) : undefined;
  const testGroups = attachedNode?.tests ?? [];

  useEffect(() => {
    if (!attachedNode || lastPromptDesignerAttachedNode === attachedNode.id) {
      return;
    }

    const { data } = attachedNode;
    setConfig({
      data: {
        maxTokens: data.maxTokens,
        model: data.model,
        presencePenalty: data.presencePenalty,
        frequencyPenalty: data.frequencyPenalty,
        temperature: data.temperature,
        useTopP: data.useTopP,
        enableFunctionUse: data.enableFunctionUse,
        numberOfChoices: data.numberOfChoices,
        stop: data.stop,
        top_p: data.top_p,
        user: data.user,
      },
    });

    const nodeDataForAttachedNode = attachedNodeId ? nodeOutput[attachedNodeId.nodeId] : undefined;
    const nodeDataForAttachedNodeProcess = attachedNodeId
      ? nodeDataForAttachedNode?.find((run) => run.processId === attachedNodeId.processId)?.data
      : undefined;

    if (nodeDataForAttachedNodeProcess?.inputData) {
      try {
        let inputData =
          (tryRestoreStoredPortMap(nodeDataForAttachedNodeProcess.inputData, dataRefs) as Inputs | undefined) ?? {};
        if (attachedNode.isSplitRun) {
          inputData = Object.fromEntries(
            Object.entries(inputData).map(([portId, value]) => {
              if (!value || isFunctionDataType(value.type)) {
                return [portId, value];
              }

              if (isArrayDataType(value.type) && !Array.isArray(value.value)) {
                return [portId, value];
              }

              const arrayized = arrayizeDataValue(value as ScalarOrArrayDataValue);
              return [portId, arrayized[0] ?? value];
            }),
          ) as Inputs;
        }
        const { messages } = getChatNodeMessages(inputData);
        setMessages({ messages });
      } catch (error) {
        handleError(error, 'Failed to load prompt designer input data');
      }
    }

    setLastPromptDesignerAttachedNode(attachedNode.id);
  }, [
    attachedNode,
    attachedNodeId,
    dataRefs,
    lastPromptDesignerAttachedNode,
    nodeOutput,
    setConfig,
    setLastPromptDesignerAttachedNode,
    setMessages,
  ]);

  const attachedNodeChanged = (newNode: ChatNode) => {
    clearCurrentGraphHistory();
    setNodes((prev) => prev.map((node) => (node.id === newNode.id ? newNode : node)));
  };

  const testGroupChanged = (newTestGroup: NodeTestGroup, index: number) => {
    if (!attachedNode) {
      return;
    }

    attachedNodeChanged({
      ...attachedNode,
      tests: (attachedNode.tests ?? []).map((testGroup, testGroupIndex) =>
        testGroupIndex === index ? newTestGroup : testGroup,
      ),
    });
  };

  const addTestGroup = () => {
    if (!attachedNode) {
      return;
    }

    attachedNodeChanged({
      ...attachedNode,
      tests: [
        ...(attachedNode.tests ?? []),
        {
          id: nanoid() as NodeId,
          tests: [],
          evaluatorGraphId: '' as GraphId,
        },
      ],
    });
  };

  const deleteTestGroup = (index: number) => {
    if (!attachedNode) {
      return;
    }

    attachedNodeChanged({
      ...attachedNode,
      tests: (attachedNode.tests ?? []).filter((_, testGroupIndex) => testGroupIndex !== index),
    });
  };

  return {
    attachedNode,
    attachedNodeId,
    config,
    setConfig,
    testGroups,
    addTestGroup,
    deleteTestGroup,
    testGroupChanged,
  };
};
