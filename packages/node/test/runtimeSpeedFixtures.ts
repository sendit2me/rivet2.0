import {
  GraphProcessor,
  globalRivetNodeRegistry,
  looseDataValuesToDataValues,
  type ChartNode,
  type ChatMessage,
  type DataType,
  type DataValue,
  type GraphId,
  type GptFunction,
  type LooseDataValue,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type PortId,
  type ProcessContext,
  type Project,
  type ProjectId,
  type ProjectReference,
  type ProjectReferenceLoader,
  type Tokenizer,
  type TokenizerCallInfo,
} from '../src/index.js';
import { NodeCodeRunner } from '../src/native/NodeCodeRunner.js';

export type RuntimeSpeedProjectFixture = {
  graphId: GraphId;
  project: Project;
  terminalNodeId?: NodeId;
};

export type RuntimeSpeedReferencedProjectFixture = RuntimeSpeedProjectFixture & {
  projectReferenceLoader: ProjectReferenceLoader;
  referencedProject: Project;
};

class RuntimeSpeedTokenizer implements Tokenizer {
  on(_event: 'error', _listener: (err: Error) => void): () => void {
    return () => {};
  }

  async getTokenCountForString(input: string, _info: TokenizerCallInfo): Promise<number> {
    return input.length;
  }

  async getTokenCountForMessages(
    messages: ChatMessage[],
    _gptFunctions: GptFunction[] | undefined,
    _info: TokenizerCallInfo,
  ): Promise<number> {
    return messages.reduce((total, message) => {
      if (typeof message.message === 'string') {
        return total + message.message.length;
      }

      if (!Array.isArray(message.message)) {
        return total;
      }

      return (
        total +
        message.message.reduce((messageTotal, part) => {
          if (typeof part === 'string') {
            return messageTotal + part.length;
          }

          if (part.type === 'url') {
            return messageTotal + part.url.length;
          }

          if (part.type === 'document') {
            return messageTotal + (part.title?.length ?? 0) + (part.context?.length ?? 0);
          }

          return messageTotal;
        }, 0)
      );
    }, 0);
  }
}

export function createRuntimeSpeedProcessContext(
  overrides: Partial<Pick<ProcessContext, 'projectPath' | 'projectReferenceLoader'>> = {},
): ProcessContext {
  return {
    codeRunner: new NodeCodeRunner(),
    ...overrides,
    settings: {
      openAiEndpoint: process.env.OPENAI_ENDPOINT ?? '',
      openAiKey: process.env.OPENAI_API_KEY ?? '',
      openAiOrganization: process.env.OPENAI_ORG_ID ?? '',
    },
    tokenizer: new RuntimeSpeedTokenizer(),
  };
}

export function createRuntimeSpeedProcessor(project: Project, graphId: GraphId): GraphProcessor {
  const processor = new GraphProcessor(project, graphId, globalRivetNodeRegistry);
  processor.executor = 'nodejs';
  return processor;
}

export async function runRuntimeSpeedProcessor(
  fixture: RuntimeSpeedProjectFixture,
  options: {
    context?: Record<string, LooseDataValue>;
    inputs?: Record<string, LooseDataValue>;
    projectPath?: string;
    projectReferenceLoader?: ProjectReferenceLoader;
  } = {},
): Promise<Record<string, DataValue>> {
  const processor = createRuntimeSpeedProcessor(fixture.project, fixture.graphId);
  return processor.processGraph(
    createRuntimeSpeedProcessContext({
      projectPath: options.projectPath,
      projectReferenceLoader: options.projectReferenceLoader,
    }),
    looseDataValuesToDataValues(options.inputs ?? {}),
    looseDataValuesToDataValues(options.context ?? {}),
  );
}

