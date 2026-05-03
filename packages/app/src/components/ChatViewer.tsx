import { type FC, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAtomValue, useAtom } from 'jotai';
import { orderBy } from 'lodash-es';
import { overlayOpenState } from '../state/ui';
import { css } from '@emotion/react';
import clsx from 'clsx';
import { type NodeId } from '@valerypopoff/rivet2-core';
import {
  lastRunDataByNodeState,
  graphRunningState,
  type NodeRunDataWithRefs,
} from '../state/dataFlow';
import { projectState } from '../state/savedGraphs';
import { graphState } from '../state/graph';
import { ErrorBoundary } from 'react-error-boundary';
import TextField from '@atlaskit/textfield';
import { useGoToNode } from '../hooks/useGoToNode';
import MaximizeIcon from 'majesticons/line/maximize-line.svg?react';
import MinimizeIcon from 'majesticons/line/minimize-line.svg?react';
import { useToggle } from 'ahooks';
import { FixedSizeList } from 'react-window';
import { RenderDataValue } from './RenderDataValue.js';
import { useDataRefs } from '../providers/ProvidersContext.js';
import {
  getChatViewerChatNodes,
  getChatViewerErrorValue,
  getChatViewerGraphEntries,
  getChatViewerNodeGraphNameMap,
  getChatViewerNodeProcesses,
  getChatViewerProcessKey,
  getChatViewerProcessRows,
  getChatViewerPromptValue,
  getChatViewerResponseValue,
} from '../utils/chatViewerData.js';

export const ChatViewerRenderer: FC = () => {
  const [openOverlay, setOpenOverlay] = useAtom(overlayOpenState);

  if (openOverlay !== 'chatViewer') return null;

  return (
    <ErrorBoundary fallback={null}>
      <ChatViewer onClose={() => setOpenOverlay(undefined)} />
    </ErrorBoundary>
  );
};

const styles = css`
  position: fixed;
  top: var(--project-selector-height);
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--grey-darker);
  z-index: 150;
  overflow: auto;

  .controls-filters {
    padding: 12px 16px;
    border-radius: 10px;
    corner-shape: squircle;
    background-color: var(--grey-darkish);
    display: flex;
    align-items: center;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
    margin: 56px 48px 32px 48px;
  }

  .chats {
    padding: 0 48px;
    display: flex;
    flex-direction: column;
    column-gap: 32px;
    row-gap: 16px;

    section {
      display: flex;
      flex-wrap: wrap;

      column-gap: 32px;
      row-gap: 16px;
    }

    section.completed-chats {
    }

    section.in-progress-chats {
      min-height: 550px;
    }
  }

  .chat-bubble {
    width: 500px;

    border: 1px solid var(--primary);
    border-radius: 20px;
    corner-shape: squircle;
    box-shadow: 0 0 10px var(--shadow-primary-bright);

    &.complete,
    &.error {
      border: 0;
      box-shadow: none;
      width: 100%;

      &:not(.expanded) .prompt {
        max-height: 0;
        padding: 0;
      }

      &:not(.expanded) .response {
        height: 100px;
        overflow: hidden;
      }

      &:not(.expanded) .line {
        display: none;
      }
    }

    &.error {
      border: 1px solid var(--error);
      box-shadow: none;
    }

    &.complete header {
      border-bottom: 1px solid var(--success);
    }

    header {
      padding: 0 15px;
      background-color: var(--grey-darkish);
      border-radius: 20px 20px 0 0;
      corner-shape: squircle;
      border-bottom: 1px solid var(--grey-light);
      display: flex;
      align-items: center;
      justify-content: space-between;

      .graph-name,
      .node-title {
        color: var(--primary-text);
      }

      .go-to-node {
        background-color: transparent;
        color: var(--foreground);
        border: 0;
        cursor: pointer;
        display: inline-block;
        height: 32px;
        padding: 0 15px;

        &:hover {
          color: var(--primary-text);
        }
      }

      .buttons {
        display: flex;
        align-items: center;
        column-gap: 8px;

        .expand {
          border: 0;
          margin: 0;
          padding: 0;
          width: 32px;
          height: 32px;
          background-color: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;

          &:hover {
            background-color: var(--grey-dark);
          }
        }
      }
    }

    .line {
      border-top: 1px solid var(--grey-light);
    }

    .prompt {
      padding: 15px;
      white-space: pre-wrap;
      max-height: 100px;
      overflow: auto;
      color: var(--foreground-muted);
    }

    .response {
      padding: 15px;
      white-space: pre-wrap;
      height: 400px;
      overflow: auto;
    }
  }
`;

