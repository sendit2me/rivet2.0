import { useCallback, useEffect, useRef } from 'react';
import { type NodeConnection, type NodeId, type PortId } from '@valerypopoff/rivet2-core';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { connectionsState, ioDefinitionsForNodeState, nodesByIdState } from '../state/graph.js';
import { draggingWireClosestPortState, draggingWireState } from '../state/graphBuilder.js';
import { useLatest } from 'ahooks';
import { useMakeConnectionCommand } from '../commands/makeConnectionCommand';
import { useBreakConnectionCommand } from '../commands/breakConnectionCommand';
import { useRewireConnectionCommand } from '../commands/rewireConnectionCommand.js';
import { resolveWireDragAction, shouldContinueDraggingAfterWireAction } from '../domain/graphEditing/wireDragActions.js';
import { canvasIoDefinitionsForNodeState } from '../state/selectors/canvasGraphSelectors.js';
import { resolveClosestWireDropTargetFromPoint } from '../utils/wireDropTarget.js';

const WIRE_CLICK_DISCONNECT_MOVE_THRESHOLD_PX = 3;

function shouldHandleGlobalWireMouseUpTarget(target: EventTarget | null): boolean {
  if (typeof Element !== 'undefined' && target instanceof Element && target.closest('.port-circle')) {
    return false;
  }

  return true;
}

