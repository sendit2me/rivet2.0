import {
  type CodeNewNode,
  type Inputs,
  interpolateCodeNewSource,
} from '@valerypopoff/rivet2-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { hasDisplayableInterpolationInputs } from './parsedSourceDisplayUtils.js';

export function getCodeNewPreviewSource(node: CodeNewNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.codeSource ?? node.data.code;
}

export function getCodeNewParsedSource(node: CodeNewNode, data: NodeRunDataWithRefs, inputs: Inputs): string {
  return interpolateCodeNewSource(getCodeNewPreviewSource(node, data), inputs);
}

export function hasCodeNewInterpolationInputs(codeSource: string): boolean {
  return hasDisplayableInterpolationInputs(codeSource);
}
