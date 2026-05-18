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
  type Tokenizer,
  type TokenizerCallInfo,
} from '../src/index.js';
import { NodeCodeRunner } from '../src/native/NodeCodeRunner.js';

export type RuntimeSpeedProjectFixture = {
  graphId: GraphId;
  project: Project;
  terminalNodeId?: NodeId;
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

export function createRuntimeSpeedProcessContext(): ProcessContext {
  return {
    codeRunner: new NodeCodeRunner(),
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
  } = {},
): Promise<Record<string, DataValue>> {
  const processor = createRuntimeSpeedProcessor(fixture.project, fixture.graphId);
  return processor.processGraph(
    createRuntimeSpeedProcessContext(),
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
    [
      connect(inputNode.id, 'data', delayNode.id, 'input1'),
      connect(delayNode.id, 'output1', outputNode.id, 'value'),
    ],
    outputNode.id,
  );
}

export function makeControlFlowExclusionProject(): RuntimeSpeedProjectFixture {
  const inputNode = makeGraphInputNode('graph-input', 'input', 'object');
  const extractNode = makeExtractObjectPathNode('extract-node', '$.missing');
  const outputNode = makeGraphOutputNode('graph-output', 'result', 'any');

  return makeFixture(
    [inputNode, extractNode, outputNode],
    [
      connect(inputNode.id, 'data', extractNode.id, 'object'),
      connect(extractNode.id, 'match', outputNode.id, 'value'),
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

function connect(outputNodeId: NodeId, outputId: string, inputNodeId: NodeId, inputId: string): NodeConnection {
  return {
    inputId: inputId as PortId,
    inputNodeId,
    outputId: outputId as PortId,
    outputNodeId,
  };
}
