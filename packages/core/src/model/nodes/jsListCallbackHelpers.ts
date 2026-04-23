import { dedent } from 'ts-dedent';
import type { Inputs, Outputs } from '../GraphProcessor.js';
import type { NodeInputDefinition, PortId } from '../NodeBase.js';
import { extractInterpolationVariables } from '../../utils/interpolation.js';
import { interpolateRawJsSource } from './rawJsSourceInterpolation.js';

const MAX_CALLBACK_PREVIEW_BODY_LINES = 13;
const RESERVED_JS_LIST_CALLBACK_NAMES = new Set(['item', 'index', 'array']);

function indentLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function assertSynchronousCallbackResult(result: unknown, nodeName: string): void {
  if (result && (typeof result === 'object' || typeof result === 'function') && 'then' in result && typeof result.then === 'function') {
    throw new Error(`${nodeName} callbacks must be synchronous.`);
  }
}

export function buildJSFilterWrapper(callbackBody: string): string {
  return dedent`
    const assertSynchronousCallbackResult = ${assertSynchronousCallbackResult.toString()};
    const array = inputs.array?.value;

    if (!Array.isArray(array)) {
      throw new Error('JS Filter input "array" must be an array.');
    }

    const callback = (item, index, array) => {
    ${indentLines(callbackBody, '  ')}
    };

    const filtered = [];

    for (let index = 0; index < array.length; index++) {
      const item = array[index];
      const result = callback(item, index, array);

      assertSynchronousCallbackResult(result, 'JS Filter');

      if (result) {
        filtered.push(item);
      }
    }

    return {
      filtered: {
        type: 'any[]',
        value: filtered,
      },
    };
  `;
}

export function buildJSMapWrapper(callbackBody: string): string {
  return dedent`
    const assertSynchronousCallbackResult = ${assertSynchronousCallbackResult.toString()};
    const array = inputs.array?.value;

    if (!Array.isArray(array)) {
      throw new Error('JS Map input "array" must be an array.');
    }

    const callback = (item, index, array) => {
    ${indentLines(callbackBody, '  ')}
    };

    const mapped = [];

    for (let index = 0; index < array.length; index++) {
      const item = array[index];
      const result = callback(item, index, array);

      assertSynchronousCallbackResult(result, 'JS Map');
      mapped.push(result);
    }

    return {
      mapped: {
        type: 'any[]',
        value: mapped,
      },
    };
  `;
}

export function getJSListCallbackInterpolationInputDefinitions(callbackBody: string): NodeInputDefinition[] {
  return extractInterpolationVariables(callbackBody)
    .filter((inputName) => !RESERVED_JS_LIST_CALLBACK_NAMES.has(inputName))
    .map((inputName) => ({
      id: inputName as PortId,
      title: inputName,
      dataType: 'string',
      required: false,
    }));
}

export function interpolateJSListCallbackBody(callbackBody: string, inputs: Inputs): string {
  return interpolateRawJsSource(callbackBody, inputs, {
    ignoredInputNames: RESERVED_JS_LIST_CALLBACK_NAMES,
  });
}

export function buildJSListNodeBodyPreview(callbackBody: string): string {
  return callbackBody
    .split('\n')
    .slice(0, MAX_CALLBACK_PREVIEW_BODY_LINES)
    .join('\n')
    .trim();
}

export function wrapJSListCallbackPreview(signature: string, callbackBody: string): string {
  const previewBody = buildJSListNodeBodyPreview(callbackBody);

  return dedent`
    ${signature} => {
    ${indentLines(previewBody, '  ')}
    }
  `.trim();
}

export function assertJSListNodeOutputs(
  outputs: Outputs,
  outputId: string,
  nodeName: string,
): asserts outputs is Outputs {
  if (outputs == null || typeof outputs !== 'object' || ('then' in outputs && typeof outputs.then === 'function')) {
    throw new Error(`${nodeName} must return an object with output values.`);
  }

  if (!(outputId in outputs)) {
    throw new Error(`${nodeName} must return an object with an "${outputId}" output.`);
  }
}
