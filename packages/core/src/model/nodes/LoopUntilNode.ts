import {
  type ChartNode,
  type NodeConnection,
  type NodeId,
  type NodeInputDefinition,
  type NodeOutputDefinition,
  type PortId,
} from '../NodeBase.js';
import { NodeImpl, type NodeDefinitionContext, type NodeUIData } from '../NodeImpl.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { type Inputs, type Outputs } from '../GraphProcessor.js';
import { type GraphId } from '../NodeGraph.js';
import { nanoid } from 'nanoid/non-secure';
import { type Project, type ProjectId } from '../Project.js';
import { type DataValue } from '../DataValue.js';
import { type InternalProcessContext } from '../ProcessContext.js';
import { type EditorDefinition } from '../EditorDefinition.js';
import { dedent } from 'ts-dedent';
import type { RivetUIContext } from '../RivetUIContext.js';
import {
  getGraphBoundary,
  getGraphBoundaryInputDefinitions,
  getGraphBoundaryOutputDefinitions,
} from '../GraphBoundaryCache.js';

type ConditionType = 'allOutputsSet' | 'inputEqual';

export type LoopUntilNode = ChartNode<'loopUntil', LoopUntilNodeData>;

export type LoopUntilNodeData = {
  targetGraph: GraphId | undefined;
  conditionType: ConditionType;
  maxIterations?: number;

  // For inputEqual condition
  inputToCheck?: string;
  targetValue?: string;

  /** Data for each of the inputs of the subgraph */
  inputData?: Record<string, DataValue>;
};

export class LoopUntilNodeImpl extends NodeImpl<LoopUntilNode> {
  static create(): LoopUntilNode {
    const chartNode: LoopUntilNode = {
      type: 'loopUntil',
      title: 'Loop Until',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 200,
      },
      data: {
        targetGraph: undefined,
        conditionType: 'allOutputsSet',
      },
    };

