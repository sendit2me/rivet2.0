import {
  type ChartNode,
  type NodeConnection,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
  isBuiltInInputDefinition,
} from '@valerypopoff/rivet2-core';
import { type FC, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasNodeIO } from '../hooks/useGetNodeIO.js';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { Port } from './Port.js';
import { ErrorBoundary } from 'react-error-boundary';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { LoopControllerNodePorts } from './LoopControllerNodePorts';
import { useAtom, useAtomValue } from 'jotai';
import { preservePortTextCaseState } from '../state/settings.js';
import { graphMetadataState } from '../state/graph.js';
import { projectMetadataState } from '../state/savedGraphs.js';
import { useCanvasHandlersContext, useCanvasViewContext } from './CanvasContext';
import { useEditNodeCommand } from '../commands/editNodeCommand.js';
import { subGraphPortRearrangeTargetState } from '../state/ui.js';
import {
  getDefinitionPortIds,
  getSubGraphPortOrderKey,
  moveSubGraphPortIdToIndexInOrder,
  normalizeSubGraphPortOrder,
  type SubGraphPortOrderSide,
} from '../domain/graphEditing/subGraphPortOrder.js';

export type NodePortsProps = {
  node: ChartNode;
  connections: NodeConnection[];
  zoomedOut?: boolean;
};

type ReorderablePortDefinition = NodeInputDefinition | NodeOutputDefinition;
type SubGraphReorderDrag = {
  clientX: number;
  clientY: number;
  height: number;
  portId: PortId;
  pointerOffsetX: number;
  pointerOffsetY: number;
  side: SubGraphPortOrderSide;
  title: string;
  width: number;
};

