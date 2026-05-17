import { nanoid } from 'nanoid/non-secure';
import { dedent } from 'ts-dedent';
import type {
  ChartNode,
  NodeId,
  NodeInputDefinition,
  NodeOutputDefinition,
  PortId,
} from '../NodeBase.js';
import { type EditorDefinition } from '../EditorDefinition.js';
import type { Inputs, Outputs } from '../GraphProcessor.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { type NodeBodySpec } from '../NodeBodySpec.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import {
  appendCodeNodeSourceUrl,
  buildCodeNodeSourceUrl,
  enrichCodeNodeErrorWithLocation,
} from './codeNodeErrorDiagnostics.js';
import {
  buildJsValueInterpolatedSource,
  buildJsValueInputsInitializer,
  buildJsValuePreview,
  getJsValueInterpolationInputDefinitions,
  getJsValueInterpolationRuntimeContext,
  interpolateJsValuePreviewSource,
  sanitizeGeneratedJsValueError,
  type JsValueInterpolationRuntimeContext,
} from './jsValueInterpolation.js';

export type CodeNewNode = ChartNode<'codeNew', CodeNewNodeData>;

export type CodeNewNodeData = {
  code: string;
  allowFetch?: boolean;
  allowRequire?: boolean;
  allowRivet?: boolean;
  allowProcess?: boolean;
  allowConsole?: boolean;
};

const DEFAULT_CODE_NEW = dedent`
  // This is a Code node. Write JavaScript here and return one value.
  // Interpolation tokens create input ports and evaluate as connected values.
  // The returned value becomes the node's single output.
  const value = {{input}};
  return value;
`;
const MAX_BODY_PREVIEW_LINES = 15;
const CODE_NEW_INPUTS_IDENTIFIER = '__codeNewInputs';
const CODE_NEW_INPUT_CLONE_CACHE_IDENTIFIER = 'codeNewInputCloneCache';
export const CODE_NEW_OUTPUT_PORT_ID = 'output' as PortId;

function buildCodeNewPreview(code: string): string {
  return buildJsValuePreview(code, MAX_BODY_PREVIEW_LINES);
}

function buildCodeNewRuntimeSource(code: string, inputsIdentifier: string): string {
  return buildJsValueInterpolatedSource(code, inputsIdentifier, { trim: false });
}

function buildCodeNewInputsInitializer(inputNames: string[], inputsIdentifier: string): string {
  return buildJsValueInputsInitializer({
    cacheIdentifier: CODE_NEW_INPUT_CLONE_CACHE_IDENTIFIER,
    inputNames,
    inputsIdentifier,
  });
}

export function interpolateCodeNewSource(code: string, inputs: Inputs): string {
  return interpolateJsValuePreviewSource(code, inputs, { trim: false });
}

function sanitizeCodeNewError(error: unknown, inputNames: string[], inputsIdentifier: string): Error {
  return sanitizeGeneratedJsValueError(error, inputNames, inputsIdentifier, 'code input');
}

function buildCodeNewWrapper(
  code: string,
  interpolationContext: JsValueInterpolationRuntimeContext,
): {
  source: string;
  userCodeLineOffset: number;
} {
  const { inputNames, inputsIdentifier } = interpolationContext;
  const beforeUserCodeLines = [
    ...buildCodeNewInputsInitializer(inputNames, inputsIdentifier).split(/\r?\n/),
    '',
    'const __codeNewResult = await (async () => {',
  ];
  const afterUserCodeLines = [
    '})();',
    '',
    'return {',
    '  output: {',
    "    type: 'any',",
    '    value: __codeNewResult,',
    '  },',
    '};',
  ];

  return {
    source: [...beforeUserCodeLines, buildCodeNewRuntimeSource(code, inputsIdentifier), ...afterUserCodeLines].join('\n'),
    userCodeLineOffset: beforeUserCodeLines.length,
  };
}

function isDataValueLike(value: unknown): value is { type: string; value: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  );
}

