import { type ExpressionNode } from '@ironclad/rivet-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { extractInterpolationVariables } from '../../../../core/src/utils/interpolation.js';

export function getExpressionPreviewSource(node: ExpressionNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.expressionSource ?? node.data.expression;
}

export function hasExpressionInterpolationInputs(expressionSource: string): boolean {
  return extractInterpolationVariables(expressionSource).length > 0;
}