export function makeTextChainProject(nodeCount: number): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'string');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'string');
  const nodes: ChartNode[] = [inputNode];
  const connections: NodeConnection[] = [];
  let previousNodeId = inputNode.id;
  let previousOutputId = 'data' as PortId;

  for (let i = 0; i < nodeCount; i++) {
    const textNode = makeTextNode(`text-${i}`, '{{input}}x');
    nodes.push(textNode);
    connections.push(connect(previousNodeId, previousOutputId, textNode.id, 'input'));
    previousNodeId = textNode.id;
    previousOutputId = 'output' as PortId;
  }

  nodes.push(outputNode);
  connections.push(connect(previousNodeId, previousOutputId, outputNode.id, 'value'));

  return makeFixture(nodes, connections, outputNode.id);
}

export function makeExpressionChainProject(nodeCount: number): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'number');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'any');
  const nodes: ChartNode[] = [inputNode];
  const connections: NodeConnection[] = [];
  let previousNodeId = inputNode.id;
  let previousOutputId = 'data' as PortId;

  for (let i = 0; i < nodeCount; i++) {
    const expressionNode = makeExpressionNode(`expression-${i}`, '{{input}} + 1');
    nodes.push(expressionNode);
    connections.push(connect(previousNodeId, previousOutputId, expressionNode.id, 'input'));
    previousNodeId = expressionNode.id;
    previousOutputId = 'output' as PortId;
  }

  nodes.push(outputNode);
  connections.push(connect(previousNodeId, previousOutputId, outputNode.id, 'value'));

  return makeFixture(nodes, connections, outputNode.id);
}

export function makeCodeChainProject(nodeCount: number): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'number');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'any');
  const nodes: ChartNode[] = [inputNode];
  const connections: NodeConnection[] = [];
  let previousNodeId = inputNode.id;
  let previousOutputId = 'data' as PortId;

  for (let i = 0; i < nodeCount; i++) {
    const codeNode = makeCodeNode(`code-${i}`, 'return {{input}} + 1;');
    nodes.push(codeNode);
    connections.push(connect(previousNodeId, previousOutputId, codeNode.id, 'input'));
    previousNodeId = codeNode.id;
    previousOutputId = 'output' as PortId;
  }

  nodes.push(outputNode);
  connections.push(connect(previousNodeId, previousOutputId, outputNode.id, 'value'));

  return makeFixture(nodes, connections, outputNode.id);
}

export function makeWideTextFanInProject(branchCount: number): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'string');
  const joinNode = makeJoinNode('join-output');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'string');
  const nodes: ChartNode[] = [inputNode, joinNode, outputNode];
  const connections: NodeConnection[] = [];

  for (let i = 0; i < branchCount; i++) {
    const textNode = makeTextNode(`wide-text-${i}`, `{{input}}-${i}`);
    nodes.push(textNode);
    connections.push(connect(inputNode.id, 'data', textNode.id, 'input'));
    connections.push(connect(textNode.id, 'output', joinNode.id, `input${i + 1}`));
  }

  connections.push(connect(joinNode.id, 'output', outputNode.id, 'value'));

  return makeFixture(nodes, connections, outputNode.id);
}

export function makeSameSourceFanInProject(): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'string');
  const joinNode = makeJoinNode('join-output');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'string');

  return makeFixture(
    [inputNode, joinNode, outputNode],
    [
      connect(inputNode.id, 'data', joinNode.id, 'input1'),
      connect(inputNode.id, 'data', joinNode.id, 'input2'),
      connect(joinNode.id, 'output', outputNode.id, 'value'),
    ],
    outputNode.id,
  );
}

