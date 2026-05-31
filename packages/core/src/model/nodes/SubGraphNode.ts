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
import { type EditorDefinition } from '../../index.js';
import { dedent } from 'ts-dedent';
import { getError } from '../../utils/errors.js';

import type { RivetUIContext } from '../RivetUIContext.js';
import {
  applyGraphBoundaryPortOrder,
  buildExcludedGraphBoundaryOutputs,
  buildGraphBoundaryInputData,
  GRAPH_BOUNDARY_OUTPUT_DEMAND_OPTIMIZATION_ENABLED,
  getGraphBoundary,
  getGraphBoundaryInputDefinitions,
  getGraphBoundaryOutputDefinitions,
  getRequestedGraphOutputNodeIds,
  type GraphBoundary,
} from '../GraphBoundaryCache.js';

export type SubGraphNode = ChartNode & {
  type: 'subGraph';
  data: {
    graphId: GraphId;
    useErrorOutput?: boolean;
    useAsGraphPartialOutput?: boolean;

    /** Data for each of the inputs of the subgraph */
    inputData?: Record<string, DataValue>;
    inputPortOrder?: string[];
    outputPortOrder?: string[];
  };
};

export class SubGraphNodeImpl extends NodeImpl<SubGraphNode> {
  static create(): SubGraphNode {
    const chartNode: SubGraphNode = {
      type: 'subGraph',
      title: 'Subgraph',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 300,
      },
      data: {
        graphId: '' as GraphId,
        useErrorOutput: false,
        useAsGraphPartialOutput: false,
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
    return boundary ? getGraphBoundaryInputDefinitions(boundary, this.data.inputPortOrder) : [];
  }

  getGraphOutputs(project: Project, definitionContext?: NodeDefinitionContext): NodeOutputDefinition[] {
    const boundary = this.getBoundary(project, definitionContext);
    return boundary ? getGraphBoundaryOutputDefinitions(boundary, this.data.outputPortOrder) : [];
  }

  getOutputDefinitions(
    _connections: NodeConnection[],
    _nodes: Record<NodeId, ChartNode>,
    project: Project,
    _referencedProjects: Record<ProjectId, Project>,
    definitionContext?: NodeDefinitionContext,
  ): NodeOutputDefinition[] {
    const outputs: NodeOutputDefinition[] = [];

    outputs.push(...this.getGraphOutputs(project, definitionContext));

    if (this.data.useErrorOutput) {
      outputs.push({
        id: 'error' as PortId,
        title: 'Error',
        dataType: 'string',
      });
    }

    return outputs;
  }

  private getBoundary(project: Project, definitionContext?: NodeDefinitionContext) {
    return (
      definitionContext?.getGraphBoundary(project, this.data.graphId) ?? getGraphBoundary(project, this.data.graphId)
    );
  }

  getEditors(context: RivetUIContext): EditorDefinition<SubGraphNode>[] {
    const definitions: EditorDefinition<SubGraphNode>[] = [
      {
        type: 'graphSelector',
        label: 'Graph',
        dataKey: 'graphId',
      },
      {
        type: 'toggle',
        label: 'Use Error Output',
        dataKey: 'useErrorOutput',
      },
    ];

    if (this.data.graphId) {
      const boundary = getGraphBoundary(context.project, this.data.graphId);
      if (boundary) {
        for (const input of applyGraphBoundaryPortOrder(boundary.inputs, this.data.inputPortOrder)) {
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
        Executes another graph. Inputs and outputs are defined by Graph Input and Graph Output nodes within the subgraph.
      `,
      infoBoxTitle: 'Subgraph Node',
      contextMenuTitle: 'Subgraph',
      group: ['Advanced'],
    };
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    const { project } = context;

    if (!project) {
      throw new Error('SubGraphNode requires a project to be set in the context.');
    }

    const graph = project.graphs[this.data.graphId];
    if (!graph) {
      throw new Error(`SubGraphNode requires a graph with id ${this.data.graphId} to be present in the project.`);
    }

    const boundary =
      context.getGraphBoundary?.(project, this.data.graphId) ?? getGraphBoundary(project, this.data.graphId)!;
    const inputData = buildGraphBoundaryInputData(boundary, inputs, this.data.inputData);

    const shouldRunWholeGraph =
      !GRAPH_BOUNDARY_OUTPUT_DEMAND_OPTIMIZATION_ENABLED ||
      context.isDirectRunTarget ||
      this.data.useAsGraphPartialOutput === true ||
      (this.data.useErrorOutput === true && context.activeOutputPortIds.has('error' as PortId));
    const requestedGraphOutputNodeIds = shouldRunWholeGraph
      ? []
      : getRequestedGraphOutputNodeIds(boundary, context.activeOutputPortIds);

    if (!shouldRunWholeGraph && requestedGraphOutputNodeIds.length === 0) {
      return buildSkippedSubgraphOutputs(boundary, this.data.useErrorOutput);
    }

    const subGraphProcessor = context.createSubProcessor(this.data.graphId, { signal: context.signal });
    if (!shouldRunWholeGraph) {
      subGraphProcessor.runToNodeIds = requestedGraphOutputNodeIds;
    }

    try {
      const startTime = Date.now();

      const graphOutputs = await subGraphProcessor.processGraph(
        context,
        inputData as Record<string, DataValue>,
        context.contextValues,
      );
      const outputs = shouldRunWholeGraph
        ? graphOutputs
        : {
            ...buildExcludedGraphBoundaryOutputs(boundary),
            ...graphOutputs,
          };

      const duration = Date.now() - startTime;

      if (this.data.useErrorOutput) {
        outputs['error' as PortId] = {
          type: 'control-flow-excluded',
          value: undefined,
        };
      }

      if (outputs['duration' as PortId] == null) {
        outputs['duration' as PortId] = {
          type: 'number',
          value: duration,
        };
      }

      return outputs;
    } catch (err) {
      if (!this.data.useErrorOutput) {
        throw err;
      }

      const outputs: Outputs = buildExcludedGraphBoundaryOutputs(boundary);

      outputs['error' as PortId] = {
        type: 'string',
        value: getError(err).message,
      };

      return outputs;
    }
  }
}

export const subGraphNode = nodeDefinition(SubGraphNodeImpl, 'Subgraph');

function buildSkippedSubgraphOutputs(boundary: GraphBoundary, useErrorOutput: boolean | undefined): Outputs {
  const outputs: Outputs = buildExcludedGraphBoundaryOutputs(boundary);

  if (useErrorOutput) {
    outputs['error' as PortId] = {
      type: 'control-flow-excluded',
      value: undefined,
    };
  }

  outputs['cost' as PortId] = {
    type: 'number',
    value: 0,
  };
  outputs['duration' as PortId] = {
    type: 'number',
    value: 0,
  };

  return outputs;
}
