import {
  type ChartNode,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
} from '../NodeBase.js';
import { nanoid } from 'nanoid/non-secure';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { type Inputs, type Outputs } from '../GraphProcessor.js';
import { type EditorDefinition } from '../../index.js';
import { isEqual } from 'lodash-es';
import { match } from 'ts-pattern';
import { dedent } from 'ts-dedent';
import { nodeDefinition } from '../NodeDefinition.js';
import { coerceType, coerceTypeOptional } from '../../utils/coerceType.js';

export type CompareNode = ChartNode<'compare', CompareNodeData>;

export type CompareNodeData = {
  comparisonFunction: '==' | '<' | '>' | '<=' | '>=' | '!=' | 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'xnor';
  useComparisonFunctionInput?: boolean;
};

export const compareNodeComparisonFunctionOptions: Array<{
  label: string;
  value: CompareNodeData['comparisonFunction'];
}> = [
  { label: '==', value: '==' },
  { label: '!=', value: '!=' },
  { label: '<', value: '<' },
  { label: '<=', value: '<=' },
  { label: '>', value: '>' },
  { label: '>=', value: '>=' },
  { label: 'and', value: 'and' },
  { label: 'or', value: 'or' },
  { label: 'xor', value: 'xor' },
  { label: 'nand', value: 'nand' },
  { label: 'nor', value: 'nor' },
  { label: 'xnor', value: 'xnor' },
];

export class CompareNodeImpl extends NodeImpl<CompareNode> {
  static create(): CompareNode {
    const chartNode: CompareNode = {
      type: 'compare',
      title: 'Compare',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 160,
      },
      data: {
        comparisonFunction: '==',
      },
    };

    return chartNode;
  }

  getInputDefinitions(): NodeInputDefinition[] {
    const inputs: NodeInputDefinition[] = [
      {
        dataType: 'any',
        id: 'a' as PortId,
        title: 'A',
      },
      {
        dataType: 'any',
        id: 'b' as PortId,
        title: 'B',
      },
    ];

    if (this.data.useComparisonFunctionInput) {
      inputs.push({
        dataType: 'string',
        id: 'comparisonFunction' as PortId,
        title: 'Comparison Function',
      });
    }

    return inputs;
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return [
      {
        dataType: 'boolean',
        id: 'output' as PortId,
        title: 'Output',
      },
    ];
  }

  getEditors(): EditorDefinition<CompareNode>[] {
    return [
      {
        type: 'dropdown',
        label: 'Comparison Function',
        dataKey: 'comparisonFunction',
        options: compareNodeComparisonFunctionOptions,
        useInputToggleDataKey: 'useComparisonFunctionInput',
      },
    ];
  }

  getBody(): string | undefined {
    return this.data.useComparisonFunctionInput ? 'A (Comparison Function) B' : `A ${this.data.comparisonFunction} B`;
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Compares two values using the configured operator and outputs the result.

        If the data types of the values do not match, then the B value is converted to the type of the A value.
      `,
      infoBoxTitle: 'Compare Node',
      contextMenuTitle: 'Compare',
      group: ['Logic'],
    };
  }

  async process(inputs: Inputs): Promise<Outputs> {
    const comparisonFunction = (
      this.data.useComparisonFunctionInput
        ? coerceType(inputs['comparisonFunction' as PortId], 'string')
        : this.data.comparisonFunction
    ) as CompareNodeData['comparisonFunction'];

    const inputA = inputs['a' as PortId];
    const inputB = inputs['b' as PortId];

    if (!inputA) {
      return {
        ['output' as PortId]: {
          type: 'boolean',
          value: match(comparisonFunction)
            .with('==', () => !inputB)
            .with('!=', () => !!inputB)
            .otherwise(() => false),
        },
      };
    }

    const value1 = inputA.value;
    const value2 = inputB?.type !== inputA.type ? coerceTypeOptional(inputB, inputA.type) : inputB.value;
    const compareValues = (left: string | number | boolean, right: string | number | boolean) => ({
      '<': left < right,
      '>': left > right,
      '<=': left <= right,
      '>=': left >= right,
    });

    return {
      ['output' as PortId]: {
        type: 'boolean',
        value: match(comparisonFunction)
          .with('==', () => isEqual(value1, value2))
          .with('!=', () => !isEqual(value1, value2))
          .with('<', () => compareValues(value1 as string | number | boolean, value2 as string | number | boolean)['<'])
          .with('>', () => compareValues(value1 as string | number | boolean, value2 as string | number | boolean)['>'])
          .with('<=', () => compareValues(value1 as string | number | boolean, value2 as string | number | boolean)['<='])
          .with('>=', () => compareValues(value1 as string | number | boolean, value2 as string | number | boolean)['>='])
          .with('and', () => !!(value1 && value2))
          .with('or', () => !!(value1 || value2))
          .with('xor', () => !!(value1 ? !value2 : value2))
          .with('nand', () => !(value1 && value2))
          .with('nor', () => !(value1 || value2))
          .with('xnor', () => !(value1 ? !value2 : value2))
          .exhaustive(),
      },
    };
  }
}

export const compareNode = nodeDefinition(CompareNodeImpl, 'Compare');
