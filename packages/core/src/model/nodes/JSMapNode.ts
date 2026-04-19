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
  buildJSMapWrapper,
  wrapJSListCallbackPreview,
} from './jsListCallbackHelpers.js';

export type JSMapNode = ChartNode<'jsMap', JSMapNodeData>;

export type JSMapNodeData = {
  callbackBody: string;
};

const DEFAULT_CALLBACK_BODY = 'return item;';

export class JSMapNodeImpl extends NodeImpl<JSMapNode> {
  static create(): JSMapNode {
    const chartNode: JSMapNode = {
      type: 'jsMap',
      title: 'JS Map',
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
    ];
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        id: 'mapped' as PortId,
        title: 'Mapped',
        dataType: 'any[]',
      },
    ];
  }

  getEditors(): EditorDefinition<JSMapNode>[] {
    return [
      {
        type: 'code',
        label: 'Callback Body',
        helperMessage: 'Body of: (item, index, array) => { ... }',
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
        Maps an input array using the body of a JavaScript callback.

        Available callback parameters are <code>item</code>, <code>index</code>, and <code>array</code>.
        Write only the callback body and still use <code>return</code> to produce each mapped item.
      `,
      infoBoxTitle: 'JS Map Node',
      contextMenuTitle: 'JS Map',
      group: ['Lists'],
    };
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    const outputs = await context.codeRunner.runCode(
      buildJSMapWrapper(this.data.callbackBody),
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

    assertJSListNodeOutputs(outputs, 'mapped', 'JS Map');
    return outputs;
  }
}

export const jsMapNode = nodeDefinition(JSMapNodeImpl, 'JS Map');
