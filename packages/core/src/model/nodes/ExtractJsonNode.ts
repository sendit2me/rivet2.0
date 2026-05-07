import {
  type ChartNode,
  type NodeId,
  type NodeInputDefinition,
  type PortId,
  type NodeOutputDefinition,
} from '../NodeBase.js';
import { nanoid } from 'nanoid/non-secure';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { type DataValue } from '../DataValue.js';
import { dedent } from 'ts-dedent';

export type ExtractJsonNode = ChartNode<'extractJson', ExtractJsonNodeData>;

export type ExtractJsonNodeData = {};

export class ExtractJsonNodeImpl extends NodeImpl<ExtractJsonNode> {
  static create(): ExtractJsonNode {
    const chartNode: ExtractJsonNode = {
      type: 'extractJson',
      title: 'Extract JSON',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 250,
      },
      data: {},
    };

    return chartNode;
  }

  getInputDefinitions(): NodeInputDefinition[] {
    return [
      {
        id: 'input' as PortId,
        title: 'Input',
        dataType: 'any',
        required: true,
        coerced: false,
      },
    ];
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        id: 'output' as PortId,
        title: 'Output',
        dataType: 'object',
      },
      {
        id: 'noMatch' as PortId,
        title: 'No Match',
        dataType: 'string',
      },
    ];
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Finds and parses the first JSON object in input text, or passes through an already-structured input object.

        Outputs the parsed or passed-through object.
      `,
      infoBoxTitle: 'Extract JSON Node',
      contextMenuTitle: 'Extract JSON',
      group: ['Objects'],
    };
  }

  async process(inputs: Record<PortId, DataValue>): Promise<Record<PortId, DataValue>> {
    const input = inputs['input' as PortId];

    if (isStructuredJsonInput(input)) {
      return createMatchedOutput(input.value);
    }

    let inputString: string;
    if (input?.type === 'any') {
      if (isJsonOutputValue(input.value)) {
        return createMatchedOutput(input.value);
      }

      if (typeof input.value !== 'string') {
        throw new Error(`Expected value of type string or object but got any`);
      }

      inputString = input.value;
    } else if (input?.type === 'string') {
      inputString = input.value;
    } else {
      throw new Error(`Expected value of type string or object but got ${input?.type}`);
    }

    try {
      const parsed = JSON.parse(inputString);
      return createMatchedOutput(parsed);
    } catch (_err: unknown) {
      // Fall back to more manual parsing
    }

    // Find the first { or [ and the last } or ], and try parsing everything in between including them.

    const firstBracket = inputString.indexOf('{');
    const lastBracket = inputString.lastIndexOf('}');
    const firstSquareBracket = inputString.indexOf('[');
    const lastSquareBracket = inputString.lastIndexOf(']');

    const firstIndex =
      firstBracket >= 0 && firstSquareBracket >= 0
        ? Math.min(firstBracket, firstSquareBracket)
        : firstBracket >= 0
          ? firstBracket
          : firstSquareBracket;

    const lastIndex =
      lastBracket >= 0 && lastSquareBracket >= 0
        ? Math.max(lastBracket, lastSquareBracket)
        : lastBracket >= 0
          ? lastBracket
          : lastSquareBracket;

    const substring = inputString.substring(firstIndex, lastIndex + 1);

    let jsonObject: unknown;
    try {
      jsonObject = JSON.parse(substring);
    } catch (err) {
      return {
        ['noMatch' as PortId]: {
          type: 'string',
          value: inputString,
        },
        ['output' as PortId]: {
          type: 'control-flow-excluded',
          value: undefined,
        },
      };
    }

    return createMatchedOutput(jsonObject);
  }
}

export const extractJsonNode = nodeDefinition(ExtractJsonNodeImpl, 'Extract JSON');

function isStructuredJsonInput(
  value: DataValue | undefined,
): value is Extract<DataValue, { type: 'object' | 'object[]' | 'any[]' }> {
  return value?.type === 'object' || value?.type === 'object[]' || value?.type === 'any[]';
}

function isJsonOutputValue(value: unknown): value is Record<string, unknown> | unknown[] {
  return value != null && typeof value === 'object';
}

function createMatchedOutput(value: unknown): Record<PortId, DataValue> {
  return {
    ['output' as PortId]: {
      type: 'object',
      value: value as Record<string, unknown>,
    },
    ['noMatch' as PortId]: {
      type: 'control-flow-excluded',
      value: undefined,
    },
  };
}
