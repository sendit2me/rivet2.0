import { CSSTransition } from 'react-transition-group';
import { type FC, type RefObject, type CSSProperties, type Ref } from 'react';
import type { NodeConnection, NodeId, PortId } from '@rivet2/rivet-core';
import { ContextMenu, type ContextMenuContext } from '../ContextMenu.js';
import { PortInfo } from '../PortInfo.js';
import { WireLayer } from '../WireLayer.js';
import type { PortPositions } from '../NodeCanvas.js';
import type { HoveringPort } from '../../hooks/usePortHoverTooltip.js';
import type { DraggingWireDef } from '../../state/graphBuilder.js';

export interface SelectionBoxState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeCanvasOverlaysProps {
  connections: NodeConnection[];
  context: ContextMenuContext;
  contextMenuDisabled: boolean;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  contextMenuX: number;
  contextMenuY: number;
  draggingNode: boolean;
  draggingWire: DraggingWireDef | undefined;
  floatingStyles: CSSProperties;
  highlightedNodes: NodeId[];
  highlightedPort:
    | {
        nodeId: NodeId;
        isInput: boolean;
        portId: PortId;
      }
    | undefined;
  hoveringPort: HoveringPort | undefined;
  hoveringShowPortInfo: boolean;
  isViewportMoving: boolean;
  isViewportVisibilitySettled: boolean;
  nearViewportNodeIdSet: ReadonlySet<NodeId>;
  nodePortPositions: PortPositions;
  onContextMenuExited: () => void;
  onContextMenuEntered: () => void;
  onContextMenuItemSelected: (itemId: string, data: unknown, context: ContextMenuContext, meta: { x: number; y: number }) => void;
  selectionBox: SelectionBoxState | null;
  setFloating: (node: HTMLElement | null) => void;
  shouldRenderWires: boolean;
  showContextMenu: boolean;
  visibleNodeIdSet: ReadonlySet<NodeId>;
}

export const NodeCanvasOverlays: FC<NodeCanvasOverlaysProps> = ({
  connections,
  context,
  contextMenuDisabled,
  contextMenuRef,
  contextMenuX,
  contextMenuY,
  draggingNode,
  draggingWire,
  floatingStyles,
  highlightedNodes,
  highlightedPort,
  hoveringPort,
  hoveringShowPortInfo,
  isViewportMoving,
  isViewportVisibilitySettled,
  nearViewportNodeIdSet,
  nodePortPositions,
  onContextMenuExited,
  onContextMenuEntered,
  onContextMenuItemSelected,
  selectionBox,
  setFloating,
  shouldRenderWires,
  showContextMenu,
  visibleNodeIdSet,
}) => {
  return (
    <>
      <CSSTransition
        nodeRef={contextMenuRef as unknown as RefObject<HTMLElement>}
        in={showContextMenu}
        timeout={200}
        classNames="context-menu"
        onEnter={onContextMenuEntered}
        onExited={onContextMenuExited}
      >
        <ContextMenu
          disabled={contextMenuDisabled}
          ref={contextMenuRef as unknown as Ref<HTMLDivElement>}
          x={contextMenuX}
          y={contextMenuY}
          context={context}
          onMenuItemSelected={onContextMenuItemSelected}
        />
      </CSSTransition>
      {selectionBox && (
        <div
          className="selection-box"
          style={{
            left: selectionBox.width < 0 ? selectionBox.x + selectionBox.width : selectionBox.x,
            top: selectionBox.height < 0 ? selectionBox.y + selectionBox.height : selectionBox.y,
            width: Math.abs(selectionBox.width),
            height: Math.abs(selectionBox.height),
          }}
        />
      )}
      {shouldRenderWires && (
        <WireLayer
          connections={connections}
          draggingWire={draggingWire}
          highlightedNodes={highlightedNodes}
          highlightedPort={highlightedPort}
          isViewportMoving={isViewportMoving}
          isViewportVisibilitySettled={isViewportVisibilitySettled}
          nearViewportNodeIdSet={nearViewportNodeIdSet}
          portPositions={nodePortPositions}
          visibleNodeIdSet={visibleNodeIdSet}
          draggingNode={draggingNode}
        />
      )}
      {hoveringPort && hoveringShowPortInfo && (
        <PortInfo floatingStyles={floatingStyles} ref={setFloating} port={hoveringPort} />
      )}
    </>
  );
};
