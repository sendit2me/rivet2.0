import type {
  ChartNode,
  NodeInputDefinition,
  NodeOutputDefinition,
  PortId,
} from '@valerypopoff/rivet2-core';

export type SubGraphPortOrderSide = 'input' | 'output';
export type SubGraphPortOrderKey = 'inputPortOrder' | 'outputPortOrder';

export function getSubGraphPortOrderKey(side: SubGraphPortOrderSide): SubGraphPortOrderKey {
  return side === 'input' ? 'inputPortOrder' : 'outputPortOrder';
}

export function normalizeSubGraphPortOrder(
  portIds: readonly string[],
  portOrder: readonly string[] | undefined,
): string[] {
  if (!portOrder?.length) {
    return [...portIds];
  }

  const validPortIds = new Set(portIds);
  const usedIds = new Set<string>();
  const normalizedOrder: string[] = [];

  for (const id of portOrder) {
    if (!validPortIds.has(id) || usedIds.has(id)) {
      continue;
    }

    normalizedOrder.push(id);
    usedIds.add(id);
  }

  for (const id of portIds) {
    if (!usedIds.has(id)) {
      normalizedOrder.push(id);
    }
  }

  return normalizedOrder;
}

export function getDefinitionPortIds(
  definitions: readonly (NodeInputDefinition | NodeOutputDefinition)[],
): string[] {
  return definitions.map((definition) => definition.id);
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function moveSubGraphPortIdToIndexInOrder({
  portIds,
  portOrder,
  sourcePortId,
  targetIndex,
}: {
  portIds: readonly string[];
  portOrder: readonly string[] | undefined;
  sourcePortId: PortId;
  targetIndex: number;
}): string[] | undefined {
  const currentOrder = normalizeSubGraphPortOrder(portIds, portOrder);
  const sourceIndex = currentOrder.indexOf(sourcePortId);

  if (sourceIndex < 0) {
    return undefined;
  }

  const nextOrder = [...currentOrder];
  const [sourceId] = nextOrder.splice(sourceIndex, 1);

  if (!sourceId) {
    return undefined;
  }

  const insertIndex = Math.max(0, Math.min(targetIndex, nextOrder.length));
  nextOrder.splice(insertIndex, 0, sourceId);

  return areStringArraysEqual(nextOrder, currentOrder) ? undefined : nextOrder;
}

export function renameSubGraphPortOrder(
  node: ChartNode,
  orderKey: SubGraphPortOrderKey,
  oldPortId: string,
  newPortId: string,
): { node: ChartNode; changed: boolean } {
  if (node.type !== 'subGraph') {
    return { node, changed: false };
  }

  const nodeData = node.data as Record<string, unknown>;
  const order = nodeData[orderKey];

  if (!Array.isArray(order) || !order.includes(oldPortId)) {
    return { node, changed: false };
  }

  const usedIds = new Set<string>();
  const nextOrder: string[] = [];

  for (const rawId of order) {
    if (typeof rawId !== 'string') {
      continue;
    }

    const nextId = rawId === oldPortId ? newPortId : rawId;
    if (usedIds.has(nextId)) {
      continue;
    }

    nextOrder.push(nextId);
    usedIds.add(nextId);
  }

  return {
    node: {
      ...node,
      data: {
        ...nodeData,
        [orderKey]: nextOrder,
      },
    } as ChartNode,
    changed: true,
  };
}
