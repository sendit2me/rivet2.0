import { type NodeInputDefinition, type NodeId, type PortId } from '@rivet2/rivet-core';

export type WireDropTarget = {
  nodeId: NodeId;
  portId: PortId;
  element: HTMLElement;
  definition: NodeInputDefinition;
};

export function resolveClosestWireDropTargetFromPoint(options: {
  clientX: number;
  clientY: number;
  getInputDefinition: (nodeId: NodeId, portId: PortId) => NodeInputDefinition | undefined;
}): WireDropTarget | undefined {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') {
    return undefined;
  }

  let closestHoverElement: HTMLElement | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const element of document.elementsFromPoint(options.clientX, options.clientY)) {
    if (!(element instanceof HTMLElement) || !element.classList.contains('port-hover-area')) {
      continue;
    }

    const bounds = element.getBoundingClientRect();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const distance = Math.hypot(options.clientX - centerX, options.clientY - centerY);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestHoverElement = element;
    }
  }

  const portElement = closestHoverElement?.parentElement as HTMLElement | null;
  const portId = portElement?.dataset.portid as PortId | undefined;
  const nodeId = portElement?.dataset.nodeid as NodeId | undefined;

  if (!portElement || !portId || !nodeId) {
    return undefined;
  }

  const definition = options.getInputDefinition(nodeId, portId);
  if (!definition?.dataType) {
    return undefined;
  }

  return {
    nodeId,
    portId,
    element: portElement,
    definition,
  };
}