export function makeSubgraphChainProject(subgraphCallCount: number): RuntimeSpeedProjectFixture {
  const mainGraphId = 'runtime-speed-main' as GraphId;
  const subGraphId = 'runtime-speed-subgraph' as GraphId;
  const mainInput = makeGraphInputNode('graph-input', 'input', 'string');
  const mainOutput = makeGraphOutputNode('graph-output', 'result', 'string');
  const mainNodes: ChartNode[] = [mainInput];
  const mainConnections: NodeConnection[] = [];
  let previousNodeId = mainInput.id;
  let previousOutputId = 'data' as PortId;

  for (let i = 0; i < subgraphCallCount; i++) {
    const subgraphNode = makeSubgraphNode(`subgraph-${i}`, subGraphId);
    mainNodes.push(subgraphNode);
    mainConnections.push(connect(previousNodeId, previousOutputId, subgraphNode.id, 'input'));
    previousNodeId = subgraphNode.id;
    previousOutputId = 'result' as PortId;
  }

  mainNodes.push(mainOutput);
  mainConnections.push(connect(previousNodeId, previousOutputId, mainOutput.id, 'value'));

  const subInput = makeGraphInputNode('subgraph-input', 'input', 'string');
  const subText = makeTextNode('subgraph-text', '{{input}}x');
  const subOutput = makeGraphOutputNode('subgraph-output', 'result', 'string');
  const subgraph: NodeGraph = {
    connections: [
      connect(subInput.id, 'data', subText.id, 'input'),
      connect(subText.id, 'output', subOutput.id, 'value'),
    ],
    metadata: {
      description: '',
      id: subGraphId,
      name: 'Runtime Speed Subgraph',
    },
    nodes: [subInput, subText, subOutput],
  };

  return {
    graphId: mainGraphId,
    project: {
      graphs: {
        [mainGraphId]: {
          connections: mainConnections,
          metadata: {
            description: '',
            id: mainGraphId,
            name: 'Runtime Speed Main',
          },
          nodes: mainNodes,
        },
        [subGraphId]: subgraph,
      },
      metadata: {
        description: '',
        id: 'runtime-speed-project' as ProjectId,
        mainGraphId,
        title: 'Runtime Speed Project',
      },
      plugins: [],
    },
    terminalNodeId: mainOutput.id,
  };
}

export function makeRepeatedSubgraphFanInProject(subgraphCallCount: number): RuntimeSpeedProjectFixture {
  const mainGraphId = 'runtime-speed-main' as GraphId;
  const subGraphId = 'runtime-speed-subgraph' as GraphId;
  const mainInput = makeGraphInputNode('graph-input', 'input', 'string');
  const mainJoin = makeJoinNode('main-join');
  const mainOutput = makeGraphOutputNode('graph-output', 'result', 'string');
  const mainNodes: ChartNode[] = [mainInput, mainJoin, mainOutput];
  const mainConnections: NodeConnection[] = [];

  for (let i = 0; i < subgraphCallCount; i++) {
    const subgraphNode = makeSubgraphNode(`subgraph-${i}`, subGraphId);
    mainNodes.push(subgraphNode);
    mainConnections.push(connect(mainInput.id, 'data', subgraphNode.id, 'input'));
    mainConnections.push(connect(subgraphNode.id, 'result', mainJoin.id, `input${i + 1}`));
  }

  mainConnections.push(connect(mainJoin.id, 'output', mainOutput.id, 'value'));

  const subInput = makeGraphInputNode('subgraph-input', 'input', 'string');
  const subText = makeTextNode('subgraph-text', '{{input}}x');
  const subOutput = makeGraphOutputNode('subgraph-output', 'result', 'string');

  return {
    graphId: mainGraphId,
    project: {
      graphs: {
        [mainGraphId]: {
          connections: mainConnections,
          metadata: {
            description: '',
            id: mainGraphId,
            name: 'Runtime Speed Main',
          },
          nodes: mainNodes,
        },
        [subGraphId]: {
          connections: [
            connect(subInput.id, 'data', subText.id, 'input'),
            connect(subText.id, 'output', subOutput.id, 'value'),
          ],
          metadata: {
            description: '',
            id: subGraphId,
            name: 'Runtime Speed Subgraph',
          },
          nodes: [subInput, subText, subOutput],
        },
      },
      metadata: {
        description: '',
        id: 'runtime-speed-project' as ProjectId,
        mainGraphId,
        title: 'Runtime Speed Project',
      },
      plugins: [],
    },
    terminalNodeId: mainOutput.id,
  };
}

