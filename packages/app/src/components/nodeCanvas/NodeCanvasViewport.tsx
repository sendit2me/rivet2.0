import { DragOverlay } from '@dnd-kit/core';
import { type FC, type ContextType, memo, useMemo } from 'react';
import type { ChartNode, NodeConnection, NodeId } from '@ironclad/rivet-core';
import { CanvasHandlersContext, CanvasViewContext } from '../CanvasContext.js';
import { DraggableNode } from '../DraggableNode.js';
import { VisualNode } from '../VisualNode.js';
import { countCanvasPerf } from './canvasPerfDebug.js';
import {
  constrainDragDeltaToAxisLock,
  type DragActivatorModifierState,
  type DragAxisLock,
  type DragMode,
} from '../../hooks/useDraggingNode.js';
import type { useNodeTypes } from '../../hooks/useNodeTypes.js';
import type { PageValue, ProcessDataForNode } from '../../state/dataFlow.js';
import { resolveDraggingExecutionContext } from './dragOverlayExecutionContext.js';

type CanvasViewValue = ContextType<typeof CanvasViewContext>;
type CanvasHandlersValue = ContextType<typeof CanvasHandlersContext>;
type NodeTypes = ReturnType<typeof useNodeTypes>;

export interface NodeCanvasViewportProps {
  canvasHandlersContextValue: CanvasHandlersValue;
  canvasPositionX: number;
  canvasPositionY: number;
  canvasZoom: number;
  canvasViewContextValue: CanvasViewValue;
  dragAxisLock: DragAxisLock;
  dragMode: DragMode;
  draggingHoverControlSourceNodeIds: NodeId[];
  draggingNodeConnections: NodeConnection[];
  draggingNodes: ChartNode[];
  draggingSourceNodeIds: NodeId[];
  heavyContentNodeIdSet: ReadonlySet<NodeId>;
  hoveredNodeId: NodeId | undefined;
  lastRunPerNode: Record<NodeId, ProcessDataForNode[] | undefined>;
  nodeTypes: NodeTypes;
  nodesWithConnections: Array<{ node: ChartNode; nodeConnections: NodeConnection[] }>;
  onNodeDragActivatorPointerDown: (modifierState: DragActivatorModifierState) => void;
  expandedOutputNodeIds: NodeId[];
  searchMatchingNodeIds: NodeId[];
  selectedNodeIds: NodeId[];
  selectedProcessPagePerNode: Record<NodeId, PageValue>;
  visibleNodeIdSet: ReadonlySet<NodeId>;
}

export const NodeCanvasViewport: FC<NodeCanvasViewportProps> = ({
  canvasPositionX,
  canvasPositionY,
  canvasZoom,
  ...sceneProps
}) => {
  return (
    <div
      className="canvas-contents"
      style={{
        transform: `scale(${canvasZoom}, ${canvasZoom}) translate(${canvasPositionX}px, ${canvasPositionY}px)`,
      }}
    >
      <NodeCanvasScene canvasZoom={canvasZoom} {...sceneProps} />
    </div>
  );
};

const NodeCanvasScene: FC<Omit<NodeCanvasViewportProps, 'canvasPositionX' | 'canvasPositionY'>> = memo(
  ({
    canvasHandlersContextValue,
    canvasViewContextValue,
    canvasZoom,
    dragAxisLock,
    dragMode,
    draggingHoverControlSourceNodeIds,
    draggingNodeConnections,
    draggingNodes,
    draggingSourceNodeIds,
    heavyContentNodeIdSet,
    hoveredNodeId,
    lastRunPerNode,
    nodeTypes,
    nodesWithConnections,
    onNodeDragActivatorPointerDown,
    expandedOutputNodeIds,
    searchMatchingNodeIds,
    selectedNodeIds,
    selectedProcessPagePerNode,
    visibleNodeIdSet,
  }) => {
    countCanvasPerf('NodeCanvasScene:renders');
    const draggingNodeIdSet = useMemo(() => new Set(draggingNodes.map((node) => node.id)), [draggingNodes]);
    const draggingHoverControlSourceNodeIdSet = useMemo(
      () => new Set(draggingHoverControlSourceNodeIds),
      [draggingHoverControlSourceNodeIds],
    );
    const expandedOutputNodeIdSet = useMemo(() => new Set(expandedOutputNodeIds), [expandedOutputNodeIds]);
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const searchMatchingNodeIdSet = useMemo(() => new Set(searchMatchingNodeIds), [searchMatchingNodeIds]);

    return (
      <CanvasViewContext.Provider value={canvasViewContextValue}>
        <CanvasHandlersContext.Provider value={canvasHandlersContextValue}>
          <div className="nodes">
            {nodesWithConnections.map(({ node, nodeConnections }) => {
              if (!visibleNodeIdSet.has(node.id) || draggingNodeIdSet.has(node.id)) {
                return null;
              }

              return (
                <DraggableNode
                  key={node.id}
                  dragAxisLock={dragAxisLock}
                  dragMode={dragMode}
                  node={node}
                  connections={nodeConnections}
                  isHovered={hoveredNodeId === node.id}
                  isSelected={selectedNodeIdSet.has(node.id) || searchMatchingNodeIdSet.has(node.id)}
                  isKnownNodeType={node.type in nodeTypes}
                  lastRun={lastRunPerNode[node.id]}
                  onDragActivatorPointerDown={onNodeDragActivatorPointerDown}
                  isOutputExpanded={expandedOutputNodeIdSet.has(node.id)}
                  processPage={selectedProcessPagePerNode[node.id]!}
                  renderHeavyContent={heavyContentNodeIdSet.has(node.id)}
                />
              );
            })}
          </div>
          <DragOverlay
            dropAnimation={null}
            style={{ position: 'absolute', top: 0, left: 0 }}
            modifiers={[
              (args) => {
                const constrainedTransform = constrainDragDeltaToAxisLock(args.transform, dragAxisLock);

                return {
                  ...constrainedTransform,
                  scaleX: 1,
                  scaleY: 1,
                  x: constrainedTransform.x / canvasZoom,
                  y: constrainedTransform.y / canvasZoom,
                };
              },
            ]}
          >
            {draggingNodes.map((node, index) => {
              const { isOutputExpanded, lastRun, processPage } = resolveDraggingExecutionContext({
                dragMode,
                draggingNodeId: node.id,
                draggingSourceNodeIds,
                index,
                expandedOutputNodeIdSet,
                lastRunPerNode,
                selectedProcessPagePerNode,
              });

              return (
                <VisualNode
                  key={node.id}
                  node={node}
                  connections={draggingNodeConnections}
                  isOverlay
                  isKnownNodeType={node.type in nodeTypes}
                  isOutputExpanded={isOutputExpanded}
                  lastRun={lastRun}
                  processPage={processPage}
                  renderHeavyContent
                  shouldShowHoverControls={draggingHoverControlSourceNodeIdSet.has(
                    draggingSourceNodeIds[index] ?? node.id,
                  )}
                />
              );
            })}
          </DragOverlay>
        </CanvasHandlersContext.Provider>
      </CanvasViewContext.Provider>
    );
  },
);

NodeCanvasScene.displayName = 'NodeCanvasScene';
