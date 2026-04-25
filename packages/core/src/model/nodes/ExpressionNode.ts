import {
  type ChartNode,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
} from '../NodeBase.js';
import { nanoid } from 'nanoid/non-secure';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { type EditorDefinition, type NodeBodySpec } from '../../index.js';
import { dedent } from 'ts-dedent';
import type { Inputs, Outputs } from '../GraphProcessor.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { extractInterpolationVariables, replaceInterpolationTokens } from '../../utils/interpolation.js';
import { getError } from '../../utils/errors.js';

export type ExpressionNode = ChartNode<'expression', ExpressionNodeData>;

export type ExpressionNodeData = {
  expression: string;
};

const DEFAULT_EXPRESSION = '{{a}} == "123" ? {{b}} : {{c}}';
const MAX_BODY_PREVIEW_LINES = 15;
const EXPRESSION_INPUTS_IDENTIFIER = '__expressionInputs';
export const EXPRESSION_OUTPUT_PORT_ID = 'output' as PortId;

function buildExpressionPreview(expression: string): string {
  return expression.split('\n').slice(0, MAX_BODY_PREVIEW_LINES).join('\n').trim();
}

function getExpressionInputNames(expression: string): string[] {
  return extractInterpolationVariables(expression);
}

function isSimpleIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function getUserFacingInputName(inputName: string): string {
  return isSimpleIdentifier(inputName) ? inputName : `{{${inputName}}}`;
}

function buildExpressionValueReference(inputName: string | undefined): string {
  if (!inputName || inputName.startsWith('@graphInputs.') || inputName.startsWith('@context.')) {
    return 'undefined';
  }

  return `${EXPRESSION_INPUTS_IDENTIFIER}[${JSON.stringify(inputName)}]`;
}

function buildExpressionRuntimeSource(expression: string): string {
  return replaceInterpolationTokens(expression, (token) => buildExpressionValueReference(token.tokenName), {
    trim: true,
  });
}

function buildExpressionInputsInitializer(inputNames: string[]): string {
  const assignments = inputNames
    .map(
      (inputName) =>
        `${EXPRESSION_INPUTS_IDENTIFIER}[${JSON.stringify(inputName)}] = cloneExpressionInputValue(inputs[${JSON.stringify(
          inputName,
        )}]?.value, expressionInputCloneCache);`,
    )
    .join('\n');

  return dedent`
    const cloneExpressionInputValue = (value, seen = new WeakMap()) => {
      if (value == null || typeof value !== 'object') {
        return value;
      }

      if (seen.has(value)) {
        return seen.get(value);
      }

      if (typeof structuredClone === 'function') {
        try {
          const clone = structuredClone(value);
          seen.set(value, clone);
          return clone;
        } catch {
          // Fall through to the smaller clone path for values structuredClone cannot copy.
        }
      }

      if (Array.isArray(value)) {
        const clone = [];
        seen.set(value, clone);
        for (const item of value) {
          clone.push(cloneExpressionInputValue(item, seen));
        }
        return clone;
      }

      if (value instanceof Date) {
        return new Date(value.getTime());
      }

      if (value instanceof Map) {
        const clone = new Map();
        seen.set(value, clone);
        for (const [key, mapValue] of value.entries()) {
          clone.set(cloneExpressionInputValue(key, seen), cloneExpressionInputValue(mapValue, seen));
        }
        return clone;
      }

      if (value instanceof Set) {
        const clone = new Set();
        seen.set(value, clone);
        for (const item of value.values()) {
          clone.add(cloneExpressionInputValue(item, seen));
        }
        return clone;
      }

      if (value instanceof ArrayBuffer) {
        return value.slice(0);
      }

      if (ArrayBuffer.isView(value)) {
        if (value instanceof DataView) {
          return new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        }

        return new value.constructor(value);
      }

      const clone = Object.create(Object.getPrototypeOf(value));
      seen.set(value, clone);
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor?.enumerable && 'value' in descriptor) {
          clone[key] = cloneExpressionInputValue(descriptor.value, seen);
        }
      }
      return clone;
    };

    const ${EXPRESSION_INPUTS_IDENTIFIER} = Object.create(null);
    const expressionInputCloneCache = new WeakMap();
    ${assignments}
  `;
}

