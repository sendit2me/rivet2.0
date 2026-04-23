import { dedent } from 'ts-dedent';
import type { Inputs, Outputs } from '../GraphProcessor.js';
import type { ChartNode, NodeInputDefinition, PortId } from '../NodeBase.js';
import type { EditorDefinition } from '../EditorDefinition.js';
import type { NodeBodySpec } from '../NodeBodySpec.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import { extractInterpolationVariables } from '../../utils/interpolation.js';
import { interpolateRawJsSource } from './rawJsSourceInterpolation.js';

const MAX_CALLBACK_PREVIEW_BODY_LINES = 13;
const JS_LIST_CALLBACK_SIGNATURE = '(item, index, array)';
export const JS_LIST_CALLBACK_LOCAL_NAMES: ReadonlySet<string> = new Set(['item', 'index', 'array']);
const JS_LIST_CODE_RUNNER_OPTIONS = {
  includeFetch: false,
  includeRequire: false,
  includeRivet: false,
  includeProcess: false,
  includeConsole: false,
};

function indentLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function assertSynchronousCallbackResult(result: unknown, nodeName: string): void {
  if (
    result &&
    (typeof result === 'object' || typeof result === 'function') &&
    'then' in result &&
    typeof result.then === 'function'
  ) {
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
    .filter((inputName) => !JS_LIST_CALLBACK_LOCAL_NAMES.has(inputName))
    .map((inputName) => ({
      id: inputName as PortId,
      title: inputName,
      dataType: 'string',
      required: false,
    }));
}

export function getJSListInputDefinitions(callbackBody: string): NodeInputDefinition[] {
  return [
    {
      id: 'array' as PortId,
      title: 'Array',
      dataType: 'any[]',
      required: true,
    },
    ...getJSListCallbackInterpolationInputDefinitions(callbackBody),
  ];
}

export function getJSListEditors<T extends ChartNode>(): EditorDefinition<T>[] {
  return [
    {
      type: 'code',
      label: 'Callback Body',
      helperMessage:
        'Body of: (item, index, array) => { ... }. Use {{var}} for raw JS source inputs; strings need quotes.',
      dataKey: 'callbackBody',
      language: 'javascript',
      enableFolding: true,
    } as EditorDefinition<T>,
  ];
}

export function interpolateJSListCallbackBody(callbackBody: string, inputs: Inputs): string {
  return interpolateRawJsSource(callbackBody, inputs, {
    ignoredInputNames: JS_LIST_CALLBACK_LOCAL_NAMES,
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

export function getJSListNodeBody(callbackBody: string): NodeBodySpec {
  return {
    type: 'colorized',
    text: wrapJSListCallbackPreview(JS_LIST_CALLBACK_SIGNATURE, callbackBody),
    language: 'javascript',
    fontSize: 12,
    fontFamily: 'monospace',
  };
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

export async function runJSListNodeCode({
  buildWrapper,
  callbackBody,
  context,
  inputs,
  nodeName,
  outputId,
}: {
  buildWrapper: (callbackBody: string) => string;
  callbackBody: string;
  context: InternalProcessContext;
  inputs: Inputs;
  nodeName: string;
  outputId: string;
}): Promise<Outputs> {
  const outputs = await context.codeRunner.runCode(
    buildWrapper(interpolateJSListCallbackBody(callbackBody, inputs)),
    inputs,
    JS_LIST_CODE_RUNNER_OPTIONS,
    context.graphInputNodeValues,
    context.contextValues,
  );

  assertJSListNodeOutputs(outputs, outputId, nodeName);
  return outputs;
}