export const ChatViewer: FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const project = useAtomValue(projectState);
  const currentGraph = useAtomValue(graphState);
  const allLastRunData = useAtomValue(lastRunDataByNodeState);
  const [graphFilter, setGraphFilter] = useState('');
  const goToNode = useGoToNode();
  const graphRunning = useAtomValue(graphRunningState);

  const graphEntries = useMemo(
    () => getChatViewerGraphEntries(project.graphs, currentGraph),
    [currentGraph, project.graphs],
  );

  const nodesToGraphNameMap = useMemo(() => {
    return getChatViewerNodeGraphNameMap(graphEntries);
  }, [graphEntries]);

  const chatNodes = useMemo(() => {
    const nodes = getChatViewerChatNodes(graphEntries);
    if (graphFilter === '') {
      return nodes;
    }

    return nodes.filter((node) =>
      (nodesToGraphNameMap[node.id] ?? '').toLowerCase().includes(graphFilter.toLowerCase()),
    );
  }, [graphEntries, graphFilter, nodesToGraphNameMap]);

  const processes = useMemo(() => {
    return getChatViewerNodeProcesses(chatNodes, allLastRunData);
  }, [chatNodes, allLastRunData]);

  const processesWithIndex = useMemo(() => {
    return getChatViewerProcessRows(processes);
  }, [processes]);

  const [runningProcesses, completedProcesses] = useMemo(() => {
    return [
      orderBy(
        processesWithIndex.filter(({ process }) => process.data.status?.type === 'running'),
        ({ process }) => process?.data.startedAt ?? 0,
        'desc',
      ),
      orderBy(
        processesWithIndex.filter(({ process }) => process.data.status?.type !== 'running'),
        ({ process }) => process?.data.finishedAt ?? 0,
        'desc',
      ),
    ];
  }, [processesWithIndex]);

  const doGoToNode = (nodeId: NodeId) => {
    goToNode(nodeId);
    onClose();
  };

  const CompletedRow = ({ index, style }: { index: number; style: any }) => {
    const { node, process, index: processIndex } = completedProcesses[index]!;
    const graphName = nodesToGraphNameMap[node.id] ?? 'Unknown Graph';
    return (
      <ChatBubble
        style={style}
        nodeId={node.id}
        nodeTitle={node.title}
        data={process.data}
        key={getChatViewerProcessKey(node.id, process.processId, processIndex)}
        graphName={graphName}
        onGoToNode={doGoToNode}
        splitIndex={processIndex}
      />
    );
  };

  return (
    <div css={styles}>
      <div className="controls-filters">
        <TextField
          placeholder="Graph Filter..."
          value={graphFilter}
          onChange={(e) => setGraphFilter((e.target as HTMLInputElement).value)}
        />
      </div>
      <div className="chats">
        {graphRunning && (
          <section className="in-progress-chats">
            {runningProcesses.map(({ node, process, index }) => {
              const graphName = nodesToGraphNameMap[node.id] ?? 'Unknown Graph';
              return (
                <ChatBubble
                  nodeId={node.id}
                  nodeTitle={node.title}
                  data={process.data}
                  key={getChatViewerProcessKey(node.id, process.processId, index)}
                  graphName={graphName}
                  onGoToNode={doGoToNode}
                  splitIndex={index}
                />
              );
            })}
          </section>
        )}

        <section className="completed-chats">
          <FixedSizeList height={window.innerHeight} width="100%" itemCount={completedProcesses.length} itemSize={150}>
            {CompletedRow}
          </FixedSizeList>
        </section>
      </div>
    </div>
  );
};

const ChatBubble: FC<{
  graphName: string;
  nodeId: NodeId;
  nodeTitle: string;
  data: NodeRunDataWithRefs;
  splitIndex: number;
  style?: CSSProperties;
  onGoToNode?: (nodeId: NodeId) => void;
}> = ({ nodeId, nodeTitle, splitIndex, data, graphName, style, onGoToNode }) => {
  const dataRefs = useDataRefs();
  const promptRef = useRef<HTMLDivElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const [expanded, toggleExpanded] = useToggle();

  const prompt = useMemo(() => getChatViewerPromptValue(data, splitIndex, dataRefs), [data, dataRefs, splitIndex]);

  const chatOutput = useMemo(
    () => getChatViewerResponseValue(data, splitIndex) ?? getChatViewerErrorValue(data),
    [data, splitIndex],
  );
  const renderMode = expanded || data.status?.type !== 'ok' ? 'expanded-preview' : 'compact';

  useLayoutEffect(() => {
    if (promptRef.current) {
      if (data.status?.type === 'ok') {
        promptRef.current.scrollTop = 0;
      } else {
        promptRef.current.scrollTop = promptRef.current.scrollHeight;
      }
    }
  }, [data.status?.type, prompt]);

  useLayoutEffect(() => {
    if (responseRef.current) {
      if (data.status?.type === 'ok') {
        responseRef.current.scrollTop = 0;
      } else {
        responseRef.current.scrollTop = responseRef.current.scrollHeight;
      }
    }
  }, [chatOutput, data.status?.type]);

  if (!chatOutput) {
    return null;
  }

  return (
    <div
      className={clsx('chat-bubble', {
        complete: data.status?.type === 'ok',
        error: data.status?.type === 'error',
        expanded,
      })}
      style={style}
    >
      <header>
        <span>
          <span className="node-title">{nodeTitle}</span> in <span className="graph-name">{graphName}</span>
        </span>
        <div className="buttons">
          <button className="go-to-node" onClick={() => onGoToNode?.(nodeId)}>
            Go To
          </button>
          <button className="expand" onClick={toggleExpanded.toggle}>
            {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
          </button>
        </div>
      </header>
      {expanded || data.status?.type !== 'ok' ? (
        <div className="prompt" ref={promptRef}>
          <RenderDataValue value={prompt} mode={renderMode} />
        </div>
      ) : null}
      <div className="line" />
      <div className="response" ref={responseRef}>
        <RenderDataValue value={chatOutput} mode={renderMode} />
      </div>
    </div>
  );
};
