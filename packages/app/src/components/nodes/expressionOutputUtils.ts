import { type ExpressionNode } from '@valerypopoff/rivet2-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { hasDisplayableInterpolationInputs } from './parsedSourceDisplayUtils.js';

export function getExpressionPreviewSource(node: ExpressionNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.expressionSource ?? node.data.expression;
}

export function hasExpressionInterpolationInputs(expressionSource: string): boolean {
  return hasDisplayableInterpolationInputs(expressionSource);
}
