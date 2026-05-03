import type { ChartNode } from '@rivet2/rivet-core';

type NodeColor = NonNullable<ChartNode['visualData']['color']>;

function createFilledNodeColor(colorIndex: number): NodeColor {
  const token = `var(--node-color-${colorIndex})`;
  return {
    bg: token,
    border: token,
  };
}

const DEFAULT_NODE_COLORS_BY_TYPE: Partial<Record<string, NodeColor>> = {
  graphInput: createFilledNodeColor(3),
  graphOutput: createFilledNodeColor(3),
  httpCall: createFilledNodeColor(6),
  subGraph: createFilledNodeColor(2),
};

export function getDefaultNodeColorForType(nodeType: string): NodeColor | undefined {
  return DEFAULT_NODE_COLORS_BY_TYPE[nodeType];
}