export function makeMixedSubgraphFanInProject(
  subgraphCallCount: number,
  branchesPerSubgraph: number,
): RuntimeSpeedProjectFixture {
  const mainGraphId = 'runtime-speed-main' as GraphId;
  const subGraphId = 'runtime-speed-subgraph' as GraphId;
  const mainInput = makeGraphInputNode('graph-input', 'input', 'string');
  const mainJoin = makeJoinNode('main-join');
  const mainOutput = makeGraphOutputNode('graph-output', 'result', 'string');
  const mainNodes: ChartNode[] = [mainInput, mainJoin, mainOutput];
  const mainConnections: NodeConnection[] = [];

  for (let i = 0; i < subgraphCallCount; i++) {
    const subgraphNode = makeSubgraphNode(`subgraph-${i}`, subGraphId);
    mainNodes.push(subgraphNode);
    mainConnections.push(connect(mainInput.id, 'data', subgraphNode.id, 'input'));
    mainConnections.push(connect(subgraphNode.id, 'result', mainJoin.id, `input${i + 1}`));
  }

  mainConnections.push(connect(mainJoin.id, 'output', mainOutput.id, 'value'));

  const subInput = makeGraphInputNode('subgraph-input', 'input', 'string');
  const subJoin = makeJoinNode('subgraph-join');
  const subOutput = makeGraphOutputNode('subgraph-output', 'result', 'string');
  const subNodes: ChartNode[] = [subInput, subJoin, subOutput];
  const subConnections: NodeConnection[] = [];

  for (let i = 0; i < branchesPerSubgraph; i++) {
    const textNode = makeTextNode(`subgraph-text-${i}`, `{{input}}:${i}`);
    subNodes.push(textNode);
    subConnections.push(connect(subInput.id, 'data', textNode.id, 'input'));
    subConnections.push(connect(textNode.id, 'output', subJoin.id, `input${i + 1}`));
  }

  subConnections.push(connect(subJoin.id, 'output', subOutput.id, 'value'));

  return {
    graphId: mainGraphId,
    project: {
      graphs: {
        [mainGraphId]: {
          connections: mainConnections,
          metadata: {
            description: '',
            id: mainGraphId,
            name: 'Runtime Speed Main',
          },
          nodes: mainNodes,
        },
        [subGraphId]: {
          connections: subConnections,
          metadata: {
            description: '',
            id: subGraphId,
            name: 'Runtime Speed Subgraph',
          },
          nodes: subNodes,
        },
      },
      metadata: {
        description: '',
        id: 'runtime-speed-project' as ProjectId,
        mainGraphId,
        title: 'Runtime Speed Project',
      },
      plugins: [],
    },
    terminalNodeId: mainOutput.id,
  };
}

export function makeNestedSubgraphProject(subgraphDepth: number): RuntimeSpeedProjectFixture {
  const mainGraphId = 'runtime-speed-main' as GraphId;
  const leafGraphId = 'runtime-speed-nested-leaf' as GraphId;
  const graphIds = Array.from({ length: subgraphDepth }, (_, index) => `runtime-speed-nested-${index}` as GraphId);
  const targetGraphId = graphIds[0] ?? leafGraphId;
  const mainInput = makeGraphInputNode('graph-input', 'input', 'string');
  const mainSubgraph = makeSubgraphNode('main-subgraph', targetGraphId);
  const mainOutput = makeGraphOutputNode('graph-output', 'result', 'string');
  const graphs: Project['graphs'] = {
    [mainGraphId]: {
      connections: [
        connect(mainInput.id, 'data', mainSubgraph.id, 'input'),
        connect(mainSubgraph.id, 'result', mainOutput.id, 'value'),
      ],
      metadata: {
        description: '',
        id: mainGraphId,
        name: 'Runtime Speed Main',
      },
      nodes: [mainInput, mainSubgraph, mainOutput],
    },
  };

  for (let i = 0; i < graphIds.length; i++) {
    graphs[graphIds[i]!] = makeSubgraphCallerGraph(graphIds[i]!, graphIds[i + 1] ?? leafGraphId, `nested-${i}`);
  }

  graphs[leafGraphId] = makeTextTransformGraph(leafGraphId, 'Runtime Speed Nested Leaf', '{{input}}x');

  return {
    graphId: mainGraphId,
    project: {
      graphs,
      metadata: {
        description: '',
        id: 'runtime-speed-project' as ProjectId,
        mainGraphId,
        title: 'Runtime Speed Project',
      },
      plugins: [],
    },
    terminalNodeId: mainOutput.id,
  };
}

