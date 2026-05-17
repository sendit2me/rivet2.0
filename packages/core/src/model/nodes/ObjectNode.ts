import {
  type ChartNode,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
} from '../NodeBase.js';
import { nanoid } from 'nanoid/non-secure';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { type DataValue } from '../DataValue.js';
import { dedent } from 'ts-dedent';
import { type EditorDefinition } from '../EditorDefinition.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import {
  extractInterpolationVariables,
  findInterpolationTokenSpans,
  getInterpolationTokenName,
  protectEscapedInterpolationTokens,
  resolveExpressionRawValue,
  restoreEscapedInterpolationTokens,
  unwrapPotentialDataValue,
} from '../../utils/interpolation.js';
import { createInterpolationInputDefinition } from '../interpolationInputDefinition.js';

export type ObjectNode = ChartNode<'object', ObjectNodeData>;

export type ObjectNodeData = {
  jsonTemplate: string;
};

const DEFAULT_JSON_TEMPLATE = `{
  "key": "{{input}}"
}`;

function isEscapedCharacter(value: string, index: number): boolean {
  let backslashCount = 0;

  for (let i = index - 1; i >= 0 && value[i] === '\\'; i--) {
    backslashCount++;
  }

  return backslashCount % 2 === 1;
}

function isUnescapedQuoteAt(value: string, index: number): boolean {
  return index >= 0 && index < value.length && value[index] === '"' && !isEscapedCharacter(value, index);
}

function isInsideJsonString(value: string, index: number): boolean {
  let insideString = false;

  for (let i = 0; i < index; i++) {
    if (isUnescapedQuoteAt(value, i)) {
      insideString = !insideString;
    }
  }

  return insideString;
}

function stringifyJsonValue(value: any): string {
  if (value == null) {
    return 'null';
  }

  return JSON.stringify(value) as string;
}

function stringifyWholeQuotedJsonValue(value: any): string {
  if (value == null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  return JSON.stringify(JSON.stringify(value)) as string;
}

function stringifyEmbeddedJsonStringFragment(value: any): string {
  const fragment = value == null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value) ?? 'null';

  return JSON.stringify(fragment).slice(1, -1);
}

export class ObjectNodeImpl extends NodeImpl<ObjectNode> {
  static create(): ObjectNode {
    const chartNode: ObjectNode = {
      type: 'object',
      title: 'Object',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 200,
      },
      data: {
        jsonTemplate: DEFAULT_JSON_TEMPLATE,
      },
    };

    return chartNode;
  }

  getInputDefinitions(): NodeInputDefinition[] {
    const inputTokens = extractInterpolationVariables(this.chartNode.data.jsonTemplate ?? '');

    return inputTokens.map((inputName) => {
      return createInterpolationInputDefinition({
        interpolationName: inputName,
        dataType: 'any',
        required: false,
      });
    });
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        dataType: ['object', 'object[]'],
        id: 'output' as PortId,
        title: 'Output',
      },
    ];
  }

  getEditors(): EditorDefinition<ObjectNode>[] {
    return [
      {
        type: 'custom',
        customEditorId: 'ObjectNodeAiAssist',
        label: 'AI Assist',
      },
      {
        type: 'code',
        label: 'JSON Template',
        dataKey: 'jsonTemplate',
        language: 'json',
        interpolationSyntax: 'json-template',
        theme: 'prompt-interpolation',
        enableFolding: true,
      },
    ];
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Creates an object from input values and a JSON template, escaping the input values and inserting them into the template.

        Use double-quotes around the input values to escape them. String values are automatically escaped.

        Useful for creating objects from multiple inputs.
      `,
      infoBoxTitle: 'Object Node',
      contextMenuTitle: 'Object',
      group: ['Objects'],
    };
  }

  interpolate(
    baseString: string,
    values: Record<string, any>,
    graphInputNodeValues?: Record<string, DataValue>,
    contextValues?: Record<string, DataValue>,
  ): string {
    const protectedBaseString = protectEscapedInterpolationTokens(baseString);
    const tokenSpans = findInterpolationTokenSpans(protectedBaseString);

    if (tokenSpans.length === 0) {
      return restoreEscapedInterpolationTokens(protectedBaseString);
    }

    let result = '';
    let cursor = 0;

    for (const tokenSpan of tokenSpans) {
      const isInsideString = isInsideJsonString(protectedBaseString, tokenSpan.start);
      const isWholeQuotedToken =
        isInsideString &&
        isUnescapedQuoteAt(protectedBaseString, tokenSpan.start - 1) &&
        isUnescapedQuoteAt(protectedBaseString, tokenSpan.end);
      const replacementStart = isWholeQuotedToken ? tokenSpan.start - 1 : tokenSpan.start;
      const replacementEnd = isWholeQuotedToken ? tokenSpan.end + 1 : tokenSpan.end;
      const trimmedKey = getInterpolationTokenName(tokenSpan.rawInner) ?? tokenSpan.rawInner.trim();

      let value: any;

      const graphInputPrefix = '@graphInputs.';
      const contextPrefix = '@context.';

      if (trimmedKey.startsWith(graphInputPrefix) && graphInputNodeValues) {
        value = resolveExpressionRawValue(
          graphInputNodeValues,
          trimmedKey.substring(graphInputPrefix.length),
          'graphInputs',
        );
      } else if (trimmedKey.startsWith(contextPrefix) && contextValues) {
        value = resolveExpressionRawValue(contextValues, trimmedKey.substring(contextPrefix.length), 'context');
      } else {
        value = values[trimmedKey]; // Original logic for non-@ variables
      }

      result += protectedBaseString.slice(cursor, replacementStart);

      if (isInsideString && !isWholeQuotedToken) {
        result += stringifyEmbeddedJsonStringFragment(value);
      } else if (isWholeQuotedToken) {
        result += stringifyWholeQuotedJsonValue(value);
      } else {
        result += stringifyJsonValue(value);
      }

      cursor = replacementEnd;
    }

    result += protectedBaseString.slice(cursor);

    return restoreEscapedInterpolationTokens(result);
  }

  async process(
    inputs: Record<string, DataValue>,
    context: InternalProcessContext,
  ): Promise<Record<string, DataValue>> {
    const inputMap = Object.keys(inputs).reduce(
      (acc, key) => {
        acc[key] = unwrapPotentialDataValue(inputs[key]);
        return acc;
      },
      {} as Record<string, any>,
    );

    const interpolatedString = this.interpolate(
      this.chartNode.data.jsonTemplate,
      inputMap,
      context.graphInputNodeValues, // Pass graph inputs
      context.contextValues, // Pass context values
    );

    let outputValue: Record<string, unknown> | unknown[];

    try {
      outputValue = JSON.parse(interpolatedString) as Record<string, unknown> | unknown[];
    } catch (err) {
      throw new Error(`Failed to parse JSON template: ${(err as Error).message}`);
    }

    const outputType = Array.isArray(outputValue) ? 'object[]' : 'object';

    return {
      output: {
        type: outputType,
        value: outputValue,
      } as DataValue,
    };
  }
}

export const objectNode = nodeDefinition(ObjectNodeImpl, 'Object');
