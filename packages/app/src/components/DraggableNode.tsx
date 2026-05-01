import { useDraggable } from '@dnd-kit/core';
import { type ChartNode, type NodeConnection } from '@ironclad/rivet-core';
import {
  type FC,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  memo,
  useMemo,
} from 'react';
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
  isSearchMatch?: boolean;
  isKnownNodeType: boolean;
  lastRun?: ProcessDataForNode[];
  onDragActivatorPointerDown: (modifierState: DragActivatorModifierState) => void;
  processPage: number | 'latest';
  isOutputExpanded: boolean;
  renderHeavyContent: boolean;
}

export const DraggableNode: FC<DraggableNodeProps> = memo(
  ({
    dragAxisLock,
    dragMode,
    node,
    connections = [],
    isSelected = false,
    isHovered = false,
    isSearchMatch = false,
    isKnownNodeType,
    lastRun,
    onDragActivatorPointerDown,
    processPage,
    isOutputExpanded,
    renderHeavyContent,
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
          onDragActivatorPointerDown({
            altKey: event.altKey,
            hoverControlsVisible: isHovered,
            nodeId: node.id,
            shiftKey: event.shiftKey,
          });
        },
        onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
          onDragActivatorPointerDown({
            altKey: event.altKey,
            hoverControlsVisible: isHovered,
            nodeId: node.id,
            shiftKey: event.shiftKey,
          });
        },
      }),
      [isHovered, listeners, node.id, onDragActivatorPointerDown],
    );

    return (
      <ErrorBoundary fallback={<div>Failed to render node</div>}>
        <VisualNode
          ref={setNodeRef}
          isSelected={isSelected}
          isHovered={isHovered}
          isSearchMatch={isSearchMatch}
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
          renderHeavyContent={renderHeavyContent}
          renderSkeleton={renderSkeleton}
        />
      </ErrorBoundary>
    );
  },
);

DraggableNode.displayName = 'DraggableNode';