export function makeCallGraphFanInProject(callGraphCount: number): RuntimeSpeedProjectFixture {
  const mainGraphId = 'runtime-speed-main' as GraphId;
  const calledGraphId = 'runtime-speed-called-graph' as GraphId;
  const mainInput = makeGraphInputNode('graph-input', 'input', 'string');
  const graphReference = makeGraphReferenceNode('graph-reference', calledGraphId);
  const joinNode = makeJoinNode('main-join');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'string');
  const nodes: ChartNode[] = [mainInput, graphReference, joinNode, outputNode];
  const connections: NodeConnection[] = [];

  for (let i = 0; i < callGraphCount; i++) {
    const objectNode = makeObjectNode(`call-inputs-${i}`, '{ "input": "{{input}}" }');
    const callGraphNode = makeCallGraphNode(`call-graph-${i}`);
    const extractNode = makeExtractObjectPathNode(`call-result-${i}`, '$.result.value');
    nodes.push(objectNode, callGraphNode, extractNode);
    connections.push(connect(mainInput.id, 'data', objectNode.id, 'input'));
    connections.push(connect(graphReference.id, 'graph', callGraphNode.id, 'graph'));
    connections.push(connect(objectNode.id, 'output', callGraphNode.id, 'inputs'));
    connections.push(connect(callGraphNode.id, 'outputs', extractNode.id, 'object'));
    connections.push(connect(extractNode.id, 'match', joinNode.id, `input${i + 1}`));
  }

  connections.push(connect(joinNode.id, 'output', outputNode.id, 'value'));

  return {
    graphId: mainGraphId,
    project: {
      graphs: {
        [mainGraphId]: {
          connections,
          metadata: {
            description: '',
            id: mainGraphId,
            name: 'Runtime Speed Main',
          },
          nodes,
        },
        [calledGraphId]: makeTextTransformGraph(calledGraphId, 'Runtime Speed Called Graph', '{{input}}x'),
      },
      metadata: {
        description: '',
        id: 'runtime-speed-project' as ProjectId,
        mainGraphId,
        title: 'Runtime Speed Project',
      },
      plugins: [],
    },
    terminalNodeId: outputNode.id,
  };
}

export function makeReferencedGraphAliasFanInProject(aliasCount: number): RuntimeSpeedReferencedProjectFixture {
  const mainGraphId = 'runtime-speed-main' as GraphId;
  const referencedGraphId = 'runtime-speed-referenced-main' as GraphId;
  const referencedProjectId = 'runtime-speed-referenced-project' as ProjectId;
  const mainInput = makeGraphInputNode('graph-input', 'input', 'string');
  const joinNode = makeJoinNode('main-join');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'string');
  const nodes: ChartNode[] = [mainInput, joinNode, outputNode];
  const connections: NodeConnection[] = [];
  const referencedProject: Project = {
    graphs: {
      [referencedGraphId]: makeTextTransformGraph(referencedGraphId, 'Runtime Speed Referenced Graph', '{{input}}x'),
    },
    metadata: {
      description: '',
      id: referencedProjectId,
      mainGraphId: referencedGraphId,
      title: 'Runtime Speed Referenced Project',
    },
    plugins: [],
  };

  for (let i = 0; i < aliasCount; i++) {
    const aliasNode = makeReferencedGraphAliasNode(`referenced-alias-${i}`, referencedProjectId, referencedGraphId);
    nodes.push(aliasNode);
    connections.push(connect(mainInput.id, 'data', aliasNode.id, 'input'));
    connections.push(connect(aliasNode.id, 'result', joinNode.id, `input${i + 1}`));
  }

  connections.push(connect(joinNode.id, 'output', outputNode.id, 'value'));

  return {
    graphId: mainGraphId,
    project: {
      graphs: {
        [mainGraphId]: {
          connections,
          metadata: {
            description: '',
            id: mainGraphId,
            name: 'Runtime Speed Main',
          },
          nodes,
        },
      },
      metadata: {
        description: '',
        id: 'runtime-speed-project' as ProjectId,
        mainGraphId,
        title: 'Runtime Speed Project',
      },
      plugins: [],
      references: [
        {
          id: referencedProjectId,
          title: 'Runtime Speed Referenced Project',
        },
      ],
    },
    projectReferenceLoader: createStaticProjectReferenceLoader(referencedProject),
    referencedProject,
    terminalNodeId: outputNode.id,
  };
}