    return chartNode;
  }

  getInputDefinitions(
    _connections: NodeConnection[],
    _nodes: Record<NodeId, ChartNode>,
    project: Project,
    _referencedProjects: Record<ProjectId, Project>,
    definitionContext?: NodeDefinitionContext,
  ): NodeInputDefinition[] {
    const boundary = this.getBoundary(project, definitionContext);
    return boundary ? getGraphBoundaryInputDefinitions(boundary) : [];
  }

  getOutputDefinitions(
    _connections: NodeConnection[],
    _nodes: Record<NodeId, ChartNode>,
    project: Project,
    _referencedProjects: Record<ProjectId, Project>,
    definitionContext?: NodeDefinitionContext,
  ): NodeOutputDefinition[] {
    const boundary = this.getBoundary(project, definitionContext);
    const outputs: NodeOutputDefinition[] = boundary ? getGraphBoundaryOutputDefinitions(boundary) : [];

    // Add standard loop outputs
    outputs.push(
      {
        id: 'iteration' as PortId,
        title: 'Iterations',
        dataType: 'number',
        description: 'The number of iterations completed.',
      },
      {
        id: 'completed' as PortId,
        title: 'Completed',
        dataType: 'boolean',
        description: 'True when the loop has completed.',
      },
    );

    return outputs;
  }

  getEditors(context: RivetUIContext): EditorDefinition<LoopUntilNode>[] {
    const definitions: EditorDefinition<LoopUntilNode>[] = [
      {
        type: 'graphSelector',
        label: 'Target Graph',
        dataKey: 'targetGraph',
      },
      {
        type: 'dropdown',
        dataKey: 'conditionType',
        label: 'Stop Condition',
        options: [
          { label: 'All Outputs Set', value: 'allOutputsSet' },
          { label: 'Input Equals Value', value: 'inputEqual' },
        ],
        helperMessage: 'The condition that will stop the loop',
      },
      {
        type: 'number',
        dataKey: 'maxIterations',
        label: 'Max Iterations',
        helperMessage: 'Maximum number of iterations (optional, leave empty for unlimited)',
        allowEmpty: true,
      },
    ];

    if (this.data.conditionType === 'inputEqual') {
      definitions.push(
        {
          type: 'string',
          dataKey: 'inputToCheck',
          label: 'Input to Check',
          helperMessage: 'The name of the input to compare',
        },
        {
          type: 'string',
          dataKey: 'targetValue',
          label: 'Target Value',
          helperMessage: 'The value to compare against',
        },
      );
    }

    // Add dynamic editors for graph inputs
    if (this.data.targetGraph) {
      const boundary = getGraphBoundary(context.project, this.data.targetGraph);
      if (boundary) {
        for (const input of boundary.inputs) {
          definitions.push({
            type: 'dynamic',
            dataKey: 'inputData',
            dynamicDataKey: input.id,
            dataType: input.dataType,
            label: input.id,
            editor: input.editor ?? 'auto',
          });
        }
      }
    }

    return definitions;
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Executes a subgraph in a loop until a condition is met. Each iteration's outputs become
        the inputs for the next iteration. Supports different stopping conditions and optional
        maximum iterations.
      `,
      infoBoxTitle: 'Loop Until Node',
      contextMenuTitle: 'Loop Until',
      group: ['Logic'],
    };
  }

  getBody(context: RivetUIContext): string {
    if (!this.data.targetGraph) {
      return 'No target graph selected';
    }

    const graphName = context.project.graphs[this.data.targetGraph]?.metadata?.name ?? 'Unknown Graph';
    const condition =
      this.data.conditionType === 'allOutputsSet'
        ? 'all outputs are set'
        : `${this.data.inputToCheck} equals ${this.data.targetValue}`;

    const maxIterations = this.data.maxIterations ? `\nMax iterations: ${this.data.maxIterations}` : '';

    return `Executes ${graphName}\nuntil ${condition}${maxIterations}`;
  }

  private getBoundary(project: Project, definitionContext?: NodeDefinitionContext) {
    return (
      definitionContext?.getGraphBoundary(project, this.data.targetGraph) ??
      getGraphBoundary(project, this.data.targetGraph)
    );
  }

  private shouldBreak(outputs: Outputs): boolean {
    if (this.data.conditionType === 'allOutputsSet') {
      // Check if any output is control-flow-excluded
      const anyInputIsExcluded = Object.values(outputs)
        .filter((o) => o != null)
        .some((output) => output.type === 'control-flow-excluded');
      return !anyInputIsExcluded;
    } else if (this.data.conditionType === 'inputEqual' && this.data.inputToCheck && this.data.targetValue) {
      const inputValue = outputs[this.data.inputToCheck as PortId];
      return inputValue?.value?.toString() === this.data.targetValue;
    }

    return false;
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    if (!this.data.targetGraph) {
      throw new Error('No target graph selected');
    }

    let iteration = 0;
    let currentInputs = { ...inputs };

    // Add any default values from inputData
    if (this.data.inputData) {
      Object.entries(this.data.inputData).forEach(([key, value]) => {
        if (currentInputs[key as PortId] === undefined) {
          currentInputs[key as PortId] = value;
        }
      });
    }

    let lastOutputs: Outputs = {};

    while (!context.signal.aborted) {
      // Check max iterations if set
      if (this.data.maxIterations && iteration >= this.data.maxIterations) {
        break;
      }

      const subprocessor = context.createSubProcessor(this.data.targetGraph, { signal: context.signal });
      lastOutputs = await subprocessor.processGraph(
        context,
        currentInputs as Record<string, DataValue>,
        context.contextValues,
      );

      iteration++;

      // Check if the condition is met
      if (this.shouldBreak(lastOutputs)) {
        break;
      }

      context.onPartialOutputs?.(lastOutputs);

      // Use outputs as inputs for next iteration
      currentInputs = lastOutputs;
    }

    return {
      ...lastOutputs,
      ['iteration' as PortId]: { type: 'number', value: iteration },
      ['completed' as PortId]: { type: 'boolean', value: true },
    };
  }
}

export const loopUntilNode = nodeDefinition(LoopUntilNodeImpl, 'Loop Until');