export const useDraggingWire = (onConnectionsChanged: (connections: NodeConnection[]) => void) => {
  const [draggingWire, setDraggingWire] = useAtom(draggingWireState);
  const store = useStore();
  const connections = useAtomValue(connectionsState);
  const nodesById = useAtomValue(nodesByIdState);
  const [closestPortToDraggingWire, setClosestPortToDraggingWire] = useAtom(draggingWireClosestPortState);
  const isDragging = !!draggingWire;

  const latestDraggingWire = useLatest(draggingWire);
  const wireGestureStartRef = useRef<{ x: number; y: number } | undefined>(undefined);

  const makeConnection = useMakeConnectionCommand();
  const breakConnection = useBreakConnectionCommand();
  const rewireConnection = useRewireConnectionCommand();

  useEffect(() => {
    if (closestPortToDraggingWire && isDragging) {
      setDraggingWire((w) => ({
        ...w!,
        endNodeId: closestPortToDraggingWire.nodeId,
        endPortId: closestPortToDraggingWire.portId,
      }));
    } else if (isDragging) {
      setDraggingWire((w) => ({ ...w!, endNodeId: undefined, endPortId: undefined }));
    }
  }, [closestPortToDraggingWire, setDraggingWire, isDragging]);

  const clearDraggingWire = useCallback(() => {
    wireGestureStartRef.current = undefined;
    setDraggingWire(undefined);
    setClosestPortToDraggingWire(undefined);
  }, [setClosestPortToDraggingWire, setDraggingWire]);

  const resolveDropTargetFromPointerPosition = useCallback(
    (clientX: number, clientY: number) =>
      resolveClosestWireDropTargetFromPoint({
        clientX,
        clientY,
        getInputDefinition: (nodeId, portId) =>
          store.get(canvasIoDefinitionsForNodeState(nodeId))?.inputDefinitions.find((definition) => definition.id === portId),
      }),
    [store],
  );

  const continueDraggingWire = useCallback(
    (wire: NonNullable<typeof draggingWire>) => {
      wireGestureStartRef.current = undefined;
      setDraggingWire({
        startNodeId: wire.startNodeId,
        startPortId: wire.startPortId,
        startPortIsInput: false,
        dataType: wire.dataType,
      });
      setClosestPortToDraggingWire(undefined);
    },
    [setClosestPortToDraggingWire, setDraggingWire],
  );

  const didCurrentWireGestureMove = useCallback((clientX: number, clientY: number) => {
    const start = wireGestureStartRef.current;
    if (!start) {
      return true;
    }

    return Math.hypot(clientX - start.x, clientY - start.y) >= WIRE_CLICK_DISCONNECT_MOVE_THRESHOLD_PX;
  }, []);

  const getValidatedDropTarget = useCallback(
    (
      wire: NonNullable<typeof draggingWire>,
      dropTarget:
        | {
            nodeId: NodeId;
            portId: PortId;
          }
        | undefined,
    ) => {
      if (!dropTarget) {
        return undefined;
      }

      const inputNode = nodesById[dropTarget.nodeId];
      const outputNode = nodesById[wire.startNodeId];

      if (!inputNode || !outputNode) {
        return undefined;
      }

      const inputNodeIO = store.get(canvasIoDefinitionsForNodeState(inputNode.id));
      const outputNodeIO = store.get(canvasIoDefinitionsForNodeState(outputNode.id));

      const input = inputNodeIO?.inputDefinitions.find((definition) => definition.id === dropTarget.portId);
      const output = outputNodeIO?.outputDefinitions.find((definition) => definition.id === wire.startPortId);

      return input && output ? dropTarget : undefined;
    },
    [nodesById, store],
  );

  const finalizeWireDrag = useCallback(
    (options: {
      didMove: boolean;
      dropTarget?:
        | {
            nodeId: NodeId;
            portId: PortId;
          }
        | undefined;
      keepDragging: boolean;
    }) => {
      const activeDraggingWire = latestDraggingWire.current;

      if (!activeDraggingWire) {
        return;
      }

      const validatedDropTarget = getValidatedDropTarget(activeDraggingWire, options.dropTarget);
      const action = resolveWireDragAction({
        draggingWire: activeDraggingWire,
        didMove: options.didMove,
        dropTarget: validatedDropTarget,
      });

      if (action.type === 'makeConnection') {
        makeConnection(action.params);
      } else if (action.type === 'rewireConnection') {
        rewireConnection({
          originalConnection: action.originalConnection,
          ...action.params,
        });
      } else if (action.type === 'breakConnection') {
        breakConnection({ connectionToBreak: action.connection });
      }

      if (shouldContinueDraggingAfterWireAction(action, options.keepDragging)) {
        continueDraggingWire(activeDraggingWire);
      } else {
        clearDraggingWire();
      }
    },
    [
      breakConnection,
      clearDraggingWire,
      continueDraggingWire,
      getValidatedDropTarget,
      latestDraggingWire,
      makeConnection,
      rewireConnection,
    ],
  );

  const onWireStartDrag = useCallback(
    (event: React.MouseEvent<HTMLElement>, startNodeId: NodeId, startPortId: PortId, isInput: boolean) => {
      event.stopPropagation();

      if (isInput) {
        const existingConnection = connections.find((conn) => conn.inputNodeId === startNodeId && conn.inputId === startPortId);

        if (existingConnection) {
          const { outputId, outputNodeId } = existingConnection;

          const def = store.get(ioDefinitionsForNodeState(outputNodeId))?.outputDefinitions.find((o) => o.id === outputId);

          if (!def?.dataType) {
            clearDraggingWire();
            return;
          }

          wireGestureStartRef.current = { x: event.clientX, y: event.clientY };
          setDraggingWire({
            startNodeId: outputNodeId,
            startPortId: outputId,
            startPortIsInput: false,
            dataType: def.dataType,
            originalConnection: existingConnection,
            rewireSourceInput: {
              nodeId: startNodeId,
              portId: startPortId,
            },
          });
          return;
        }
        return;
      }

      const def = store.get(ioDefinitionsForNodeState(startNodeId))?.outputDefinitions.find((o) => o.id === startPortId);
      if (!def?.dataType) {
        clearDraggingWire();
        return;
      }
      wireGestureStartRef.current = { x: event.clientX, y: event.clientY };
      setDraggingWire({ startNodeId, startPortId, startPortIsInput: isInput, dataType: def.dataType });
    },
    [clearDraggingWire, connections, store, setDraggingWire],
  );

  const onWireEndDrag = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!latestDraggingWire.current) {
        return;
      }

      const dropTarget = resolveDropTargetFromPointerPosition(event.clientX, event.clientY);
      event.stopPropagation();

      finalizeWireDrag({
        didMove: didCurrentWireGestureMove(event.clientX, event.clientY),
        dropTarget: dropTarget ? { nodeId: dropTarget.nodeId, portId: dropTarget.portId } : undefined,
        keepDragging: event.ctrlKey || event.metaKey,
      });
    },
    [didCurrentWireGestureMove, finalizeWireDrag, latestDraggingWire, resolveDropTargetFromPointerPosition],
  );

  useEffect(() => {
    const handleWindowMouseUp = (event: MouseEvent) => {
      if (!latestDraggingWire.current || !shouldHandleGlobalWireMouseUpTarget(event.target)) {
        return;
      }

      const dropTarget = resolveDropTargetFromPointerPosition(event.clientX, event.clientY);

      finalizeWireDrag({
        didMove: didCurrentWireGestureMove(event.clientX, event.clientY),
        dropTarget: dropTarget ? { nodeId: dropTarget.nodeId, portId: dropTarget.portId } : undefined,
        keepDragging: event.ctrlKey || event.metaKey,
      });
    };

    window.addEventListener('mouseup', handleWindowMouseUp, { capture: true });
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp, { capture: true });
    };
  }, [didCurrentWireGestureMove, finalizeWireDrag, latestDraggingWire, resolveDropTargetFromPointerPosition]);

  return {
    draggingWire,
    onWireStartDrag,
    onWireEndDrag,
  };
};
