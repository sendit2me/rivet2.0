import { useDraggable } from '@dnd-kit/core';
import { type ChartNode, type NodeConnection } from '@ironclad/rivet-core';
import { type FC, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useMemo } from 'react';
import { VisualNode } from './VisualNode.js';
import { ErrorBoundary } from 'react-error-boundary';
import { type ProcessDataForNode } from '../state/dataFlow';
import { useCanvasViewContext } from './CanvasContext';
import { type DragActivatorModifierState, type DragMode } from '../hooks/useDraggingNode.js';

interface DraggableNodeProps {
  dragMode: DragMode;
  renderSkeleton?: boolean;
  node: ChartNode;
  connections?: NodeConnection[];
  isSelected?: boolean;
  isKnownNodeType: boolean;
  lastRun?: ProcessDataForNode[];
  onDragActivatorPointerDown: (modifierState: DragActivatorModifierState) => void;
  processPage: number | 'latest';
  isPinned: boolean;
}

export const DraggableNode: FC<DraggableNodeProps> = ({
  dragMode,
  node,
  connections = [],
  isSelected = false,
  isKnownNodeType,
  lastRun,
  onDragActivatorPointerDown,
  processPage,
  isPinned,
  renderSkeleton,
}) => {
  const { canvasZoom } = useCanvasViewContext();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: node.id });
  const shouldKeepSourceNodeVisible = dragMode === 'duplicate' && isDragging;
  const handleAttributes = useMemo(
    () => ({
      ...(listeners ?? {}),
      onMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
        onDragActivatorPointerDown({ altKey: event.altKey });
      },
      onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
        onDragActivatorPointerDown({ altKey: event.altKey });
      },
    }),
    [listeners, onDragActivatorPointerDown],
  );

  return (
    <ErrorBoundary fallback={<div>Failed to render node</div>}>
      <VisualNode
        ref={setNodeRef}
        isSelected={isSelected}
        node={node}
        connections={connections}
        isDragging={isDragging && !shouldKeepSourceNodeVisible}
        xDelta={transform && !shouldKeepSourceNodeVisible ? transform.x / canvasZoom : 0}
        yDelta={transform && !shouldKeepSourceNodeVisible ? transform.y / canvasZoom : 0}
        nodeAttributes={attributes}
        handleAttributes={handleAttributes}
        isKnownNodeType={isKnownNodeType}
        lastRun={lastRun}
        processPage={processPage}
        isPinned={isPinned}
        renderSkeleton={renderSkeleton}
      />
    </ErrorBoundary>
  );
};
