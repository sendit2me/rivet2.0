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
import { getError } from '../../utils/errors.js';
import {
  buildClonedInputValueAssignments,
  buildCloneJsInputValueFunction,
  buildJsValueInterpolatedSource,
  getJsValueInterpolationInputNames,
  getSafeJsValueInterpolationIdentifier,
  interpolateJsValuePreviewSource,
  sanitizeGeneratedJsValueText,
} from './jsValueInterpolation.js';
import { createInterpolationInputDefinition } from '../interpolationInputDefinition.js';

export type ExpressionNode = ChartNode<'expression', ExpressionNodeData>;

export type ExpressionNodeData = {
  expression: string;
};

const DEFAULT_EXPRESSION = '{{a}} == "123" ? {{b}} : {{c}}';
const MAX_BODY_PREVIEW_LINES = 15;
const EXPRESSION_INPUTS_IDENTIFIER = '__expressionInputs';
const EXPRESSION_INPUT_CLONE_CACHE_IDENTIFIER = 'expressionInputCloneCache';
export const EXPRESSION_OUTPUT_PORT_ID = 'output' as PortId;

function buildExpressionPreview(expression: string): string {
  return expression.split('\n').slice(0, MAX_BODY_PREVIEW_LINES).join('\n').trim();
}

function getExpressionInputNames(expression: string): string[] {
  return getJsValueInterpolationInputNames(expression);
}

function buildExpressionRuntimeSource(expression: string, inputsIdentifier: string): string {
  return buildJsValueInterpolatedSource(expression, inputsIdentifier);
}

function buildExpressionInputsInitializer(inputNames: string[], inputsIdentifier: string): string {
  return dedent`
    ${buildCloneJsInputValueFunction()}
    const ${inputsIdentifier} = Object.create(null);
    const ${EXPRESSION_INPUT_CLONE_CACHE_IDENTIFIER} = new WeakMap();
    ${buildClonedInputValueAssignments(
      inputNames,
      inputsIdentifier,
      EXPRESSION_INPUT_CLONE_CACHE_IDENTIFIER,
    )}
  `;
}

export function interpolateExpressionSource(expression: string, inputs: Inputs): string {
  return interpolateJsValuePreviewSource(expression, inputs);
}

function sanitizeGeneratedExpressionText(
  text: string | undefined,
  inputNames: string[],
  inputsIdentifier: string,
): string | undefined {
  return sanitizeGeneratedJsValueText(text, inputNames, inputsIdentifier, 'expression input');
}

function sanitizeExpressionError(error: unknown, inputNames: string[], inputsIdentifier: string): Error {
  const expressionError = getError(error);
  expressionError.message =
    sanitizeGeneratedExpressionText(expressionError.message, inputNames, inputsIdentifier) ?? expressionError.message;
  expressionError.stack = sanitizeGeneratedExpressionText(expressionError.stack, inputNames, inputsIdentifier);

  return expressionError;
}

function buildExpressionWrapper(expression: string): { inputsIdentifier: string; source: string } {
  const inputNames = getExpressionInputNames(expression);
  const inputsIdentifier = getSafeJsValueInterpolationIdentifier(expression, EXPRESSION_INPUTS_IDENTIFIER);
  const expressionSource = buildExpressionRuntimeSource(expression, inputsIdentifier);

  return {
    inputsIdentifier,
    source: dedent`
      ${buildExpressionInputsInitializer(inputNames, inputsIdentifier)}

      return {
        output: {
          type: 'any',
          value: (${expressionSource}),
        },
      };
    `,
  };
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
    const { inputsIdentifier, source } = buildExpressionWrapper(this.data.expression);

    try {
      return await context.codeRunner.runCode(
        source,
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
      throw sanitizeExpressionError(error, inputNames, inputsIdentifier);
    }
  }
}

export const expressionNode = nodeDefinition(ExpressionNodeImpl, 'Expression');
