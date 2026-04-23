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
import {
  assertJSListNodeOutputs,
  buildJSFilterWrapper,
  getJSListCallbackInterpolationInputDefinitions,
  interpolateJSListCallbackBody,
  wrapJSListCallbackPreview,
} from './jsListCallbackHelpers.js';

export type JSFilterNode = ChartNode<'jsFilter', JSFilterNodeData>;

export type JSFilterNodeData = {
  callbackBody: string;
};

const DEFAULT_CALLBACK_BODY = 'return item != null;';

export class JSFilterNodeImpl extends NodeImpl<JSFilterNode> {
  static create(): JSFilterNode {
    const chartNode: JSFilterNode = {
      type: 'jsFilter',
      title: 'JS Filter',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 220,
      },
      data: {
        callbackBody: DEFAULT_CALLBACK_BODY,
      },
    };

    return chartNode;
  }

  getInputDefinitions(): NodeInputDefinition[] {
    return [
      {
        id: 'array' as PortId,
        title: 'Array',
        dataType: 'any[]',
        required: true,
      },
      ...getJSListCallbackInterpolationInputDefinitions(this.data.callbackBody),
    ];
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        id: 'filtered' as PortId,
        title: 'Filtered',
        dataType: 'any[]',
      },
    ];
  }

  getEditors(): EditorDefinition<JSFilterNode>[] {
    return [
      {
        type: 'code',
        label: 'Callback Body',
        helperMessage:
          'Body of: (item, index, array) => { ... }. Use {{var}} for raw JS source inputs; strings need quotes.',
        dataKey: 'callbackBody',
        language: 'javascript',
        enableFolding: true,
      },
    ];
  }

  getBody(): NodeBodySpec {
    return {
      type: 'colorized',
      text: wrapJSListCallbackPreview('(item, index, array)', this.data.callbackBody),
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    };
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Filters an input array using the body of a JavaScript callback.

        Available callback parameters are <code>item</code>, <code>index</code>, and <code>array</code>.
        Write only the callback body and still use <code>return</code> to decide whether each item is included.
        Use <code>{{var}}</code> to add raw JavaScript source inputs; string literals should include their own quotes.
      `,
      infoBoxTitle: 'JS Filter Node',
      contextMenuTitle: 'JS Filter',
      group: ['Lists'],
    };
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    const outputs = await context.codeRunner.runCode(
      buildJSFilterWrapper(interpolateJSListCallbackBody(this.data.callbackBody, inputs)),
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

    assertJSListNodeOutputs(outputs, 'filtered', 'JS Filter');
    return outputs;
  }
}

export const jsFilterNode = nodeDefinition(JSFilterNodeImpl, 'JS Filter');