export function makeBranchingTextProject(): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'string');
  const leftNode = makeTextNode('left-text', '{{input}} left');
  const rightNode = makeTextNode('right-text', '{{input}} right');
  const leftOutputNode = makeGraphOutputNode('left-output', 'leftResult', 'string');
  const rightOutputNode = makeGraphOutputNode('right-output', 'rightResult', 'string');

  return makeFixture(
    [inputNode, leftNode, rightNode, leftOutputNode, rightOutputNode],
    [
      connect(inputNode.id, 'data', leftNode.id, 'input'),
      connect(inputNode.id, 'data', rightNode.id, 'input'),
      connect(leftNode.id, 'output', leftOutputNode.id, 'value'),
      connect(rightNode.id, 'output', rightOutputNode.id, 'value'),
    ],
  );
}

export function makeInputContextTextProject(): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'string');
  const textNode = makeTextNode('input-context-text', '{{input}} {{@context.suffix}}');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'string');

  return makeFixture(
    [inputNode, textNode, outputNode],
    [connect(inputNode.id, 'data', textNode.id, 'input'), connect(textNode.id, 'output', outputNode.id, 'value')],
    outputNode.id,
  );
}

export function makeAsyncDelayProject(delayMs: number): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'string');
  const delayNode = makeDelayNode('delay-node', delayMs);
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'any');

  return makeFixture(
    [inputNode, delayNode, outputNode],
    [connect(inputNode.id, 'data', delayNode.id, 'input1'), connect(delayNode.id, 'output1', outputNode.id, 'value')],
    outputNode.id,
  );
}

export function makeControlFlowExclusionProject(): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'object');
  const extractNode = makeExtractObjectPathNode('extract-node', '$.missing');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'any');

  return makeFixture(
    [inputNode, extractNode, outputNode],
    [connect(inputNode.id, 'data', extractNode.id, 'object'), connect(extractNode.id, 'match', outputNode.id, 'value')],
    outputNode.id,
  );
}

export function makeRaiseEventProject(): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'any');
  const raiseEventNode = makeRaiseEventNode('raise-event', 'runtime-speed-event');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'any');

  return makeFixture(
    [inputNode, raiseEventNode, outputNode],
    [
      connect(inputNode.id, 'data', raiseEventNode.id, 'data'),
      connect(raiseEventNode.id, 'result', outputNode.id, 'value'),
    ],
    outputNode.id,
  );
}

export function makeMissingRequiredInputProject(): RuntimeSpeedProjectFixture {
  const extractNode = makeExtractObjectPathNode('extract-node', '$.anything');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'any');

  return makeFixture(
    [extractNode, outputNode],
    [connect(extractNode.id, 'match', outputNode.id, 'value')],
    outputNode.id,
  );
}

export function makeThrowingCodeProject(): RuntimeSpeedProjectFixture {
  const codeNode = makeCodeNode('throwing-code', `throw new Error('runtime speed guard failure');`);
  return makeFixture([codeNode], [], codeNode.id);
}

export function makeSyntaxErrorCodeProject(): RuntimeSpeedProjectFixture {
  const codeNode = makeCodeNode('syntax-error-code', `return {;`);
  return makeFixture([codeNode], [], codeNode.id);
}

export function makeAbortSignalProject(delayMs: number): RuntimeSpeedProjectFixture {
  return makeAsyncDelayProject(delayMs);
}