function validateCodeNewRunnerOutputs(outputs: unknown): Outputs {
  if (outputs == null || typeof outputs !== 'object' || ('then' in outputs && typeof outputs.then === 'function')) {
    throw new Error('Code node runner must return an object containing the Output value.');
  }

  const output = (outputs as Outputs)[CODE_NEW_OUTPUT_PORT_ID];
  if (!isDataValueLike(output)) {
    throw new Error('Code node runner must return a DataValue for the Output port.');
  }

  if (output.type !== 'any') {
    throw new Error('Code node runner must return an any DataValue for the Output port.');
  }

  return outputs as Outputs;
}

export class CodeNewNodeImpl extends NodeImpl<CodeNewNode> {
  static create(): CodeNewNode {
    return {
      type: 'codeNew',
      title: 'Code',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 260,
      },
      data: {
        code: DEFAULT_CODE_NEW,
        allowFetch: false,
        allowRequire: false,
        allowRivet: false,
        allowProcess: false,
        allowConsole: false,
      },
    };
  }

  getInputDefinitions(): NodeInputDefinition[] {
    return getJsValueInterpolationInputDefinitions(this.data.code);
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        id: CODE_NEW_OUTPUT_PORT_ID,
        title: 'Output',
        dataType: 'any',
      },
    ];
  }

  getEditors(): EditorDefinition<CodeNewNode>[] {
    return [
      {
        type: 'code',
        label: 'Code',
        helperMessage: 'Use {{var}} to create input ports. Interpolated variables evaluate as the connected values.',
        dataKey: 'code',
        language: 'javascript',
        enableFolding: true,
      },
      {
        type: 'group',
        label: 'Runtime permissions',
        defaultOpen: true,
        editors: [
          {
            type: 'toggle',
            label: 'Allow "fetch"',
            dataKey: 'allowFetch',
          },
          {
            type: 'toggle',
            label: 'Allow "Rivet"',
            dataKey: 'allowRivet',
          },
          {
            type: 'toggle',
            label: 'Allow "console"',
            dataKey: 'allowConsole',
          },
          {
            type: 'toggle',
            label: 'Allow "require"',
            dataKey: 'allowRequire',
            helperMessage: 'Only available with the Node executor',
          },
          {
            type: 'toggle',
            label: 'Allow "process"',
            dataKey: 'allowProcess',
            helperMessage: 'Only available with the Node executor',
          },
        ],
      },
    ];
  }

  getBody(): NodeBodySpec {
    return {
      type: 'colorized',
      text: buildCodeNewPreview(this.data.code),
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    };
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Runs JavaScript code that can use interpolation-created input ports and emits the returned value as the node output.
      `,
      infoBoxTitle: 'Code Node',
      contextMenuTitle: 'Code',
      group: ['Advanced'],
    };
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    const sourceUrl = buildCodeNodeSourceUrl(this.chartNode.id, context.processId);
    const interpolationContext = getJsValueInterpolationRuntimeContext(this.data.code, CODE_NEW_INPUTS_IDENTIFIER);
    const { inputNames, inputsIdentifier } = interpolationContext;
    const { source, userCodeLineOffset } = buildCodeNewWrapper(this.data.code, interpolationContext);

    try {
      const outputs = await context.codeRunner.runCode(
        appendCodeNodeSourceUrl(source, sourceUrl),
        inputs,
        {
          includeFetch: this.data.allowFetch ?? false,
          includeRequire: this.data.allowRequire ?? false,
          includeRivet: this.data.allowRivet ?? false,
          includeProcess: this.data.allowProcess ?? false,
          includeConsole: this.data.allowConsole ?? false,
        },
        context.graphInputNodeValues,
        context.contextValues,
      );

      return validateCodeNewRunnerOutputs(outputs);
    } catch (error) {
      const enrichedError = await enrichCodeNodeErrorWithLocation({
        code: this.data.code,
        diagnosticCode: source,
        error,
        locationLabel: 'Code node',
        sourceUrl,
        userCodeLineOffset,
      });

      throw sanitizeCodeNewError(enrichedError, inputNames, inputsIdentifier);
    }
  }
}

export const codeNewNode = nodeDefinition(CodeNewNodeImpl, 'Code');
