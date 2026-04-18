import { useDraggable } from '@dnd-kit/core';
import { type ChartNode, type NodeConnection } from '@ironclad/rivet-core';
import { type FC, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useMemo } from 'react';
import { VisualNode } from './VisualNode.js';
import { ErrorBoundary } from 'react-error-boundary';
import { type ProcessDataForNode } from '../state/dataFlow';
import { useCanvasViewContext } from './CanvasContext';
import {
  constrainDragDeltaToAxisLock,
  type DragActivatorModifierState,
  type DragAxisLock,
  type DragMode,
} from '../hooks/useDraggingNode.js';

interface DraggableNodeProps {
  dragAxisLock: DragAxisLock;
  dragMode: DragMode;
  renderSkeleton?: boolean;
  node: ChartNode;
  connections?: NodeConnection[];
  isSelected?: boolean;
  isHovered?: boolean;
  isKnownNodeType: boolean;
  lastRun?: ProcessDataForNode[];
  onDragActivatorPointerDown: (modifierState: DragActivatorModifierState) => void;
  processPage: number | 'latest';
  isOutputExpanded: boolean;
}

export const DraggableNode: FC<DraggableNodeProps> = ({
  dragAxisLock,
  dragMode,
  node,
  connections = [],
  isSelected = false,
  isHovered = false,
  isKnownNodeType,
  lastRun,
  onDragActivatorPointerDown,
  processPage,
  isOutputExpanded,
  renderSkeleton,
}) => {
  const { canvasZoom } = useCanvasViewContext();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: node.id });
  const shouldKeepSourceNodeVisible = dragMode === 'duplicate' && isDragging;
  const constrainedTransform = transform ? constrainDragDeltaToAxisLock(transform, dragAxisLock) : null;
  const handleAttributes = useMemo(
    () => ({
      ...(listeners ?? {}),
      onMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
        onDragActivatorPointerDown({ altKey: event.altKey, shiftKey: event.shiftKey });
      },
      onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
        onDragActivatorPointerDown({ altKey: event.altKey, shiftKey: event.shiftKey });
      },
    }),
    [listeners, onDragActivatorPointerDown],
  );

  return (
    <ErrorBoundary fallback={<div>Failed to render node</div>}>
      <VisualNode
        ref={setNodeRef}
        isSelected={isSelected}
        isHovered={isHovered}
        node={node}
        connections={connections}
        isDragging={isDragging && !shouldKeepSourceNodeVisible}
        xDelta={constrainedTransform && !shouldKeepSourceNodeVisible ? constrainedTransform.x / canvasZoom : 0}
        yDelta={constrainedTransform && !shouldKeepSourceNodeVisible ? constrainedTransform.y / canvasZoom : 0}
        nodeAttributes={attributes}
        handleAttributes={handleAttributes}
        isKnownNodeType={isKnownNodeType}
        lastRun={lastRun}
        processPage={processPage}
        isOutputExpanded={isOutputExpanded}
        renderSkeleton={renderSkeleton}
      />
    </ErrorBoundary>
  );
};
