import { useDraggable } from '@dnd-kit/core';
import { type ChartNode, type NodeConnection } from '@ironclad/rivet-core';
import { type FC } from 'react';
import { VisualNode } from './VisualNode.js';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { ErrorBoundary } from 'react-error-boundary';
import { type ProcessDataForNode } from '../state/dataFlow';
import { useCanvasHandlersContext, useCanvasViewContext } from './CanvasContext';

interface DraggableNodeProps {
  renderSkeleton?: boolean;
  node: ChartNode;
  connections?: NodeConnection[];
  isSelected?: boolean;
  isKnownNodeType: boolean;
  lastRun?: ProcessDataForNode[];
  processPage: number | 'latest';
  isPinned: boolean;
}

export const DraggableNode: FC<DraggableNodeProps> = ({
  node,
  connections = [],
  isSelected = false,
  isKnownNodeType,
  lastRun,
  processPage,
  isPinned,
  renderSkeleton,
}) => {
  const { canvasZoom } = useCanvasViewContext();
  const { onNodeSelected, onNodeSizeChanged, onNodeStartEditing } = useCanvasHandlersContext();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: node.id });

  return (
    <ErrorBoundary fallback={<div>Failed to render node</div>}>
      <VisualNode
        ref={setNodeRef}
        isSelected={isSelected}
        node={node}
        connections={connections}
        isDragging={isDragging}
        xDelta={transform ? transform.x / canvasZoom : 0}
        yDelta={transform ? transform.y / canvasZoom : 0}
        nodeAttributes={attributes}
        handleAttributes={listeners}
        isKnownNodeType={isKnownNodeType}
        lastRun={lastRun}
        processPage={processPage}
        isPinned={isPinned}
        renderSkeleton={renderSkeleton}
        onSelectNode={useStableCallback((multi: boolean) => {
          onNodeSelected?.(node, multi);
        })}
        onStartEditing={useStableCallback(() => {
          onNodeStartEditing?.(node);
        })}
        onNodeSizeChanged={(width, height) => onNodeSizeChanged?.(node, width, height)}
      />
    </ErrorBoundary>
  );
};
