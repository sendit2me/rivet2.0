import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type ProcessDataForNode,
  lastRunDataState,
  resolvedGraphSelectionState,
  selectedProcessPageState,
  type NodeRunDataWithRefs,
} from '../state/dataFlow.js';

import {
  type FC,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useUnknownNodeComponentDescriptorFor } from '../hooks/useNodeTypes.js';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { type ChartNode, type ProcessId } from '@valerypopoff/rivet2-core';
import { css } from '@emotion/react';
import CopyIcon from 'majesticons/line/clipboard-line.svg?react';
import ExpandIcon from 'majesticons/line/maximize-line.svg?react';
import FlaskIcon from 'majesticons/line/flask-line.svg?react';
import ExpandDownStopIcon from '../assets/icons/expand-down-stop.svg?react';
import { FullScreenModal } from './FullScreenModal.js';
import { promptDesignerAttachedChatNodeState } from '../state/promptDesigner.js';
import { fullscreenOutputModalBoundsState, overlayOpenState } from '../state/ui';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { useToggle } from 'ahooks';
import { expandedOutputNodeIdsState, fullscreenOutputNodeState, hoveringNodeState } from '../state/graphBuilder';
import { useNodeIO } from '../hooks/useGetNodeIO';
import { Tooltip } from './Tooltip';
import { type DataRefReader, useDataRefs } from '../providers/ProvidersContext';
import { filterProcessDataForSelection, getSelectedProcessData } from '../state/selectors/executionSelectors.js';
import { renderNodeOutputBody } from './nodeOutput/renderNodeOutputBody.js';
import { getStoredOutputWarnings } from '../utils/executionDataReaders.js';
import { hasUnavailableStoredRefs } from '../utils/executionDataTransforms.js';
import { copyOutputJson, copyOutputValue } from './nodeOutput/nodeOutputCopyActions.js';
import { FullscreenOutputSearchContext } from './nodeOutput/FullscreenOutputSearchContext.js';
import { useFullscreenOutputSearch } from './nodeOutput/useFullscreenOutputSearch.js';
import { FullscreenNodeOutputToolbar } from './nodeOutput/FullscreenNodeOutputToolbar.js';
import { MATCH_ACTIVE_CLASS, MATCH_CLASS } from './nodeOutput/fullscreenOutputSearch.js';
import { resolveNodeOutputPreviewMode } from './nodeOutput/nodeOutputPreviewMode.js';
import { CodeNodeErrorOutput } from './nodes/CodeNode.js';
import type { HorizontalModalBounds } from '../utils/fullScreenModalBounds.js';
import {
  getSelectedVisibleOutputProcess,
  NODE_OUTPUT_REPLACEMENT_GRACE_MS,
  shouldUseCodeErrorOutput,
  shouldUseCustomNodeErrorOutput,
} from './nodeOutput/nodeOutputVisibility.js';

export const NodeOutput: FC<{ node: ChartNode; suspended?: boolean }> = memo(({ node, suspended = false }) => {
  const isOutputExpanded = useAtomValue(expandedOutputNodeIdsState).includes(node.id);

  if (suspended && !isOutputExpanded) {
    return null;
  }

  return <ActiveNodeOutput node={node} isOutputExpanded={isOutputExpanded} />;
});

NodeOutput.displayName = 'NodeOutput';

const ActiveNodeOutput: FC<{ node: ChartNode; isOutputExpanded: boolean }> = ({ node, isOutputExpanded }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  useDependsOnPlugins();

  const setExpandedOutputNodeIds = useSetAtom(expandedOutputNodeIdsState);
  const setFullscreenOutputNodeId = useSetAtom(fullscreenOutputNodeState);
  const setHoveringNode = useSetAtom(hoveringNodeState);

  const clearNodeHover = useStableCallback(() => {
    setHoveringNode((hoveringNodeId) => (hoveringNodeId === node.id ? undefined : hoveringNodeId));
  });
  const clearFullscreenOutputNode = useStableCallback(() => {
    setFullscreenOutputNodeId((nodeId) => (nodeId === node.id ? null : nodeId));
  });

  useEffect(() => clearFullscreenOutputNode, [clearFullscreenOutputNode]);

  const handleToggleExpandedOutput = useStableCallback(() => {
    setExpandedOutputNodeIds((previous) =>
      previous.includes(node.id) ? previous.filter((nodeId) => nodeId !== node.id) : [...previous, node.id],
    );
  });
  const handleOpenFullscreenModal = useStableCallback(() => {
    clearNodeHover();
    setFullscreenOutputNodeId(node.id);
    setIsModalOpen(true);
  });
  const handleCloseFullscreenModal = useStableCallback(() => {
    clearNodeHover();
    clearFullscreenOutputNode();
    setIsModalOpen(false);
  });

  return (
    <div className="node-output-outer">
      {isModalOpen ? <ResizableNodeFullscreenOutputModal node={node} onClose={handleCloseFullscreenModal} /> : null}
      <NodeOutputBase
        node={node}
        isOutputExpanded={isOutputExpanded}
        onToggleExpandedOutput={handleToggleExpandedOutput}
        onOpenFullscreenModal={handleOpenFullscreenModal}
      />
    </div>
  );
};

