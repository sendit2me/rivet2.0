import { createHeaderOnlyNodeColor, type NodeColor } from '../../utils/nodeColor.js';

function createDefaultNodeColor(colorIndex: number): NodeColor {
  return createHeaderOnlyNodeColor(`var(--node-color-${colorIndex})`);
}

const DEFAULT_NODE_COLORS_BY_TYPE: Partial<Record<string, NodeColor>> = {
  graphInput: createDefaultNodeColor(3),
  graphOutput: createDefaultNodeColor(3),
  httpCall: createDefaultNodeColor(6),
  subGraph: createDefaultNodeColor(2),
};

export function getDefaultNodeColorForType(nodeType: string): NodeColor | undefined {
  return DEFAULT_NODE_COLORS_BY_TYPE[nodeType];
}
