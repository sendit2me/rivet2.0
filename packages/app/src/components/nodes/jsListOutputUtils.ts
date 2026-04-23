import { type Inputs, type JSFilterNode, type JSMapNode } from '@ironclad/rivet-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import {
  getJSListCallbackInterpolationInputDefinitions,
  interpolateJSListCallbackBody,
  wrapJSListCallbackPreview,
} from '../../../../core/src/model/nodes/jsListCallbackHelpers.js';

type JSListNode = JSFilterNode | JSMapNode;

export function getJSListCallbackPreviewSource(node: JSListNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.jsListCallbackBodySource ?? node.data.callbackBody;
}

export function hasJSListCallbackInterpolationInputs(callbackBodySource: string): boolean {
  return getJSListCallbackInterpolationInputDefinitions(callbackBodySource).length > 0;
}

export function getParsedJSListCallbackPreviewSource(callbackBodySource: string, inputs: Inputs): string {
  return wrapJSListCallbackPreview(
    '(item, index, array)',
    interpolateJSListCallbackBody(callbackBodySource, inputs),
  );
}