function isSubGraphErrorOutputDefinition(node: ChartNode, output: NodeOutputDefinition): boolean {
  return (
    node.type === 'subGraph' &&
    (node.data as { useErrorOutput?: boolean }).useErrorOutput === true &&
    output.id === 'error' &&
    output.title === 'Error'
  );
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getOrderedPortDefinitions<T extends ReorderablePortDefinition>(
  definitions: readonly T[],
  portOrder: readonly string[] | undefined,
): T[] {
  const definitionsById = new Map<string, T>(definitions.map((definition) => [definition.id, definition]));

  return normalizeSubGraphPortOrder(getDefinitionPortIds(definitions), portOrder)
    .map((id) => definitionsById.get(id))
    .filter((definition): definition is T => !!definition);
}

function getSubGraphPortOrderFromPoint({
  clientY,
  nodeId,
  portIds,
  portOrder,
  side,
  sourcePortId,
}: {
  clientY: number;
  nodeId: string;
  portIds: readonly string[];
  portOrder: readonly string[] | undefined;
  side: SubGraphPortOrderSide;
  sourcePortId: PortId;
}): string[] | undefined {
  const portElements = Array.from(document.querySelectorAll<HTMLElement>('[data-reorder-nodeid][data-reorder-portid]'))
    .filter((element) => element.dataset.reorderNodeid === nodeId && element.dataset.reorderPortside === side);

  if (!portElements.length) {
    return undefined;
  }

  let insertionIndex = portElements.length;

  for (const [index, element] of portElements.entries()) {
    const rect = element.getBoundingClientRect();

    if (clientY < rect.top + rect.height / 2) {
      insertionIndex = index;
      break;
    }
  }

  const sourceIndex = portElements.findIndex((element) => element.dataset.reorderPortid === sourcePortId);

  if (sourceIndex < 0) {
    return undefined;
  }

  const targetIndex = insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex;

  return moveSubGraphPortIdToIndexInOrder({
    portIds,
    portOrder,
    sourcePortId,
    targetIndex,
  });
}

export const NodePortsRenderer: FC<NodePortsProps> = ({ ...props }) => {
  return (
    <ErrorBoundary fallback={<div />}>
      {props.node.type === 'loopController' ? <LoopControllerNodePorts {...props} /> : <NodePorts {...props} />}
    </ErrorBoundary>
  );
};

export const NodePorts: FC<NodePortsProps> = ({
  node,
  connections,
}) => {
  const { draggingWire, closestPortToDraggingWire } = useCanvasViewContext();
  const { onPortMouseOut, onPortMouseOver, onWireEndDrag, onWireStartDrag } = useCanvasHandlersContext();
  const { inputDefinitions, outputDefinitions } = useCanvasNodeIO(node.id)!;
  const preservePortTextCase = useAtomValue(preservePortTextCaseState);
  const projectId = useAtomValue(projectMetadataState).id;
  const graphId = useAtomValue(graphMetadataState)?.id;
  const [subGraphPortRearrangeTarget, setSubGraphPortRearrangeTarget] = useAtom(subGraphPortRearrangeTargetState);
  const editNode = useEditNodeCommand();
  const portsRootRef = useRef<HTMLDivElement>(null);
  const draggedPortRef = useRef<SubGraphReorderDrag | undefined>();
  const previewPortOrderRef = useRef<string[] | undefined>();
  const [draggedPort, setDraggedPort] = useState<SubGraphReorderDrag | undefined>();
  const [previewPortOrder, setPreviewPortOrder] = useState<string[] | undefined>();

  const isSubGraphNode = node.type === 'subGraph';
  const isRearrangingSubGraphPorts =
    isSubGraphNode &&
    subGraphPortRearrangeTarget?.projectId === projectId &&
    subGraphPortRearrangeTarget?.graphId === graphId &&
    subGraphPortRearrangeTarget?.nodeId === node.id;
  const renderedInputDefinitions = useMemo(
    () => inputDefinitions.filter((input) => !isBuiltInInputDefinition(input)),
    [inputDefinitions],
  );
  const reorderableOutputDefinitions = useMemo(
    () => outputDefinitions.filter((output) => !isSubGraphErrorOutputDefinition(node, output)),
    [node, outputDefinitions],
  );
  const nonReorderableOutputDefinitions = useMemo(
    () => outputDefinitions.filter((output) => isSubGraphErrorOutputDefinition(node, output)),
    [node, outputDefinitions],
  );
  const displayedInputDefinitions =
    draggedPort?.side === 'input' && previewPortOrder
      ? getOrderedPortDefinitions(renderedInputDefinitions, previewPortOrder)
      : renderedInputDefinitions;
  const displayedOutputDefinitions =
    isSubGraphNode && draggedPort?.side === 'output' && previewPortOrder
      ? [
          ...getOrderedPortDefinitions(reorderableOutputDefinitions, previewPortOrder),
          ...nonReorderableOutputDefinitions,
        ]
      : outputDefinitions;

  const handlePortMouseDown = useStableCallback((event: MouseEvent<HTMLDivElement>, port: PortId, isInput: boolean) => {
    event.stopPropagation();
    event.preventDefault();
    onWireStartDrag?.(event, node.id, port, isInput);
  });

  const handlePortMouseUp = useStableCallback((event: MouseEvent<HTMLDivElement>, port: PortId) => {
    onWireEndDrag?.(event, node.id, port);
  });

  const commitSubGraphPortReorder = useStableCallback(
    (side: SubGraphPortOrderSide, nextPortOrder: string[] | undefined) => {
      if (!isSubGraphNode || !nextPortOrder) {
        return;
      }

      const definitions = side === 'input' ? renderedInputDefinitions : reorderableOutputDefinitions;
      const orderKey = getSubGraphPortOrderKey(side);
      const nodeData = node.data as Record<string, unknown> & {
        inputPortOrder?: string[];
        outputPortOrder?: string[];
      };
      const currentPortOrder = orderKey === 'inputPortOrder' ? nodeData.inputPortOrder : nodeData.outputPortOrder;
      const normalizedCurrentPortOrder = normalizeSubGraphPortOrder(getDefinitionPortIds(definitions), currentPortOrder);

      if (areStringArraysEqual(nextPortOrder, normalizedCurrentPortOrder)) {
        return;
      }

      editNode({
        nodeId: node.id,
        newNode: {
          data: {
            ...nodeData,
            [orderKey]: nextPortOrder,
          },
        },
        previousNodeOverride: node,
        mergeWithPrevious: false,
      });
    },
  );

  const updatePreviewPortOrderFromPointer = useStableCallback((clientY: number, drag: SubGraphReorderDrag) => {
    const definitions = drag.side === 'input' ? renderedInputDefinitions : reorderableOutputDefinitions;
    const portIds = getDefinitionPortIds(definitions);

    if (!portIds.length) {
      return;
    }

    const nextPortOrder = getSubGraphPortOrderFromPoint({
      clientY,
      nodeId: node.id,
      portIds,
      portOrder: previewPortOrderRef.current,
      side: drag.side,
      sourcePortId: drag.portId,
    });

    if (!nextPortOrder) {
      return;
    }

    previewPortOrderRef.current = nextPortOrder;
    setPreviewPortOrder(nextPortOrder);
  });

  const handleReorderMouseDown = useStableCallback(
    (event: MouseEvent<HTMLDivElement>, port: PortId, isInput: boolean, title: string) => {
      if (!isRearrangingSubGraphPorts) {
        return;
      }

      const side: SubGraphPortOrderSide = isInput ? 'input' : 'output';
      const definitions = side === 'input' ? renderedInputDefinitions : reorderableOutputDefinitions;
      const orderKey = getSubGraphPortOrderKey(side);
      const nodeData = node.data as {
        inputPortOrder?: string[];
        outputPortOrder?: string[];
      };
      const currentPortOrder = orderKey === 'inputPortOrder' ? nodeData.inputPortOrder : nodeData.outputPortOrder;
      const normalizedPortOrder = normalizeSubGraphPortOrder(getDefinitionPortIds(definitions), currentPortOrder);
      const labelRect = event.currentTarget.getBoundingClientRect();
      const drag = {
        clientX: event.clientX,
        clientY: event.clientY,
        height: labelRect.height,
        portId: port,
        pointerOffsetX: event.clientX - labelRect.left,
        pointerOffsetY: event.clientY - labelRect.top,
        side,
        title,
        width: labelRect.width,
      };

      draggedPortRef.current = drag;
      previewPortOrderRef.current = normalizedPortOrder;
      setDraggedPort(drag);
      setPreviewPortOrder(normalizedPortOrder);
    },
  );

  const draggedPortKey = draggedPort ? `${draggedPort.side}:${draggedPort.portId}` : undefined;

  useEffect(() => {
    if (!isRearrangingSubGraphPorts) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const nodeElement = portsRootRef.current?.closest('.node');

      if (!(target instanceof Node) || nodeElement?.contains(target)) {
        return;
      }

      setSubGraphPortRearrangeTarget(undefined);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isRearrangingSubGraphPorts, setSubGraphPortRearrangeTarget]);

  useEffect(() => {
    if (!draggedPortKey) {
      return;
    }

    document.body.classList.add('subgraph-port-reorder-dragging');

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const currentDrag = draggedPortRef.current;

      if (!currentDrag) {
        return;
      }

      const nextDrag = {
        ...currentDrag,
        clientX: event.clientX,
        clientY: event.clientY,
      };

      draggedPortRef.current = nextDrag;
      setDraggedPort(nextDrag);
      updatePreviewPortOrderFromPointer(event.clientY, nextDrag);
    };

    const handleMouseUp = (event: globalThis.MouseEvent) => {
      const currentDrag = draggedPortRef.current;

      if (currentDrag) {
        updatePreviewPortOrderFromPointer(event.clientY, currentDrag);
        commitSubGraphPortReorder(currentDrag.side, previewPortOrderRef.current);
      }

      draggedPortRef.current = undefined;
      previewPortOrderRef.current = undefined;
      setDraggedPort(undefined);
      setPreviewPortOrder(undefined);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true });

    return () => {
      document.body.classList.remove('subgraph-port-reorder-dragging');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [commitSubGraphPortReorder, draggedPortKey, updatePreviewPortOrderFromPointer]);

  useDependsOnPlugins();

  return (
    <>
      <div
        className={`node-ports${isRearrangingSubGraphPorts ? ' subgraph-port-rearrange-mode' : ''}`}
        ref={portsRootRef}
      >
        <div className="input-ports">
          {displayedInputDefinitions.map((input) => {
            const connected =
              connections.some((conn) => conn.inputNodeId === node.id && conn.inputId === input.id) ||
              (draggingWire?.endNodeId === node.id && draggingWire?.endPortId === input.id);

            return (
              <Port
                title={input.title}
                id={input.id}
                preservePortCase={preservePortTextCase}
                input
                connected={connected}
                key={`input-${input.id}`}
                nodeId={node.id}
                canDragTo={draggingWire ? !draggingWire.startPortIsInput : false}
                closest={closestPortToDraggingWire?.nodeId === node.id && closestPortToDraggingWire.portId === input.id}
                definition={input}
                draggingDataType={draggingWire?.dataType}
                onMouseDown={handlePortMouseDown}
                onMouseUp={handlePortMouseUp}
                onMouseOver={onPortMouseOver}
                onMouseOut={onPortMouseOut}
                reorderable={isRearrangingSubGraphPorts}
                reorderDragging={draggedPort?.side === 'input' && draggedPort.portId === input.id}
                onReorderMouseDown={handleReorderMouseDown}
              />
            );
          })}
        </div>
        <div className="output-ports">
          {displayedOutputDefinitions.map((output) => {
            const connected =
              connections.some((conn) => conn.outputNodeId === node.id && conn.outputId === output.id) ||
              (draggingWire?.startNodeId === node.id && draggingWire?.startPortId === output.id);
            const reorderable = isRearrangingSubGraphPorts && !isSubGraphErrorOutputDefinition(node, output);

            return (
              <Port
                preservePortCase={preservePortTextCase}
                title={output.title}
                id={output.id}
                connected={connected}
                key={`output-${output.id}`}
                nodeId={node.id}
                canDragTo={draggingWire ? draggingWire.startPortIsInput : false}
                closest={closestPortToDraggingWire?.nodeId === node.id && closestPortToDraggingWire.portId === output.id}
                definition={output}
                draggingDataType={draggingWire?.dataType}
                onMouseDown={handlePortMouseDown}
                onMouseUp={handlePortMouseUp}
                onMouseOver={onPortMouseOver}
                onMouseOut={onPortMouseOut}
                reorderable={reorderable}
                reorderDragging={draggedPort?.side === 'output' && draggedPort.portId === output.id}
                onReorderMouseDown={handleReorderMouseDown}
              />
            );
          })}
        </div>
      </div>
      {draggedPort &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              background: 'color-mix(in srgb, var(--primary, #ff9900) 18%, var(--grey-darkest, #1f1f1f) 82%)',
              border: '1px solid color-mix(in srgb, var(--primary, #ff9900) 42%, transparent)',
              borderRadius: 'calc(6px * var(--ui-font-scale, 1))',
              boxSizing: 'border-box',
              boxShadow: '0 8px 18px rgba(0, 0, 0, 0.35)',
              color: 'var(--grey-lightest, #ffffff)',
              fontFamily: 'var(--font-family-monospace, monospace)',
              fontSize: 'var(--ui-font-size-2xs, 12px)',
              height: draggedPort.height,
              letterSpacing: preservePortTextCase ? undefined : '1px',
              left: draggedPort.clientX - draggedPort.pointerOffsetX,
              lineHeight: '16px',
              opacity: 0.95,
              padding: '2px 6px',
              pointerEvents: 'none',
              position: 'fixed',
              textTransform: preservePortTextCase ? undefined : 'uppercase',
              top: draggedPort.clientY - draggedPort.pointerOffsetY,
              userSelect: 'none',
              whiteSpace: 'nowrap',
              width: draggedPort.width,
              zIndex: 20000,
            }}
          >
            {draggedPort.title}
          </div>,
          document.body,
        )}
    </>
  );
};