function formatExpressionPreviewValue(inputName: string | undefined, inputs: Inputs): string {
  if (!inputName || inputName.startsWith('@graphInputs.') || inputName.startsWith('@context.')) {
    return 'undefined';
  }

  const value = inputs[inputName as PortId]?.value;

  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return getUserFacingInputName(inputName);
}

export function interpolateExpressionSource(expression: string, inputs: Inputs): string {
  return replaceInterpolationTokens(expression, (token) => formatExpressionPreviewValue(token.tokenName, inputs), {
    trim: true,
  });
}

function sanitizeGeneratedExpressionText(text: string | undefined, inputNames: string[]): string | undefined {
  if (!text) {
    return text;
  }

  let sanitized = text;

  for (const inputName of inputNames) {
    const userFacingInputName = getUserFacingInputName(inputName);
    sanitized = sanitized
      .replaceAll(`${EXPRESSION_INPUTS_IDENTIFIER}[${JSON.stringify(inputName)}]`, userFacingInputName)
      .replaceAll(`${EXPRESSION_INPUTS_IDENTIFIER}.${inputName}`, userFacingInputName);
  }

  return sanitized.replaceAll(EXPRESSION_INPUTS_IDENTIFIER, 'expression input');
}

function sanitizeExpressionError(error: unknown, inputNames: string[]): Error {
  const expressionError = getError(error);
  expressionError.message =
    sanitizeGeneratedExpressionText(expressionError.message, inputNames) ?? expressionError.message;
  expressionError.stack = sanitizeGeneratedExpressionText(expressionError.stack, inputNames);

  return expressionError;
}

function buildExpressionWrapper(expression: string): string {
  const inputNames = getExpressionInputNames(expression);
  const expressionSource = buildExpressionRuntimeSource(expression);

  return dedent`
    ${buildExpressionInputsInitializer(inputNames)}

    return {
      output: {
        type: 'any',
        value: (${expressionSource}),
      },
    };
  `;
}

export class ExpressionNodeImpl extends NodeImpl<ExpressionNode> {
  static create(): ExpressionNode {
    const chartNode: ExpressionNode = {
      type: 'expression',
      title: 'Expression',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 260,
      },
      data: {
        expression: DEFAULT_EXPRESSION,
      },
    };

    return chartNode;
  }

  getInputDefinitions(): NodeInputDefinition[] {
    return getExpressionInputNames(this.data.expression).map((inputName) => {
      return {
        id: inputName as PortId,
        title: inputName,
        dataType: 'any',
        required: false,
      };
    });
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        id: EXPRESSION_OUTPUT_PORT_ID,
        title: 'Output',
        dataType: 'any',
      },
    ];
  }

  getEditors(): EditorDefinition<ExpressionNode>[] {
    return [
      {
        type: 'code',
        label: 'Expression',
        helperMessage: 'Use {{var}} to create input ports. Interpolated variables evaluate as the connected values.',
        dataKey: 'expression',
        language: 'javascript',
        enableFolding: true,
      },
    ];
  }

  getBody(): NodeBodySpec {
    return {
      type: 'colorized',
      text: buildExpressionPreview(this.data.expression),
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    };
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Evaluates a single JavaScript expression and returns the resulting value.

        <code>{{interpolation}}</code> creates dynamic input ports. Interpolated variables evaluate as connected values, so arrays, objects, strings, numbers, and booleans can be used directly.
      `,
      infoBoxTitle: 'Expression Node',
      contextMenuTitle: 'Expression',
      group: ['Advanced'],
    };
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    const inputNames = getExpressionInputNames(this.data.expression);

    try {
      return await context.codeRunner.runCode(
        buildExpressionWrapper(this.data.expression),
        inputs,
        {
          includeFetch: false,
          includeRequire: false,
          includeRivet: false,
          includeProcess: false,
          includeConsole: false,
        },
        context.graphInputNodeValues,
        context.contextValues,
      );
    } catch (error) {
      throw sanitizeExpressionError(error, inputNames);
    }
  }
}

export const expressionNode = nodeDefinition(ExpressionNodeImpl, 'Expression');
