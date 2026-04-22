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
import { coerceTypeOptional } from '../../utils/coerceType.js';
import {
  extractInterpolationVariables,
  findInterpolationTokenSpans,
  getInterpolationTokenName,
  protectEscapedInterpolationTokens,
  restoreEscapedInterpolationTokens,
} from '../../utils/interpolation.js';

export type ExpressionNode = ChartNode<'expression', ExpressionNodeData>;

export type ExpressionNodeData = {
  expression: string;
};

const DEFAULT_EXPRESSION = '{{a}} == "123" ? {{b}} : {{c}}';
const MAX_BODY_PREVIEW_LINES = 15;
export const EXPRESSION_OUTPUT_PORT_ID = 'output' as PortId;

function buildExpressionPreview(expression: string): string {
  return expression.split('\n').slice(0, MAX_BODY_PREVIEW_LINES).join('\n').trim();
}

function readExpressionInputSource(inputs: Inputs, inputName: string): string | undefined {
  const wrappedInput = inputs[inputName as PortId];

  if (wrappedInput === undefined) {
    return undefined;
  }

  return coerceTypeOptional(wrappedInput, 'string');
}

function trimParsedExpressionSource(expressionSource: string): string {
  return expressionSource.trim();
}

export function interpolateExpressionSource(expression: string, inputs: Inputs): string {
  const protectedExpression = protectEscapedInterpolationTokens(expression);
  const tokenSpans = findInterpolationTokenSpans(protectedExpression);

  if (tokenSpans.length === 0) {
    return trimParsedExpressionSource(restoreEscapedInterpolationTokens(protectedExpression));
  }

  let result = '';
  let cursor = 0;

  for (const tokenSpan of tokenSpans) {
    result += protectedExpression.slice(cursor, tokenSpan.start);

    const tokenName = getInterpolationTokenName(tokenSpan.rawInner);
    // Expression inputs are raw JS source snippets. Missing values intentionally
    // become the identifier `undefined` instead of an empty string.
    const replacement = tokenName ? readExpressionInputSource(inputs, tokenName) : undefined;
    result += replacement ?? 'undefined';

    cursor = tokenSpan.end;
  }

  result += protectedExpression.slice(cursor);

  return trimParsedExpressionSource(restoreEscapedInterpolationTokens(result));
}

function buildExpressionWrapper(expressionSource: string): string {
  return dedent`
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
    return extractInterpolationVariables(this.data.expression).map((inputName) => {
      return {
        id: inputName as PortId,
        title: inputName,
        dataType: 'string',
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
        helperMessage:
          'Use {{var}} to create input ports. Inputs are inserted as raw JS source, so string values should include quotes.',
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

        <code>{{interpolation}}</code> creates dynamic input ports. Interpolated inputs are inserted as raw JavaScript source, so string literals should include their own quotes.
      `,
      infoBoxTitle: 'Expression Node',
      contextMenuTitle: 'Expression',
      group: ['Advanced'],
    };
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    return context.codeRunner.runCode(
      buildExpressionWrapper(interpolateExpressionSource(this.data.expression, inputs)),
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
  }
}

export const expressionNode = nodeDefinition(ExpressionNodeImpl, 'Expression');
