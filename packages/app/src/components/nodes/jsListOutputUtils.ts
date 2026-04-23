import { type Inputs, type JSFilterNode, type JSMapNode } from '@ironclad/rivet-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import {
  JS_LIST_CALLBACK_LOCAL_NAMES,
  interpolateJSListCallbackBody,
  wrapJSListCallbackPreview,
} from '../../../../core/src/model/nodes/jsListCallbackHelpers.js';
import { hasDisplayableInterpolationInputs } from './parsedSourceDisplayUtils.js';

type JSListNode = JSFilterNode | JSMapNode;

export function getJSListCallbackPreviewSource(node: JSListNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.jsListCallbackBodySource ?? node.data.callbackBody;
}

export function hasJSListCallbackInterpolationInputs(callbackBodySource: string): boolean {
  return hasDisplayableInterpolationInputs(callbackBodySource, {
    reservedInputNames: JS_LIST_CALLBACK_LOCAL_NAMES,
  });
}

export function getParsedJSListCallbackPreviewSource(callbackBodySource: string, inputs: Inputs): string {
  return wrapJSListCallbackPreview(
    '(item, index, array)',
    interpolateJSListCallbackBody(callbackBodySource, inputs),
  );
}
