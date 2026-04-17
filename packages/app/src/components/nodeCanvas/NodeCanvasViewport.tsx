import { DragOverlay } from '@dnd-kit/core';
import { type FC, type ContextType, useMemo } from 'react';
import type { ChartNode, NodeConnection, NodeId } from '@ironclad/rivet-core';
import { CanvasHandlersContext, CanvasViewContext } from '../CanvasContext.js';
import { DraggableNode } from '../DraggableNode.js';
import { VisualNode } from '../VisualNode.js';
import { type DragActivatorModifierState, type DragMode } from '../../hooks/useDraggingNode.js';
import type { useNodeTypes } from '../../hooks/useNodeTypes.js';
import type { PageValue, ProcessDataForNode } from '../../state/dataFlow.js';

type CanvasViewValue = ContextType<typeof CanvasViewContext>;
type CanvasHandlersValue = ContextType<typeof CanvasHandlersContext>;
type NodeTypes = ReturnType<typeof useNodeTypes>;

export interface NodeCanvasViewportProps {
  canvasHandlersContextValue: CanvasHandlersValue;
  canvasPositionX: number;
  canvasPositionY: number;
  canvasZoom: number;
  canvasViewContextValue: CanvasViewValue;
  dragMode: DragMode;
  draggingNodeConnections: NodeConnection[];
  draggingNodes: ChartNode[];
  hoveredNodeId: NodeId | undefined;
  isNodeVisible: (node: ChartNode) => boolean;
  lastRunPerNode: Record<NodeId, ProcessDataForNode[] | undefined>;
  nodeTypes: NodeTypes;
  nodesWithConnections: Array<{ node: ChartNode; nodeConnections: NodeConnection[] }>;
  onNodeDragActivatorPointerDown: (modifierState: DragActivatorModifierState) => void;
  expandedOutputNodeIds: NodeId[];
  searchMatchingNodeIds: NodeId[];
  selectedNodeIds: NodeId[];
  selectedProcessPagePerNode: Record<NodeId, PageValue>;
}

export const NodeCanvasViewport: FC<NodeCanvasViewportProps> = ({
  canvasHandlersContextValue,
  canvasPositionX,
  canvasPositionY,
  canvasZoom,
  canvasViewContextValue,
  dragMode,
  draggingNodeConnections,
  draggingNodes,
  hoveredNodeId,
  isNodeVisible,
  lastRunPerNode,
  nodeTypes,
  nodesWithConnections,
  onNodeDragActivatorPointerDown,
  expandedOutputNodeIds,
  searchMatchingNodeIds,
  selectedNodeIds,
  selectedProcessPagePerNode,
}) => {
  const draggingNodeIdSet = useMemo(() => new Set(draggingNodes.map((node) => node.id)), [draggingNodes]);
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const searchMatchingNodeIdSet = useMemo(() => new Set(searchMatchingNodeIds), [searchMatchingNodeIds]);

  return (
    <div
      className="canvas-contents"
      style={{
        transform: `scale(${canvasZoom}, ${canvasZoom}) translate(${canvasPositionX}px, ${canvasPositionY}px)`,
      }}
    >
      <CanvasViewContext.Provider value={canvasViewContextValue}>
        <CanvasHandlersContext.Provider value={canvasHandlersContextValue}>
          <div className="nodes">
            {nodesWithConnections.map(({ node, nodeConnections }) => {
              if (!isNodeVisible(node) || draggingNodeIdSet.has(node.id)) {
                return null;
              }

              return (
                <DraggableNode
                  key={node.id}
                  dragMode={dragMode}
                  node={node}
                  connections={nodeConnections}
                  isHovered={hoveredNodeId === node.id}
                  isSelected={selectedNodeIdSet.has(node.id) || searchMatchingNodeIdSet.has(node.id)}
                  isKnownNodeType={node.type in nodeTypes}
                  lastRun={lastRunPerNode[node.id]}
                  onDragActivatorPointerDown={onNodeDragActivatorPointerDown}
                  isOutputExpanded={expandedOutputNodeIds.includes(node.id)}
                  processPage={selectedProcessPagePerNode[node.id]!}
                />
              );
            })}
          </div>
          <DragOverlay
            dropAnimation={null}
            style={{ position: 'absolute', top: 0, left: 0 }}
            modifiers={[
              (args) => ({
                scaleX: 1,
                scaleY: 1,
                x: args.transform.x / canvasZoom,
                y: args.transform.y / canvasZoom,
              }),
            ]}
          >
            {draggingNodes.map((node) => (
              <VisualNode
                key={node.id}
                node={node}
                connections={draggingNodeConnections}
                isOverlay
                isKnownNodeType={node.type in nodeTypes}
                isOutputExpanded={expandedOutputNodeIds.includes(node.id)}
                processPage={selectedProcessPagePerNode[node.id]!}
              />
            ))}
          </DragOverlay>
        </CanvasHandlersContext.Provider>
      </CanvasViewContext.Provider>
    </div>
  );
};
