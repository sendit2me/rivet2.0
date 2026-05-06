import clsx from 'clsx';
import { type CSSProperties, type FC, type HTMLAttributes, type MouseEvent, forwardRef, memo, useMemo } from 'react';
import { type ChartNode, type CommentNode, type NodeConnection } from '@valerypopoff/rivet2-core';
import { useAtomValue } from 'jotai';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { useHistoricalNodeChangeInfo } from '../hooks/useHistoricalNodeChangeInfo';
import { useNodePortLabelMinWidth } from '../hooks/useNodePortLabelMinWidth';
import { type ProcessDataForNode, resolvedGraphSelectionState } from '../state/dataFlow.js';
import { getNodeExecutionClassFlags, getSelectedProcessRun } from '../state/selectors/executionSelectors.js';
import { getSplitStackGhostColors } from '../utils/nodeSplitStackColors.js';
import { getNodeBorderReferenceColor, getNodeHeaderColor, isNodeBorderVisible } from '../utils/nodeColor.js';
import { useCanvasHandlersContext, useCanvasViewContext } from './CanvasContext';
import { ZoomedOutVisualNodeContent } from './visualNode/ZoomedOutVisualNodeContent';
import { NormalVisualNodeContent } from './visualNode/NormalVisualNodeContent';
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
  isSearchMatch?: boolean;
  isKnownNodeType: boolean;
  isOutputExpanded: boolean;
  shouldShowHoverControls?: boolean;
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
        isSearchMatch,
        isKnownNodeType,
        isOutputExpanded,
        shouldShowHoverControls,
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
      const minimumNodeWidth = useNodePortLabelMinWidth(node);
      const changeInfo = useHistoricalNodeChangeInfo(node.id);
      const graphSelectionOptions = useAtomValue(resolvedGraphSelectionState);
      const nodeColor = node.visualData.color;

      useDependsOnPlugins();

      const style = useMemo(() => {
        const bgColor = getNodeHeaderColor(nodeColor);
        const borderColor = getNodeBorderReferenceColor(nodeColor);
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
          minWidth: isComment || effectiveIsZoomedOut ? undefined : minimumNodeWidth,
          height: commentHeight,
          '--node-bg': bgColor,
          '--node-border': borderColor,
          '--node-bg-foreground': fgColor,
          '--node-stack-front-bg': splitStackGhostColors.frontBackground,
          '--node-stack-back-bg': splitStackGhostColors.backBackground,
        } as CSSProperties;
      }, [
        commentHeight,
        effectiveIsZoomedOut,
        isComment,
        isDragging,
        minimumNodeWidth,
        nodeColor,
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
              hasCustomBorderColor: isNodeBorderVisible(nodeColor),
              searchMatch: isSearchMatch,
              dragging: isDragging,
              showHoverControls: shouldShowHoverControls,
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
          onDoubleClick={(event) => {
            if (isKnownNodeType) {
              event.currentTarget.blur();
              onNodeStartEditing?.(node);
            }
          }}
        >
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
              minimumNodeWidth={minimumNodeWidth}
            />
          )}
          <div className="node-border-overlay" aria-hidden="true" />
        </div>
      );
    },
  ),
);
