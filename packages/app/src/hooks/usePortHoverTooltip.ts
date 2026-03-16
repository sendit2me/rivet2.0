import { type MouseEvent, useEffect, useRef, useState } from 'react';
import type { NodeId, NodeInputDefinition, NodeOutputDefinition, PortId } from '@ironclad/rivet-core';
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

  useEffect(() => {
    if (closestPort?.portId) {
      setHoveringPort({
        portId: closestPort.portId,
        nodeId: closestPort.nodeId,
        isInput: true,
        definition: closestPort.definition,
      });
      setReference(closestPort.element);

      hoveringPortTimeout.current = window.setTimeout(() => {
        setHoveringPortShowInfo(true);
      }, 400);
    } else {
      setHoveringPort(undefined);
      setHoveringPortShowInfo(false);
      if (hoveringPortTimeout.current) {
        window.clearTimeout(hoveringPortTimeout.current);
      }
    }
  }, [closestPort?.portId, closestPort?.nodeId, closestPort?.definition, closestPort?.element, setReference]);

  const onPortMouseOver = useStableCallback(
    (
      e: MouseEvent<HTMLElement>,
      nodeId: NodeId,
      isInput: boolean,
      portId: PortId,
      definition: NodeInputDefinition | NodeOutputDefinition,
    ) => {
      setHoveringPort({ nodeId, isInput, portId, definition });
      refs.setReference((e.target as HTMLElement).closest('.port'));
      hoveringPortTimeout.current = window.setTimeout(() => {
        setHoveringPortShowInfo(true);
      }, 700);
    },
  );

  const onPortMouseOut = useStableCallback(() => {
    setHoveringPort(undefined);
    setHoveringPortShowInfo(false);
    if (hoveringPortTimeout.current) {
      window.clearTimeout(hoveringPortTimeout.current);
    }
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
