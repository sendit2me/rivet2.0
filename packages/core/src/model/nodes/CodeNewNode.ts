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
import { createInterpolationInputDefinition } from '../interpolationInputDefinition.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { type NodeBodySpec } from '../NodeBodySpec.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import { getError } from '../../utils/errors.js';
import {
  appendCodeNodeSourceUrl,
  buildCodeNodeSourceUrl,
  enrichCodeNodeErrorWithLocation,
} from './codeNodeErrorDiagnostics.js';
import {
  buildClonedInputValueAssignments,
  buildCloneJsInputValueFunction,
  buildJsValueInterpolatedSource,
  getJsValueInterpolationInputNames,
  getSafeJsValueInterpolationIdentifier,
  interpolateJsValuePreviewSource,
  sanitizeGeneratedJsValueText,
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
  return code.split('\n').slice(0, MAX_BODY_PREVIEW_LINES).join('\n').trim();
}

function getCodeNewInputNames(code: string): string[] {
  return getJsValueInterpolationInputNames(code);
}

function buildCodeNewRuntimeSource(code: string, inputsIdentifier: string): string {
  return buildJsValueInterpolatedSource(code, inputsIdentifier, { trim: false });
}

function buildCodeNewInputsInitializer(inputNames: string[], inputsIdentifier: string): string {
  return dedent`
    ${buildCloneJsInputValueFunction()}
    const ${inputsIdentifier} = Object.create(null);
    const ${CODE_NEW_INPUT_CLONE_CACHE_IDENTIFIER} = new WeakMap();
    ${buildClonedInputValueAssignments(
      inputNames,
      inputsIdentifier,
      CODE_NEW_INPUT_CLONE_CACHE_IDENTIFIER,
    )}
  `;
}

export function interpolateCodeNewSource(code: string, inputs: Inputs): string {
  return interpolateJsValuePreviewSource(code, inputs, { trim: false });
}

function sanitizeGeneratedCodeNewText(
  text: string | undefined,
  inputNames: string[],
  inputsIdentifier: string,
): string | undefined {
  return sanitizeGeneratedJsValueText(text, inputNames, inputsIdentifier, 'code input');
}

function sanitizeCodeNewError(error: unknown, inputNames: string[], inputsIdentifier: string): Error {
  const codeError = getError(error);
  codeError.message = sanitizeGeneratedCodeNewText(codeError.message, inputNames, inputsIdentifier) ?? codeError.message;
  codeError.stack = sanitizeGeneratedCodeNewText(codeError.stack, inputNames, inputsIdentifier);

  return codeError;
}

function buildCodeNewWrapper(
  code: string,
  inputNames: string[],
): {
  inputsIdentifier: string;
  source: string;
  userCodeLineOffset: number;
} {
  const inputsIdentifier = getSafeJsValueInterpolationIdentifier(code, CODE_NEW_INPUTS_IDENTIFIER);
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
    inputsIdentifier,
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
    return getCodeNewInputNames(this.data.code).map((inputName) => {
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
    const inputNames = getCodeNewInputNames(this.data.code);
    const { inputsIdentifier, source, userCodeLineOffset } = buildCodeNewWrapper(this.data.code, inputNames);

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
