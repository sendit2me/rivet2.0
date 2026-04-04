import { useCallback, useEffect, useRef } from 'react';
import { type NodeConnection, type NodeId, type PortId } from '@ironclad/rivet-core';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { connectionsState, ioDefinitionsForNodeState, nodesByIdState } from '../state/graph.js';
import { draggingWireClosestPortState, draggingWireState } from '../state/graphBuilder.js';
import { useLatest } from 'ahooks';
import { useMakeConnectionCommand } from '../commands/makeConnectionCommand';
import { useBreakConnectionCommand } from '../commands/breakConnectionCommand';
import { useRewireConnectionCommand } from '../commands/rewireConnectionCommand.js';
import { resolveWireDragAction, shouldContinueDraggingAfterWireAction } from '../domain/graphEditing/wireDragActions.js';
import { canvasIoDefinitionsForNodeState } from '../state/selectors/canvasGraphSelectors.js';

export const useDraggingWire = (onConnectionsChanged: (connections: NodeConnection[]) => void) => {
  const [draggingWire, setDraggingWire] = useAtom(draggingWireState);
  const store = useStore();
  const connections = useAtomValue(connectionsState);
  const nodesById = useAtomValue(nodesByIdState);
  const [closestPortToDraggingWire, setClosestPortToDraggingWire] = useAtom(draggingWireClosestPortState);
  const isDragging = !!draggingWire;

  const latestClosestPort = useLatest(closestPortToDraggingWire);
  const latestDraggingWire = useLatest(draggingWire);
  const skipNextWindowMouseUpRef = useRef(false);

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
    setDraggingWire(undefined);
    setClosestPortToDraggingWire(undefined);
  }, [setClosestPortToDraggingWire, setDraggingWire]);

  const continueDraggingWire = useCallback(
    (wire: NonNullable<typeof draggingWire>) => {
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
      setDraggingWire({ startNodeId, startPortId, startPortIsInput: isInput, dataType: def.dataType });
    },
    [clearDraggingWire, connections, store, setDraggingWire],
  );

  const onWireEndDrag = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!latestDraggingWire.current) {
        return;
      }

      const { nodeId: endNodeId, portId: endPortId } = closestPortToDraggingWire ?? {};
      event.stopPropagation();

      skipNextWindowMouseUpRef.current = true;
      finalizeWireDrag({
        dropTarget: endNodeId && endPortId ? { nodeId: endNodeId, portId: endPortId } : undefined,
        keepDragging: event.ctrlKey || event.metaKey,
      });
    },
    [closestPortToDraggingWire, finalizeWireDrag, latestDraggingWire],
  );

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      if (skipNextWindowMouseUpRef.current) {
        skipNextWindowMouseUpRef.current = false;
        return;
      }

      if (!latestDraggingWire.current || event.type !== 'mouseup') {
        return;
      }

      finalizeWireDrag({
        dropTarget: latestClosestPort.current
          ? {
              nodeId: latestClosestPort.current.nodeId,
              portId: latestClosestPort.current.portId,
            }
          : undefined,
        keepDragging: event.ctrlKey || event.metaKey,
      });
    };

    window.addEventListener('mouseup', handleWindowClick);
    return () => {
      window.removeEventListener('mouseup', handleWindowClick);
    };
  }, [finalizeWireDrag, latestClosestPort, latestDraggingWire]);

  return {
    draggingWire,
    onWireStartDrag,
    onWireEndDrag,
  };
};
