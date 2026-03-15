import clsx from 'clsx';
import {
  type CSSProperties,
  type FC,
  type HTMLAttributes,
  type MouseEvent,
  forwardRef,
  memo,
  useMemo,
  useState,
} from 'react';
import { type ChartNode, type CommentNode, type NodeConnection } from '@ironclad/rivet-core';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { useHistoricalNodeChangeInfo } from '../hooks/useHistoricalNodeChangeInfo';
import { type ProcessDataForNode } from '../state/dataFlow.js';
import { useCanvasHandlersContext, useCanvasViewContext } from './CanvasContext';
import { ZoomedOutVisualNodeContent } from './visualNode/ZoomedOutVisualNodeContent';
import { NormalVisualNodeContent } from './visualNode/NormalVisualNodeContent';

export type VisualNodeProps = {
  node: ChartNode;
  connections?: NodeConnection[];
  xDelta?: number;
  yDelta?: number;
  isDragging?: boolean;
  isOverlay?: boolean;
  isSelected?: boolean;
  isKnownNodeType: boolean;
  isPinned: boolean;
  lastRun?: ProcessDataForNode[];
  processPage: number | 'latest';
  renderSkeleton?: boolean;
  onSelectNode?: (multi: boolean) => void;
  onStartEditing?: () => void;
  onNodeSizeChanged?: (newWidth: number, newHeight: number) => void;
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
        isKnownNodeType,
        isPinned,
        lastRun,
        processPage,
        renderSkeleton,
        onSelectNode,
        onStartEditing,
        onNodeSizeChanged,
      },
      ref,
    ) => {
      const { heightCache, isReallyZoomedOut, isZoomedOut } = useCanvasViewContext();
      const { onMouseOut, onMouseOver } = useCanvasHandlersContext();
      const isComment = node.type === 'comment';
      const effectiveIsZoomedOut = isZoomedOut && !isComment;
      const effectiveIsReallyZoomedOut = isReallyZoomedOut && !isComment;
      const changeInfo = useHistoricalNodeChangeInfo(node.id);
      const [isHovered, setIsHovered] = useState(false);
      const asCommentNode = node as CommentNode;

      useDependsOnPlugins();

      const style = useMemo(() => {
        const bgColor = node.visualData.color?.bg ?? 'var(--grey-darkish)';
        const borderColor = node.visualData.color?.border ?? 'var(--grey-darkish)';
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
          height: isComment ? asCommentNode.data.height : undefined,
          '--node-bg': bgColor,
          '--node-border': borderColor,
          '--node-bg-foreground': fgColor,
        } as CSSProperties;
      }, [
        asCommentNode.data.height,
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

      const selectedProcessRun =
        lastRun && lastRun.length > 0
          ? lastRun.at(processPage === 'latest' ? lastRun.length - 1 : processPage)?.data
          : undefined;

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
              success: selectedProcessRun?.status?.type === 'ok',
              error: selectedProcessRun?.status?.type === 'error',
              running: selectedProcessRun?.status?.type === 'running',
              'not-ran': selectedProcessRun?.status?.type === 'notRan',
              zoomedOut: effectiveIsZoomedOut,
              isComment,
              isPinned,
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
          onMouseOver={(event: MouseEvent<HTMLElement>) => {
            onMouseOver?.(event, node.id);
            setIsHovered(true);
          }}
          onMouseOut={(event: MouseEvent<HTMLElement>) => {
            onMouseOut?.(event, node.id);
            setIsHovered(false);
          }}
          onDoubleClick={() => {
            if (isKnownNodeType) {
              onStartEditing?.();
            }
          }}
        >
          {effectiveIsZoomedOut ? (
            <ZoomedOutVisualNodeContent
              node={node}
              connections={connections}
              handleAttributes={handleAttributes}
              onSelectNode={onSelectNode}
              onStartEditing={onStartEditing}
              isKnownNodeType={isKnownNodeType}
              lastRun={lastRun}
              processPage={processPage}
              isReallyZoomedOut={effectiveIsReallyZoomedOut}
            />
          ) : (
            <NormalVisualNodeContent
              heightCache={heightCache}
              node={node}
              connections={connections}
              onSelectNode={onSelectNode}
              onStartEditing={onStartEditing}
              onNodeSizeChanged={onNodeSizeChanged}
              handleAttributes={handleAttributes}
              isKnownNodeType={isKnownNodeType}
              lastRun={lastRun}
              processPage={processPage}
              isPinned={isPinned}
              isHistoricalChanged={isHistoricalChanged}
              isHovered={isHovered}
            />
          )}
        </div>
      );
    },
  ),
);
