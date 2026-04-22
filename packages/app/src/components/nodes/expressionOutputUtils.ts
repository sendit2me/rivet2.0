import { type ExpressionNode } from '@ironclad/rivet-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';

export function getExpressionPreviewSource(node: ExpressionNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.expressionSource ?? node.data.expression;
}
