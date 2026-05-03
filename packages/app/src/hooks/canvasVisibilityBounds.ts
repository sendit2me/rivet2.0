import type { ChartNode, CommentNode } from '@rivet2/rivet-core';
import { DEFAULT_NODE_WIDTH } from '../utils/nodeResize.js';

export type CanvasVisibilityBounds = {
  height: number;
  width: number;
};

export function getCanvasNodeWidth(node: ChartNode): number {
  return Number.isFinite(node.visualData.width) ? node.visualData.width! : DEFAULT_NODE_WIDTH;
}

export function getCanvasCommentHeight(node: CommentNode): number {
  return Number.isFinite(node.data.height) ? node.data.height : getCanvasNodeWidth(node);
}

export function getCanvasVisibilityBounds(node: ChartNode): CanvasVisibilityBounds {
  return {
    width: getCanvasNodeWidth(node),
    // Comment nodes store their rendered vertical extent in data.height rather than visualData.
    height: node.type === 'comment' ? getCanvasCommentHeight(node as CommentNode) : 0,
  };
}
