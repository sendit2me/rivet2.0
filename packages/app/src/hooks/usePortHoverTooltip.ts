import { type MouseEvent, useEffect, useRef, useState } from 'react';
import type { NodeId, NodeInputDefinition, NodeOutputDefinition, PortId } from '@valerypopoff/rivet2-core';
import { useAtomValue } from 'jotai';
import { draggingWireClosestPortState } from '../state/graphBuilder.js';
import { autoUpdate, offset, shift, useFloating } from '@floating-ui/react';
import { useStableCallback } from './useStableCallback.js';

export interface HoveringPort {
  nodeId: NodeId;
  isInput: boolean;
  portId: PortId;
  definition: NodeInputDefinition | NodeOutputDefinition;
}

export function usePortHoverTooltip() {
  const [hoveringPort, setHoveringPort] = useState<HoveringPort | undefined>();
  const hoveringPortTimeout = useRef<number | undefined>();
  const [hoveringShowPortInfo, setHoveringPortShowInfo] = useState(false);

  const closestPort = useAtomValue(draggingWireClosestPortState);

  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [offset(5), shift({ crossAxis: true })],
  });

  const { setReference } = refs;

  const clearHoveringPortTimer = useStableCallback(() => {
    if (hoveringPortTimeout.current) {
      window.clearTimeout(hoveringPortTimeout.current);
      hoveringPortTimeout.current = undefined;
    }
  });

  const scheduleHoverInfo = useStableCallback((delayMs: number) => {
    clearHoveringPortTimer();
    hoveringPortTimeout.current = window.setTimeout(() => {
      setHoveringPortShowInfo(true);
      hoveringPortTimeout.current = undefined;
    }, delayMs);
  });

  useEffect(() => {
    return () => {
      clearHoveringPortTimer();
    };
  }, [clearHoveringPortTimer]);

  useEffect(() => {
    if (closestPort?.portId && closestPort.definition?.dataType && closestPort.element?.isConnected) {
      setHoveringPort({
        portId: closestPort.portId,
        nodeId: closestPort.nodeId,
        isInput: true,
        definition: closestPort.definition,
      });
      setReference(closestPort.element);
      setHoveringPortShowInfo(false);
      scheduleHoverInfo(400);
    } else {
      setHoveringPort(undefined);
      setHoveringPortShowInfo(false);
      clearHoveringPortTimer();
      setReference(null);
    }
  }, [
    clearHoveringPortTimer,
    closestPort?.portId,
    closestPort?.nodeId,
    closestPort?.definition,
    closestPort?.element,
    scheduleHoverInfo,
    setReference,
  ]);

  const onPortMouseOver = useStableCallback(
    (
      e: MouseEvent<HTMLElement>,
      nodeId: NodeId,
      isInput: boolean,
      portId: PortId,
      definition: NodeInputDefinition | NodeOutputDefinition,
    ) => {
      if (!definition.dataType) {
        setHoveringPort(undefined);
        setHoveringPortShowInfo(false);
        clearHoveringPortTimer();
        refs.setReference(null);
        return;
      }

      setHoveringPort({ nodeId, isInput, portId, definition });
      setHoveringPortShowInfo(false);
      refs.setReference((e.target as HTMLElement).closest('.port'));
      scheduleHoverInfo(700);
    },
  );

  const onPortMouseOut = useStableCallback(() => {
    setHoveringPort(undefined);
    setHoveringPortShowInfo(false);
    clearHoveringPortTimer();
    refs.setReference(null);
  });

  return {
    hoveringPort,
    hoveringShowPortInfo,
    onPortMouseOver,
    onPortMouseOut,
    floatingStyles,
    floatingRefs: refs,
  };
}
