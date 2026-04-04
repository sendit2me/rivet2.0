import { useEffect } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { mapValues } from 'lodash-es';
import { atom, useAtom, useAtomValue } from 'jotai';
import {
  promptDesignerAttachedChatNodeState,
  promptDesignerConfigurationState,
} from '../../state/promptDesigner.js';
import { nodesByIdState, nodesState } from '../../state/graph.js';
import { type InputsOrOutputsWithRefs, lastRunDataByNodeState } from '../../state/dataFlow.js';
import {
  type ChatNode,
  type DataValue,
  type GraphId,
  type Inputs,
  type NodeId,
  type NodeTestGroup,
  arrayizeDataValue,
  isArrayDataValue,
  type ScalarDataValue,
} from '@ironclad/rivet-core';
import { getChatNodeMessages } from '../../../../core/src/model/nodes/ChatNodeBase.js';
import { useClearCurrentGraphHistory } from '../../commands/Command.js';

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
      let inputData = nodeDataForAttachedNodeProcess.inputData;
      if (attachedNode.isSplitRun) {
        inputData = mapValues(inputData, (value) =>
          isArrayDataValue(value as DataValue) ? arrayizeDataValue(value as ScalarDataValue)[0] : value,
        ) as InputsOrOutputsWithRefs;
      }
      const { messages } = getChatNodeMessages(inputData as Inputs);
      setMessages({ messages });
    }

    setLastPromptDesignerAttachedNode(attachedNode.id);
  }, [
    attachedNode,
    attachedNodeId,
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
      tests: (attachedNode.tests ?? []).map((testGroup, testGroupIndex) => (testGroupIndex === index ? newTestGroup : testGroup)),
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