export function makeGlobalStateProject(): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'string');
  const setGlobalNode = makeSetGlobalNode('set-global', 'runtime-speed-global', 'string');
  const outputNode = makeGraphOutputNode('graph-output', 'previousResult', 'string');

  return makeFixture(
    [inputNode, setGlobalNode, outputNode],
    [
      connect(inputNode.id, 'data', setGlobalNode.id, 'value'),
      connect(setGlobalNode.id, 'previous-value', outputNode.id, 'value'),
    ],
    outputNode.id,
  );
}

function makeFixture(
  nodes: ChartNode[],
  connections: NodeConnection[],
  terminalNodeId?: NodeId,
): RuntimeSpeedProjectFixture {
  const graphId = 'runtime-speed-main' as GraphId;
  const graph: NodeGraph = {
    connections,
    metadata: {
      description: '',
      id: graphId,
      name: 'Runtime Speed Main',
    },
    nodes,
  };

  return {
    graphId,
    project: {
      graphs: {
        [graphId]: graph,
      },
      metadata: {
        description: '',
        id: 'runtime-speed-project' as ProjectId,
        mainGraphId: graphId,
        title: 'Runtime Speed Project',
      },
      plugins: [],
    },
    terminalNodeId,
  };
}

function makeSubgraphCallerGraph(graphId: GraphId, calledGraphId: GraphId, idPrefix: string): NodeGraph {
  const inputNode = makeGraphInputNode(`${idPrefix}-input`, 'input', 'string');
  const subgraphNode = makeSubgraphNode(`${idPrefix}-subgraph`, calledGraphId);
  const outputNode = makeGraphOutputNode(`${idPrefix}-output`, 'result', 'string');

  return {
    connections: [
      connect(inputNode.id, 'data', subgraphNode.id, 'input'),
      connect(subgraphNode.id, 'result', outputNode.id, 'value'),
    ],
    metadata: {
      description: '',
      id: graphId,
      name: `Runtime Speed ${idPrefix}`,
    },
    nodes: [inputNode, subgraphNode, outputNode],
  };
}

function makeTextTransformGraph(graphId: GraphId, name: string, text: string): NodeGraph {
  const inputNode = makeGraphInputNode(`${graphId}-input`, 'input', 'string');
  const textNode = makeTextNode(`${graphId}-text`, text);
  const outputNode = makeGraphOutputNode(`${graphId}-output`, 'result', 'string');

  return {
    connections: [
      connect(inputNode.id, 'data', textNode.id, 'input'),
      connect(textNode.id, 'output', outputNode.id, 'value'),
    ],
    metadata: {
      description: '',
      id: graphId,
      name,
    },
    nodes: [inputNode, textNode, outputNode],
  };
}

function makeGraphInputNode(id: string, inputId: string, dataType: DataType): ChartNode {
  return {
    data: {
      dataType,
      defaultValue: undefined,
      id: inputId,
      useDefaultValueInput: false,
    },
    id: id as NodeId,
    title: 'Graph Input',
    type: 'graphInput',
    visualData: { width: 240, x: 0, y: 0 },
  };
}

function makeGraphOutputNode(id: string, outputId: string, dataType: DataType): ChartNode {
  return {
    data: {
      dataType,
      id: outputId,
    },
    id: id as NodeId,
    title: 'Graph Output',
    type: 'graphOutput',
    visualData: { width: 240, x: 1000, y: 0 },
  };
}

function makeTextNode(id: string, text: string): ChartNode {
  return {
    data: {
      normalizeLineEndings: true,
      text,
    },
    id: id as NodeId,
    title: 'Text',
    type: 'text',
    visualData: { width: 260, x: 0, y: 0 },
  };
}

function makeExpressionNode(id: string, expression: string): ChartNode {
  return {
    data: {
      expression,
    },
    id: id as NodeId,
    title: 'Expression',
    type: 'expression',
    visualData: { width: 260, x: 0, y: 0 },
  };
}

