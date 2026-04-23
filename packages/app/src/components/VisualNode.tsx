import clsx from 'clsx';
import {
  type CSSProperties,
  type FC,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent,
  forwardRef,
  memo,
  useMemo,
} from 'react';
import { type ChartNode, type CommentNode, type NodeConnection } from '@ironclad/rivet-core';
import { useAtomValue } from 'jotai';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { useHistoricalNodeChangeInfo } from '../hooks/useHistoricalNodeChangeInfo';
import { type ProcessDataForNode, resolvedGraphSelectionState } from '../state/dataFlow.js';
import { getNodeExecutionClassFlags, getSelectedProcessRun } from '../state/selectors/executionSelectors.js';
import { getSplitStackGhostColors } from '../utils/nodeSplitStackColors.js';
import { useCanvasHandlersContext, useCanvasViewContext } from './CanvasContext';
import { ZoomedOutVisualNodeContent } from './visualNode/ZoomedOutVisualNodeContent';
import { NormalVisualNodeContent } from './visualNode/NormalVisualNodeContent';
import { SplitRunModeIcon } from './visualNode/SplitRunModeIcon.js';
import { Tooltip } from './Tooltip.js';
import { getCanvasCommentHeight } from '../hooks/canvasVisibilityBounds.js';

export type VisualNodeProps = {
  node: ChartNode;
  connections?: NodeConnection[];
  xDelta?: number;
  yDelta?: number;
  isDragging?: boolean;
  isOverlay?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  isKnownNodeType: boolean;
  isOutputExpanded: boolean;
  lastRun?: ProcessDataForNode[];
  processPage: number | 'latest';
  renderHeavyContent: boolean;
  renderSkeleton?: boolean;
  nodeAttributes?: HTMLAttributes<HTMLDivElement>;
  handleAttributes?: HTMLAttributes<HTMLDivElement>;
};

