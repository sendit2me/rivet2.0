import {
  JS_LIST_CALLBACK_LOCAL_NAMES,
  type Inputs,
  type JSFilterNode,
  type JSMapNode,
  interpolateJSListCallbackBody,
} from '@rivet2/rivet-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { hasDisplayableInterpolationInputs } from './parsedSourceDisplayUtils.js';

type JSListNode = JSFilterNode | JSMapNode;
const MAX_CALLBACK_PREVIEW_BODY_LINES = 13;

function wrapCallbackPreview(callbackBody: string): string {
  return `(item, index, array) => {\n${callbackBody
    .split('\n')
    .slice(0, MAX_CALLBACK_PREVIEW_BODY_LINES)
    .map((line) => `  ${line}`)
    .join('\n')
    .trimEnd()}\n}`;
}

export function getJSListCallbackPreviewSource(node: JSListNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.jsListCallbackBodySource ?? node.data.callbackBody;
}

export function hasJSListCallbackInterpolationInputs(callbackBodySource: string): boolean {
  return hasDisplayableInterpolationInputs(callbackBodySource, {
    reservedInputNames: JS_LIST_CALLBACK_LOCAL_NAMES,
  });
}

export function getParsedJSListCallbackPreviewSource(callbackBodySource: string, inputs: Inputs): string {
  return wrapCallbackPreview(interpolateJSListCallbackBody(callbackBodySource, inputs).trim());
}