function makeCodeNode(id: string, code: string): ChartNode {
  return {
    data: {
      allowConsole: false,
      allowFetch: false,
      allowProcess: false,
      allowRequire: false,
      allowRivet: false,
      code,
    },
    id: id as NodeId,
    title: 'Code',
    type: 'codeNew',
    visualData: { width: 260, x: 0, y: 0 },
  };
}

function makeSubgraphNode(id: string, graphId: GraphId): ChartNode {
  return {
    data: {
      graphId,
      useAsGraphPartialOutput: false,
      useErrorOutput: false,
    },
    id: id as NodeId,
    title: 'Subgraph',
    type: 'subGraph',
    visualData: { width: 300, x: 0, y: 0 },
  };
}

function makeGraphReferenceNode(id: string, graphId: GraphId): ChartNode {
  return {
    data: {
      graphId,
      useGraphIdOrNameInput: false,
    },
    id: id as NodeId,
    title: 'Graph Reference',
    type: 'graphReference',
    visualData: { width: 275, x: 0, y: 0 },
  };
}

function makeCallGraphNode(id: string): ChartNode {
  return {
    data: {
      useErrorOutput: false,
    },
    id: id as NodeId,
    title: 'Call Graph',
    type: 'callGraph',
    visualData: { width: 200, x: 0, y: 0 },
  };
}

function makeReferencedGraphAliasNode(id: string, projectId: ProjectId, graphId: GraphId): ChartNode {
  return {
    data: {
      graphId,
      outputCostDuration: false,
      projectId,
      useErrorOutput: false,
    },
    id: id as NodeId,
    title: 'Referenced Graph Alias',
    type: 'referencedGraphAlias',
    visualData: { width: 300, x: 0, y: 0 },
  };
}

function makeObjectNode(id: string, jsonTemplate: string): ChartNode {
  return {
    data: {
      jsonTemplate,
    },
    id: id as NodeId,
    title: 'Object',
    type: 'object',
    visualData: { width: 200, x: 0, y: 0 },
  };
}

function makeJoinNode(id: string): ChartNode {
  return {
    data: {
      flatten: true,
      joinString: '',
      useJoinStringInput: false,
    },
    id: id as NodeId,
    title: 'Join',
    type: 'join',
    visualData: { width: 150, x: 0, y: 0 },
  };
}

function makeDelayNode(id: string, delay: number): ChartNode {
  return {
    data: {
      delay,
      useDelayInput: false,
    },
    id: id as NodeId,
    title: 'Delay',
    type: 'delay',
    visualData: { width: 175, x: 0, y: 0 },
  };
}

function makeSetGlobalNode(id: string, globalId: string, dataType: DataType): ChartNode {
  return {
    data: {
      dataType,
      id: globalId,
      useIdInput: false,
    },
    id: id as NodeId,
    title: 'Set Global',
    type: 'setGlobal',
    visualData: { width: 200, x: 0, y: 0 },
  };
}

function makeExtractObjectPathNode(id: string, path: string): ChartNode {
  return {
    data: {
      path,
      usePathInput: false,
    },
    id: id as NodeId,
    title: 'Extract Object Path',
    type: 'extractObjectPath',
    visualData: { width: 250, x: 0, y: 0 },
  };
}

function makeRaiseEventNode(id: string, eventName: string): ChartNode {
  return {
    data: {
      eventName,
      useEventNameInput: false,
    },
    id: id as NodeId,
    title: 'Raise Event',
    type: 'raiseEvent',
    visualData: { width: 180, x: 0, y: 0 },
  };
}

function connect(outputNodeId: NodeId, outputId: string, inputNodeId: NodeId, inputId: string): NodeConnection {
  return {
    inputId: inputId as PortId,
    inputNodeId,
    outputId: outputId as PortId,
    outputNodeId,
  };
}

function createStaticProjectReferenceLoader(referencedProject: Project): ProjectReferenceLoader {
  return {
    async loadProject(_currentProjectPath: string | undefined, reference: ProjectReference): Promise<Project> {
      if (reference.id !== referencedProject.metadata.id) {
        throw new Error(`Unexpected runtime speed project reference ${reference.id}.`);
      }

      return structuredClone(referencedProject) as Project;
    },
  };
}
