import type { ChartNode } from '@ironclad/rivet-core';

export type NodeEditorGroupOpenState = Record<string, Record<string, boolean>>;

export function resolveNodeEditorGroupOpen(params: {
  state: unknown;
  nodeType: ChartNode['type'];
  groupKey: string;
  defaultOpen: boolean;
}): boolean {
  const storedValue = sanitizeNodeEditorGroupOpenState(params.state)[params.nodeType]?.[params.groupKey];

  return typeof storedValue === 'boolean' ? storedValue : params.defaultOpen;
}

export function setNodeEditorGroupOpen(
  state: unknown,
  params: {
    nodeType: ChartNode['type'];
    groupKey: string;
    isOpen: boolean;
  },
): NodeEditorGroupOpenState {
  const rootState = sanitizeNodeEditorGroupOpenState(state);

  return {
    ...rootState,
    [params.nodeType]: {
      ...rootState[params.nodeType],
      [params.groupKey]: params.isOpen,
    },
  };
}

function sanitizeNodeEditorGroupOpenState(state: unknown): NodeEditorGroupOpenState {
  if (!isRecord(state)) {
    return {};
  }

  const entries = Object.entries(state)
    .map(([nodeType, nodeTypeState]) => {
      if (!isRecord(nodeTypeState)) {
        return undefined;
      }

      const booleanEntries = Object.entries(nodeTypeState).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      );

      return [nodeType, Object.fromEntries(booleanEntries)] as const;
    })
    .filter((entry): entry is readonly [string, Record<string, boolean>] => entry != null);

  return Object.fromEntries(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
