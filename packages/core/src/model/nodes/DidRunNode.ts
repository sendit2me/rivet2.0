import { nanoid } from 'nanoid/non-secure';
import { dedent } from 'ts-dedent';
import {
  type ChartNode,
  type NodeConnection,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
} from '../NodeBase.js';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { type Inputs, type Outputs } from '../GraphProcessor.js';

export type DidRunNode = ChartNode<'didRun', DidRunNodeData>;

export type DidRunNodeData = {};

export class DidRunNodeImpl extends NodeImpl<DidRunNode> {
  static create(): DidRunNode {
    return {
      type: 'didRun',
      title: 'Did Run',
      id: nanoid() as NodeId,
      data: {},
      visualData: {
        x: 0,
        y: 0,
        width: 250,
      },
    };
  }

  getInputDefinitions(connections: NodeConnection[]): NodeInputDefinition[] {
    const inputCount = this.#getInputPortCount(connections);
    const inputs: NodeInputDefinition[] = [];

    for (let i = 1; i <= inputCount; i++) {
      inputs.push({
        dataType: 'any',
        id: `input${i}` as PortId,
        title: `Input ${i}`,
      });
    }

    return inputs;
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        dataType: 'boolean',
        id: 'ran' as PortId,
        title: 'Ran',
      },
    ];
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Outputs true when all connected inputs have run. Falsy or empty values still count as having run, so this is useful for adapting "did this branch run at all?" into a boolean If port.
      `,
      infoBoxTitle: 'Did Run Node',
      contextMenuTitle: 'Did Run',
      group: ['Logic'],
    };
  }

  getBody(): string {
    return 'Outputs true when all connected inputs have run. Falsy or empty values still count';
  }

  #getInputPortCount(connections: NodeConnection[]): number {
    const inputNodeId = this.chartNode.id;
    const inputConnections = connections.filter(
      (connection) => connection.inputNodeId === inputNodeId && connection.inputId.startsWith('input'),
    );

    let maxInputNumber = 0;
    for (const connection of inputConnections) {
      const inputNumber = parseInt(connection.inputId.replace('input', ''), 10);
      if (inputNumber > maxInputNumber) {
        maxInputNumber = inputNumber;
      }
    }

    return maxInputNumber + 1;
  }

  async process(inputData: Inputs): Promise<Outputs> {
    const hasDynamicInput = Object.keys(inputData).some((key) => key.startsWith('input'));

    if (!hasDynamicInput) {
      return {
        ['ran' as PortId]: {
          type: 'control-flow-excluded',
          value: undefined,
        },
      };
    }

    return {
      ['ran' as PortId]: {
        type: 'boolean',
        value: true,
      },
    };
  }
}

export const didRunNode = nodeDefinition(DidRunNodeImpl, 'Did Run');
