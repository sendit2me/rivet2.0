import type { ChartNode, ProcessId } from '@valerypopoff/rivet2-core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import CopyIcon from 'majesticons/line/clipboard-line.svg?react';
import ExpandIcon from 'majesticons/line/maximize-line.svg?react';
import FlaskIcon from 'majesticons/line/flask-line.svg?react';
import type { FC, MouseEvent } from 'react';
import { useMemo } from 'react';
import ExpandDownStopIcon from '../../assets/icons/expand-down-stop.svg?react';
import { useNodeIO } from '../../hooks/useGetNodeIO.js';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { useUnknownNodeComponentDescriptorFor } from '../../hooks/useNodeTypes.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { promptDesignerAttachedChatNodeState } from '../../state/promptDesigner.js';
import {
  type NodeRunDataWithRefs,
  type ProcessDataForNode,
  lastRunDataState,
  resolvedGraphSelectionState,
  selectedProcessPageState,
} from '../../state/dataFlow.js';
import { filterProcessDataForSelection } from '../../state/selectors/executionSelectors.js';
import { overlayOpenState } from '../../state/ui.js';
import { Tooltip } from '../Tooltip.js';
import { CodeNodeErrorOutput } from '../nodes/CodeNode.js';
import {
  getNodeOutputContentKey,
  NodeOutputContentFade,
  useOutputDataWithReplacementGrace,
} from './NodeOutputContentState.js';
import { copyOutputValue } from './nodeOutputCopyActions.js';
import { NodeOutputPager } from './NodeOutputPager.js';
import { resolveNodeOutputPreviewMode } from './nodeOutputPreviewMode.js';
import {
  createNodeOutputContentViewModel,
  getNodeOutputCopySource,
  getSelectedNodeOutputProcess,
} from './nodeOutputViewModel.js';
import { renderNodeOutputBody } from './renderNodeOutputBody.js';

export const NodeInlineOutput: FC<{
  node: ChartNode;
  isOutputExpanded: boolean;
  isHovered: boolean;
  onToggleExpandedOutput: () => void;
  onOpenFullscreenModal?: () => void;
}> = ({ node, isOutputExpanded, isHovered, onToggleExpandedOutput, onOpenFullscreenModal }) => {
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
          isHovered={isHovered}
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
          isHovered={isHovered}
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
  isHovered: boolean;
  processId: ProcessId;
  onToggleExpandedOutput: () => void;
  onOpenFullscreenModal?: () => void;
}> = ({ node, data, isOutputExpanded, isHovered, processId, onToggleExpandedOutput, onOpenFullscreenModal }) => {
  const dataRefs = useDataRefs();
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

  const handleOutputActionMouseDown = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
    // Output controls are hover affordances. Do not let clicking them focus the
    // draggable node root, otherwise the settings gear stays visible after leave.
    event.preventDefault();
    event.stopPropagation();
  });
  const handleOutputActionClick = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  });

  const content = useMemo(
    () =>
      createNodeOutputContentViewModel({
        nodeType: node.type,
        data,
        dataRefs,
      }),
    [data, dataRefs, node.type],
  );

  const copySource = getNodeOutputCopySource(content);
  const handleCopyToClipboard = useStableCallback(() =>
    copyOutputValue(copySource, dataRefs, getCopyValueData, io.outputDefinitions),
  );

  if (content.kind === 'code-error') {
    const contentKey = getNodeOutputContentKey(processId, data, content.contentKeyKind);

    return (
      <div className="node-output-inner errored">
        <NodeOutputContentFade key={contentKey} contentKey={contentKey}>
          <CodeNodeErrorOutput data={data} />
        </NodeOutputContentFade>
      </div>
    );
  }

  if (content.kind === 'generic-error') {
    const contentKey = getNodeOutputContentKey(processId, data, content.contentKeyKind);

    return (
      <div className="node-output-inner errored">
        <NodeOutputContentFade key={contentKey} contentKey={contentKey}>
          {content.error}
        </NodeOutputContentFade>
      </div>
    );
  }

  if (content.kind === 'empty') {
    return null;
  }

  const { isCompact, renderMode } = resolveNodeOutputPreviewMode({
    isOutputExpanded,
    isHovered,
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
  const contentKey = getNodeOutputContentKey(processId, data, content.contentKeyKind);

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
      <NodeOutputContentFade key={contentKey} contentKey={contentKey}>
        {body}
      </NodeOutputContentFade>
      {content.warnings && (
        <div className="node-output-warnings">
          {content.warnings.map((warning) => (
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
  isHovered: boolean;
  onToggleExpandedOutput: () => void;
  onOpenFullscreenModal?: () => void;
}> = ({ node, data, isOutputExpanded, isHovered, onToggleExpandedOutput, onOpenFullscreenModal }) => {
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

  const selectedData = useMemo(() => getSelectedNodeOutputProcess(data, selectedPage), [data, selectedPage]);

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
          isHovered={isHovered}
          node={node}
          processId={selectedData.processId}
          onToggleExpandedOutput={onToggleExpandedOutput}
          onOpenFullscreenModal={onOpenFullscreenModal}
        />
      )}
    </div>
  );
};
