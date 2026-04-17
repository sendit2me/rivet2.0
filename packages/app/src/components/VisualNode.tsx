import clsx from 'clsx';
import {
  type CSSProperties,
  type FC,
  type HTMLAttributes,
  type MouseEvent,
  forwardRef,
  memo,
  useMemo,
} from 'react';
import { type ChartNode, type CommentNode, type NodeConnection } from '@ironclad/rivet-core';
import { useAtomValue } from 'jotai';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { useHistoricalNodeChangeInfo } from '../hooks/useHistoricalNodeChangeInfo';
import { type ProcessDataForNode, resolvedGraphSelectionState, type NodeRunDataWithRefs } from '../state/dataFlow.js';
import { getNodeExecutionClassFlags, getSelectedProcessRun } from '../state/selectors/executionSelectors.js';
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
  isHovered?: boolean;
  isKnownNodeType: boolean;
  isOutputExpanded: boolean;
  lastRun?: ProcessDataForNode[];
  processPage: number | 'latest';
  renderSkeleton?: boolean;
  nodeAttributes?: HTMLAttributes<HTMLDivElement>;
  handleAttributes?: HTMLAttributes<HTMLDivElement>;
};

export type SelectedProcessRunProp = {
  selectedProcessRun?: NodeRunDataWithRefs;
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
        renderSkeleton,
      },
      ref,
    ) => {
      const { heightCache, isReallyZoomedOut, isZoomedOut } = useCanvasViewContext();
      const { onNodeMouseEnter, onNodeMouseLeave, onNodeStartEditing } = useCanvasHandlersContext();
      const isComment = node.type === 'comment';
      const effectiveIsZoomedOut = isZoomedOut && !isComment;
      const effectiveIsReallyZoomedOut = isReallyZoomedOut && !isComment;
      const changeInfo = useHistoricalNodeChangeInfo(node.id);
      const graphSelectionOptions = useAtomValue(resolvedGraphSelectionState);

      useDependsOnPlugins();

      const asCommentNode = node as CommentNode;

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
          {effectiveIsZoomedOut ? (
            <ZoomedOutVisualNodeContent
              node={node}
              connections={connections}
              handleAttributes={handleAttributes}
              isKnownNodeType={isKnownNodeType}
              selectedProcessRun={selectedProcessRun}
              isReallyZoomedOut={effectiveIsReallyZoomedOut}
            />
          ) : (
            <NormalVisualNodeContent
              heightCache={heightCache}
              node={node}
              connections={connections}
              handleAttributes={handleAttributes}
              isKnownNodeType={isKnownNodeType}
              selectedProcessRun={selectedProcessRun}
              isHistoricalChanged={isHistoricalChanged}
            />
          )}
        </div>
      );
    },
  ),
);