export const VisualNode = memo(
  forwardRef<HTMLDivElement, VisualNodeProps>(
    (
      {
        node,
        connections = [],
        handleAttributes,
        nodeAttributes,
        xDelta = 0,
        yDelta = 0,
        isDragging,
        isOverlay,
        isSelected,
        isHovered,
        isKnownNodeType,
        isOutputExpanded,
        lastRun,
        processPage,
        renderHeavyContent,
        renderSkeleton,
      },
      ref,
    ) => {
      const { heightCache, isReallyZoomedOut, isZoomedOut } = useCanvasViewContext();
      const { onNodeMouseEnter, onNodeMouseLeave, onNodeStartEditing } = useCanvasHandlersContext();
      const isComment = node.type === 'comment';
      const effectiveIsZoomedOut = isZoomedOut && !isComment;
      const effectiveIsReallyZoomedOut = isReallyZoomedOut && !isComment;
      const commentHeight = isComment ? getCanvasCommentHeight(node as CommentNode) : undefined;
      const changeInfo = useHistoricalNodeChangeInfo(node.id);
      const graphSelectionOptions = useAtomValue(resolvedGraphSelectionState);

      useDependsOnPlugins();

      const style = useMemo(() => {
        const bgColor = node.visualData.color?.bg ?? 'var(--grey-darkish)';
        const borderColor = node.visualData.color?.border ?? 'var(--grey-darkish)';
        const splitStackGhostColors = getSplitStackGhostColors(bgColor);
        let fgColor = 'var(--foreground-bright)';

        const colorMatch = bgColor.match(/node-color-(\d+)/);
        if (colorMatch?.[1]) {
          fgColor = `var(--node-color-${colorMatch[1]}-foreground)`;
        }

        return {
          opacity: isDragging ? '0' : '',
          transform: `translate(${node.visualData.x + xDelta}px, ${node.visualData.y + yDelta}px) scale(1)`,
          zIndex: isComment ? -10000 : node.visualData.zIndex ?? 0,
          width: node.visualData.width,
          height: commentHeight,
          '--node-bg': bgColor,
          '--node-border': borderColor,
          '--node-bg-foreground': fgColor,
          '--node-stack-front-bg': splitStackGhostColors.frontBackground,
          '--node-stack-back-bg': splitStackGhostColors.backBackground,
        } as CSSProperties;
      }, [
        commentHeight,
        isComment,
        isDragging,
        node.visualData.color?.bg,
        node.visualData.color?.border,
        node.visualData.width,
        node.visualData.x,
        node.visualData.y,
        node.visualData.zIndex,
        xDelta,
        yDelta,
      ]);

      if (renderSkeleton) {
        return <div className="node-skeleton" style={style} {...nodeAttributes} />;
      }

      const selectedProcessRun = getSelectedProcessRun(lastRun, processPage, graphSelectionOptions);
      const executionClassFlags = getNodeExecutionClassFlags(selectedProcessRun);
      const splitRunModeLabel = node.isSplitSequential ? 'sequential' : 'parallel';
      const splitRunMaxLabel = `max ${node.splitRunMax ?? 10}`;

      const changedClass = changeInfo
        ? changeInfo.changed
          ? !changeInfo.before && changeInfo.after
            ? 'changed-added'
            : 'changed'
          : 'not-changed'
        : '';
      const isHistoricalChanged = changeInfo != null && changeInfo.changed && !!changeInfo.before && !!changeInfo.after;

      return (
        <div
          className={clsx(
            'node',
            {
              overlayNode: isOverlay,
              selected: isSelected,
              hovered: isHovered,
              ...executionClassFlags,
              zoomedOut: effectiveIsZoomedOut,
              isComment,
              isOutputExpanded,
              isSplit: node.isSplitRun,
              disabled: node.disabled,
              conditional: !!node.isConditional,
            },
            changedClass,
          )}
          ref={ref}
          style={style}
          {...nodeAttributes}
          data-nodeid={node.id}
          data-contextmenutype={`node-${node.type}`}
          onMouseEnter={(event: MouseEvent<HTMLElement>) => {
            onNodeMouseEnter?.(event, node.id);
          }}
          onMouseLeave={(event: MouseEvent<HTMLElement>) => {
            onNodeMouseLeave?.(event, node.id);
          }}
          onDoubleClick={() => {
            if (isKnownNodeType) {
              onNodeStartEditing?.(node);
            }
          }}
        >
          {node.isSplitRun && !effectiveIsReallyZoomedOut && (
            <Tooltip className="split-run-summary-tooltip" content="Edit Node" placement="top" tag="span">
              <button
                type="button"
                className="split-run-summary"
                aria-label={`Edit split run settings, ${splitRunModeLabel}, ${splitRunMaxLabel}`}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  if (isKnownNodeType) {
                    onNodeStartEditing?.(node);
                  }
                }}
                onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                }}
              >
                <SplitRunModeIcon isSequential={node.isSplitSequential} />
                <strong className="split-run-summary-mode">{splitRunModeLabel}</strong>
                {`, ${splitRunMaxLabel}`}
              </button>
            </Tooltip>
          )}
          {effectiveIsZoomedOut ? (
            <ZoomedOutVisualNodeContent
              node={node}
              connections={connections}
              handleAttributes={handleAttributes}
              isKnownNodeType={isKnownNodeType}
              isReallyZoomedOut={effectiveIsReallyZoomedOut}
              isRunning={executionClassFlags.running}
            />
          ) : (
            <NormalVisualNodeContent
              heightCache={heightCache}
              node={node}
              connections={connections}
              handleAttributes={handleAttributes}
              isKnownNodeType={isKnownNodeType}
              isHistoricalChanged={isHistoricalChanged}
              isRunning={executionClassFlags.running}
              renderHeavyContent={renderHeavyContent}
            />
          )}
          <div className="node-border-overlay" aria-hidden="true" />
        </div>
      );
    },
  ),
);