const ResizableNodeFullscreenOutputModal: FC<{ node: ChartNode; onClose: () => void }> = ({ node, onClose }) => {
  const [fullscreenOutputModalBounds, setFullscreenOutputModalBounds] = useAtom(fullscreenOutputModalBoundsState);
  const handleFullscreenOutputModalBoundsChange = useStableCallback((bounds: HorizontalModalBounds) => {
    setFullscreenOutputModalBounds(bounds);
  });

  return (
    <FullScreenModal
      isOpen
      horizontalBounds={fullscreenOutputModalBounds}
      onClose={onClose}
      onHorizontalBoundsChange={handleFullscreenOutputModalBoundsChange}
      testId="fullscreen-output-modal"
    >
      <NodeFullscreenOutput node={node} />
    </FullScreenModal>
  );
};

function getNodeOutputContentKey(processId: ProcessId, data: NodeRunDataWithRefs, contentKind: string): string {
  return `${processId}:${data.startedAt ?? 'unknown-start'}:${contentKind}`;
}

const nodeOutputContentFadeCss = css`
  animation: node-output-content-fade-in 140ms ease-out both;

  @keyframes node-output-content-fade-in {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const NodeOutputContentFade: FC<{ children: ReactNode }> = ({ children }) => (
  <div css={nodeOutputContentFadeCss}>{children}</div>
);

NodeOutputContentFade.displayName = 'NodeOutputContentFade';

function useOutputDataWithReplacementGrace(
  nodeType: ChartNode['type'],
  output: ProcessDataForNode[] | undefined,
  selectedPage: number | 'latest',
  dataRefs: DataRefReader,
): ProcessDataForNode[] | undefined {
  const [displayedOutput, setDisplayedOutput] = useState(output);
  const hasSelectedVisibleOutput = getSelectedVisibleOutputProcess(nodeType, output, selectedPage) != null;
  const displayedVisibleOutput = getSelectedVisibleOutputProcess(nodeType, displayedOutput, selectedPage);
  const hasDisplayedAvailableOutput =
    displayedVisibleOutput != null && !hasUnavailableStoredRefs(displayedVisibleOutput.data, dataRefs);

  useEffect(() => {
    if (hasSelectedVisibleOutput) {
      setDisplayedOutput(output);
      return;
    }

    if (!hasDisplayedAvailableOutput) {
      setDisplayedOutput(undefined);
      return;
    }

    const timeout = globalThis.setTimeout(() => {
      setDisplayedOutput(undefined);
    }, NODE_OUTPUT_REPLACEMENT_GRACE_MS);

    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [hasDisplayedAvailableOutput, hasSelectedVisibleOutput, output]);

  return hasSelectedVisibleOutput ? output : hasDisplayedAvailableOutput ? displayedOutput : undefined;
}

const fullscreenOutputCss = css`
  position: relative;
  min-height: 100%;
  display: flex;
  min-width: 0;
  flex-direction: column;

  .fullscreen-header {
    position: sticky;
    top: 0;
    z-index: 1;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .picker {
    border: 1px solid var(--grey-darkish);
    background: transparent;
    display: inline-flex;
    gap: 0;
    border-radius: 8px;
    corner-shape: squircle;
    box-shadow: none;
    margin-bottom: 8px;

    .picker-left,
    .picker-right {
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      cursor: pointer;
      border: 0;
      margin: 0;
      padding: 0;
      width: 32px;
      height: 32px;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }

    .picker-left {
      border-right: 1px solid rgba(255, 255, 255, 0.1);
    }

    .picker-right {
      border-left: 1px solid rgba(255, 255, 255, 0.1);
    }

    .picker-page {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
    }
  }

  .fullscreen-header.is-over-content .picker {
    border-color: var(--grey);
    background: var(--grey-darker);
    box-shadow: 4px 4px 8px var(--shadow-dark);
  }

  .fullscreen-output-body {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .fullscreen-output-body.wrap-lines .pre-wrap,
  .fullscreen-output-body.markdown-lines .rivet-markdown-output.markdown-body pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overflow-x: visible;
  }

  .fullscreen-output-body.wrap-lines .rendered-object-type pre {
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: normal;
    overflow-x: visible;
  }

  .fullscreen-output-body.no-wrap-lines .pre-wrap,
  .fullscreen-output-body.no-wrap-lines .rendered-object-type pre {
    white-space: pre;
    overflow-wrap: normal;
    overflow-x: visible;
  }

  .${MATCH_CLASS} {
    background: rgba(255, 214, 10, 0.3);
    border-radius: 4px;
    corner-shape: squircle;
  }

  .${MATCH_ACTIVE_CLASS} {
    background: rgba(255, 214, 10, 0.75);
    color: #000;
  }
`;

function isScrollableOverflow(overflowValue: string): boolean {
  return overflowValue === 'auto' || overflowValue === 'scroll' || overflowValue === 'overlay';
}

function findScrollContainer(element: HTMLElement): HTMLElement | Window {
  let current: HTMLElement | null = element.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (isScrollableOverflow(style.overflowY)) {
      return current;
    }

    current = current.parentElement;
  }

  return window;
}

function isWindowScrollContainer(scrollContainer: HTMLElement | Window): scrollContainer is Window {
  return scrollContainer === window;
}

function getScrollContainerTop(scrollContainer: HTMLElement | Window): number {
  if (isWindowScrollContainer(scrollContainer)) {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  return scrollContainer.scrollTop;
}

const renderNodeOutputPager = ({
  onNextPage,
  onPrevPage,
  selectedPage,
  stopDoubleClickPropagation = false,
  totalPages,
}: {
  selectedPage: number | 'latest';
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  stopDoubleClickPropagation?: boolean;
}) => {
  const handleDoubleClick = stopDoubleClickPropagation ? (event: MouseEvent) => event.stopPropagation() : undefined;

  return (
    <div className="picker">
      <button className="picker-left" onClick={onPrevPage} onDoubleClick={handleDoubleClick}>
        {'<'}
      </button>
      <div className="picker-page">{selectedPage === 'latest' ? totalPages : selectedPage + 1}</div>
      <button className="picker-right" onClick={onNextPage} onDoubleClick={handleDoubleClick}>
        {'>'}
      </button>
    </div>
  );
};

const NodeFullscreenOutput: FC<{ node: ChartNode }> = ({ node }) => {
  const dataRefs = useDataRefs();
  const output = useAtomValue(lastRunDataState(node.id));
  const [selectedPage, setSelectedPage] = useAtom(selectedProcessPageState(node.id));
  const graphSelectionOptions = useAtomValue(resolvedGraphSelectionState);
  const fullscreenOutputRootRef = useRef<HTMLDivElement>(null);
  const [isHeaderOverContent, setIsHeaderOverContent] = useState(false);

  const filteredOutput = useMemo(
    () => filterProcessDataForSelection({ ...graphSelectionOptions, processData: output }) ?? output,
    [graphSelectionOptions, output],
  );

  const { FullscreenOutput, Output, OutputSimple, FullscreenOutputSimple, defaultRenderMarkdown, getCopyValueData } =
    useUnknownNodeComponentDescriptorFor(node);

  const [wrapLines, toggleWrapLines] = useToggle(true);
  const [renderMarkdown, toggleRenderMarkdown] = useToggle(defaultRenderMarkdown ?? false);

  const setOverlayOpen = useSetAtom(overlayOpenState);
  const setPromptDesignerAttachedNode = useSetAtom(promptDesignerAttachedChatNodeState);

  const io = useNodeIO(node.id);

  const { data, processId } = useMemo(() => {
    const selectedProcess = getSelectedProcessData(filteredOutput, selectedPage);
    return {
      data: selectedProcess?.data,
      processId: selectedProcess?.processId,
    };
  }, [filteredOutput, selectedPage]);

  const handleOpenPromptDesigner = () => {
    if (!processId) {
      return;
    }

    setOverlayOpen('promptDesigner');
    setPromptDesignerAttachedNode({
      nodeId: node.id,
      processId,
    });
  };

  const handleCopyToClipboard = useStableCallback(() => copyOutputValue(data, dataRefs, getCopyValueData));
  const handleCopyToClipboardJson = useStableCallback(() => copyOutputJson(data, dataRefs));
  const contentVersion = useMemo(
    () => ({
      data,
      processId,
      renderMarkdown,
      selectedPage,
    }),
    [data, processId, renderMarkdown, selectedPage],
  );
  const {
    contextValue: fullscreenOutputSearchContext,
    currentMatchIndex,
    fullscreenOutputBodyRef,
    goToNextMatch,
    goToPreviousMatch,
    handleSearchInputKeyDown,
    query,
    searchInputRef,
    setQuery,
    totalMatchCount,
  } = useFullscreenOutputSearch({
    contentKey: contentVersion,
  });

  useLayoutEffect(() => {
    const rootElement = fullscreenOutputRootRef.current;
    if (!rootElement || typeof window === 'undefined') {
      return;
    }

    const scrollContainer = findScrollContainer(rootElement);
    let animationFrame: number | undefined;

    const updateHeaderElevation = () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = undefined;
        setIsHeaderOverContent(getScrollContainerTop(scrollContainer) > 0);
      });
    };

    updateHeaderElevation();
    scrollContainer.addEventListener('scroll', updateHeaderElevation, { passive: true });
    window.addEventListener('resize', updateHeaderElevation);

    return () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }

      scrollContainer.removeEventListener('scroll', updateHeaderElevation);
      window.removeEventListener('resize', updateHeaderElevation);
    };
  }, [contentVersion]);

  const prevPage = useStableCallback(() => {
    if (!filteredOutput) {
      return;
    }
    setSelectedPage((page) => {
      const pageNum = page === 'latest' ? filteredOutput.length - 1 : page;
      return pageNum > 0 ? pageNum - 1 : pageNum;
    });
  });

  const nextPage = useStableCallback(() => {
    if (!filteredOutput) {
      return;
    }
    setSelectedPage((page) => {
      const pageNum = page === 'latest' ? filteredOutput.length - 1 : page;
      return pageNum < filteredOutput.length - 1 ? pageNum + 1 : pageNum;
    });
  });

  if (!filteredOutput || !data) {
    return null;
  }

  const shouldUseCustomErrorOutput = shouldUseCustomNodeErrorOutput(node.type, data);

  if (shouldUseCodeErrorOutput(node.type, data)) {
    return <CodeNodeErrorOutput data={data} />;
  }

  if (data.status?.type === 'error' && !shouldUseCustomErrorOutput) {
    return <div className="errored">{data.status.error}</div>;
  }

  if (!data.outputData && !data.splitOutputData && !shouldUseCustomErrorOutput) {
    return null;
  }

  const body = renderNodeOutputBody({
    FullscreenOutput,
    Output,
    OutputSimple,
    FullscreenOutputSimple,
    node,
    data,
    definitions: io.outputDefinitions,
    isCompact: false,
    renderMarkdown,
    renderMode: 'expanded-preview',
    allowLargeStoredValueActions: true,
  });

  return (
    <div css={fullscreenOutputCss} ref={fullscreenOutputRootRef}>
      <header className={`fullscreen-header${isHeaderOverContent ? ' is-over-content' : ''}`}>
        {filteredOutput.length > 1 ? (
          renderNodeOutputPager({
            selectedPage,
            totalPages: filteredOutput.length,
            onPrevPage: prevPage,
            onNextPage: nextPage,
          })
        ) : (
          <div />
        )}
        <FullscreenNodeOutputToolbar
          wrapLines={wrapLines}
          renderMarkdown={renderMarkdown}
          isOverContent={isHeaderOverContent}
          onToggleWrapLines={toggleWrapLines.toggle}
          onToggleRenderMarkdown={toggleRenderMarkdown.toggle}
          query={query}
          onQueryChange={setQuery}
          currentMatchIndex={currentMatchIndex}
          totalMatchCount={totalMatchCount}
          onPreviousMatch={goToPreviousMatch}
          onNextMatch={goToNextMatch}
          searchInputRef={searchInputRef}
          onSearchInputKeyDown={handleSearchInputKeyDown}
          onCopyValue={handleCopyToClipboard}
          onCopyJson={handleCopyToClipboardJson}
          onOpenPromptDesigner={node.type === 'chat' ? handleOpenPromptDesigner : undefined}
        />
      </header>

      <FullscreenOutputSearchContext.Provider value={fullscreenOutputSearchContext}>
        <div
          ref={fullscreenOutputBodyRef}
          className={`fullscreen-output-body ${wrapLines ? 'wrap-lines' : 'no-wrap-lines'}${
            renderMarkdown ? ' markdown-lines' : ''
          }`}
        >
          {body}
        </div>
      </FullscreenOutputSearchContext.Provider>
    </div>
  );
};

const NodeOutputBase: FC<{
  node: ChartNode;
  isOutputExpanded: boolean;
  onToggleExpandedOutput: () => void;
  onOpenFullscreenModal?: () => void;
}> = ({ node, isOutputExpanded, onToggleExpandedOutput, onOpenFullscreenModal }) => {
  const dataRefs = useDataRefs();
  const output = useAtomValue(lastRunDataState(node.id));
  const selectedPage = useAtomValue(selectedProcessPageState(node.id));
  const graphSelectionOptions = useAtomValue(resolvedGraphSelectionState);
  const filteredOutput = useMemo(
    () => filterProcessDataForSelection({ ...graphSelectionOptions, processData: output }) ?? output,
    [graphSelectionOptions, output],
  );
  const visibleOutput = useOutputDataWithReplacementGrace(node.type, filteredOutput, selectedPage, dataRefs);

  if (!visibleOutput?.length) {
    return null;
  }

  if (visibleOutput.length === 1) {
    const firstOutput = visibleOutput[0];
    if (!firstOutput) {
      return null;
    }

    return (
      <div className="node-output">
        <NodeOutputSingleProcess
          node={node}
          data={firstOutput.data}
          isOutputExpanded={isOutputExpanded}
          processId={firstOutput.processId}
          onToggleExpandedOutput={onToggleExpandedOutput}
          onOpenFullscreenModal={onOpenFullscreenModal}
        />
      </div>
    );
  } else {
    return (
      <div className="node-output multi">
        <NodeOutputMultiProcess
          node={node}
          data={visibleOutput}
          isOutputExpanded={isOutputExpanded}
          onToggleExpandedOutput={onToggleExpandedOutput}
          onOpenFullscreenModal={onOpenFullscreenModal}
        />
      </div>
    );
  }
};

const NodeOutputSingleProcess: FC<{
  node: ChartNode;
  data: NodeRunDataWithRefs;
  isOutputExpanded: boolean;
  processId: ProcessId;
  onToggleExpandedOutput: () => void;
  onOpenFullscreenModal?: () => void;
}> = ({ node, data, isOutputExpanded, processId, onToggleExpandedOutput, onOpenFullscreenModal }) => {
  const dataRefs = useDataRefs();
  const hoveringNodeId = useAtomValue(hoveringNodeState);
  const { Output, OutputSimple, getCopyValueData } = useUnknownNodeComponentDescriptorFor(node);

  const setOverlayOpen = useSetAtom(overlayOpenState);
  const setPromptDesignerAttachedNode = useSetAtom(promptDesignerAttachedChatNodeState);
  const io = useNodeIO(node.id);

  const handleOpenPromptDesigner = () => {
    setOverlayOpen('promptDesigner');
    setPromptDesignerAttachedNode({
      nodeId: node.id,
      processId,
    });
  };

  const handleCopyToClipboard = useStableCallback(() => copyOutputValue(data, dataRefs, getCopyValueData));
  const handleOutputActionMouseDown = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
    // Output controls are hover affordances. Do not let clicking them focus the
    // draggable node root, otherwise the settings gear stays visible after leave.
    event.preventDefault();
    event.stopPropagation();
  });
  const handleOutputActionClick = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  });

  const warnings = useMemo(() => getStoredOutputWarnings(data, dataRefs), [data, dataRefs]);
  const shouldUseCustomErrorOutput = shouldUseCustomNodeErrorOutput(node.type, data);

  if (shouldUseCodeErrorOutput(node.type, data)) {
    return (
      <div className="node-output-inner errored">
        <NodeOutputContentFade key={getNodeOutputContentKey(processId, data, 'code-error')}>
          <CodeNodeErrorOutput data={data} />
        </NodeOutputContentFade>
      </div>
    );
  }

  if (data.status?.type === 'error' && !shouldUseCustomErrorOutput) {
    return (
      <div className="node-output-inner errored">
        <NodeOutputContentFade key={getNodeOutputContentKey(processId, data, 'error')}>
          {data.status.error}
        </NodeOutputContentFade>
      </div>
    );
  }

  if (!data.outputData && !data.splitOutputData && !shouldUseCustomErrorOutput) {
    return null;
  }

  const { isCompact, renderMode } = resolveNodeOutputPreviewMode({
    isOutputExpanded,
    isHovered: hoveringNodeId === node.id,
  });

  const body = renderNodeOutputBody({
    Output,
    OutputSimple,
    node,
    data,
    definitions: io.outputDefinitions,
    isCompact,
    renderMode,
  });

  return (
    <div className="node-output-inner">
      <div className="overlay-buttons" onMouseDown={handleOutputActionMouseDown} onClick={handleOutputActionClick}>
        <Tooltip content="Unfold output">
          <div
            className="output-toggle-button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpandedOutput();
            }}
          >
            <ExpandDownStopIcon />
          </div>
        </Tooltip>
        <Tooltip content="Copy node output to clipboard">
          <div className="copy-button" onClick={handleCopyToClipboard}>
            <CopyIcon />
          </div>
        </Tooltip>

        {node.type === 'chat' && (
          <Tooltip content="Open chat in Prompt Designer">
            <div className="prompt-designer-button" onClick={handleOpenPromptDesigner}>
              <FlaskIcon />
            </div>
          </Tooltip>
        )}
        <Tooltip content="Show full output">
          <div
            className="expand-button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullscreenModal?.();
            }}
          >
            <ExpandIcon />
          </div>
        </Tooltip>
      </div>
      <NodeOutputContentFade
        key={getNodeOutputContentKey(processId, data, shouldUseCustomErrorOutput ? 'custom-error' : 'output')}
      >
        {body}
      </NodeOutputContentFade>
      {warnings && (
        <div className="node-output-warnings">
          {warnings.map((warning) => (
            <div className="node-output-warning" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NodeOutputMultiProcess: FC<{
  node: ChartNode;
  data: ProcessDataForNode[];
  isOutputExpanded: boolean;
  onToggleExpandedOutput: () => void;
  onOpenFullscreenModal?: () => void;
}> = ({ node, data, isOutputExpanded, onToggleExpandedOutput, onOpenFullscreenModal }) => {
  const [selectedPage, setSelectedPage] = useAtom(selectedProcessPageState(node.id));

  const prevPage = useStableCallback(() => {
    setSelectedPage((page) => {
      const pageNum = page === 'latest' ? data.length - 1 : page;
      return pageNum > 0 ? pageNum - 1 : pageNum;
    });
  });

  const nextPage = useStableCallback(() => {
    setSelectedPage((page) => {
      const pageNum = page === 'latest' ? data.length - 1 : page;
      return pageNum < data.length - 1 ? pageNum + 1 : pageNum;
    });
  });

  const selectedData = useMemo(
    () => data[selectedPage === 'latest' ? data.length - 1 : selectedPage],
    [data, selectedPage],
  );

  return (
    <div className="node-output multi">
      <div className="multi-node-output">
        <NodeOutputPager
          selectedPage={selectedPage}
          totalPages={data.length}
          onPrevPage={prevPage}
          onNextPage={nextPage}
          stopDoubleClickPropagation
        />
      </div>
      {selectedData && (
        <NodeOutputSingleProcess
          data={selectedData.data}
          isOutputExpanded={isOutputExpanded}
          node={node}
          processId={selectedData.processId}
          onToggleExpandedOutput={onToggleExpandedOutput}
          onOpenFullscreenModal={onOpenFullscreenModal}
        />
      )}
    </div>
  );
};

const NodeOutputPager: FC<{
  selectedPage: number | 'latest';
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  stopDoubleClickPropagation?: boolean;
}> = (props) => renderNodeOutputPager(props);
