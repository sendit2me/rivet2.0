import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  WarningsPort,
  decodeDebuggerTransportSentinels,
  type ChartNode,
  type DataType,
  type GraphId,
  type GraphProcessor,
  type GraphRunId,
  type NodeConnection,
  type NodeGraph,
  type NodeId,
  type PortId,
  type Project,
  type ProjectId,
  type RootRunId,
} from '@valerypopoff/rivet2-core';
import WebSocket, { type WebSocketServer } from 'ws';
import { DEBUGGER_HEARTBEAT_INTERVAL_MS, DEBUGGER_HEARTBEAT_TIMEOUT_MS, startDebuggerServer } from '../src/debugger.js';
import { createProcessor } from '../src/api.js';
import { loadTestGraphs } from './testUtils.js';
import { makeThrowingCodeProject } from './runtimeSpeedFixtures.js';

class FakeWebSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  pingCount = 0;
  sentMessages: string[] = [];
  terminated = false;
  sendCallbackError: Error | undefined;
  sendThrowError: Error | undefined;

  ping() {
    this.pingCount += 1;
  }

  send(message: string, callback?: (err?: Error) => void) {
    if (this.sendThrowError) {
      throw this.sendThrowError;
    }

    this.sentMessages.push(message);
    callback?.(this.sendCallbackError);
  }

  terminate() {
    this.terminated = true;
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }
}

class FakeWebSocketServer extends EventEmitter {
  clients = new Set<WebSocket>();

  connect(socket: FakeWebSocket) {
    this.clients.add(socket as unknown as WebSocket);
    socket.once('close', () => {
      this.clients.delete(socket as unknown as WebSocket);
    });
    this.emit('connection', socket);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(assertion: () => void) {
  const deadline = Date.now() + 250;

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await wait(5);
    }
  }
}

function fakeProcessor(id = 'processor-1'): GraphProcessor {
  return { id } as unknown as GraphProcessor;
}

function getSentDebuggerMessage(socket: FakeWebSocket, message: string) {
  return socket.sentMessages
    .map((sentMessage) => JSON.parse(sentMessage))
    .find((sentMessage) => sentMessage.message === message);
}

function getSentDebuggerMessages(socket: FakeWebSocket, message: string) {
  return socket.sentMessages
    .map((sentMessage) => JSON.parse(sentMessage))
    .filter((sentMessage) => sentMessage.message === message);
}

function makeExecution(graphId = 'graph-1' as GraphId) {
  return {
    graphId,
    graphRunId: `${graphId}-run` as GraphRunId,
    rootRunId: 'root-run' as RootRunId,
  };
}

function makeNestedCircularExpressionProject(): Project {
  const mainGraphId = 'main' as GraphId;
  const subgraph1Id = 'subgraph1' as GraphId;
  const subgraph2Id = 'subgraph2' as GraphId;

  return {
    graphs: {
      [mainGraphId]: makeSubgraphCallerGraph(mainGraphId, subgraph1Id, 'main'),
      [subgraph1Id]: makeSubgraphCallerGraph(subgraph1Id, subgraph2Id, 'subgraph1'),
      [subgraph2Id]: makeCircularExpressionGraph(subgraph2Id),
    },
    metadata: {
      description: '',
      id: 'debugger-circular-project' as ProjectId,
      mainGraphId,
      title: 'Debugger Circular Project',
    },
    plugins: [],
  };
}

function makeSubgraphCallerGraph(graphId: GraphId, calledGraphId: GraphId, prefix: string): NodeGraph {
  const subgraphNode = makeSubgraphNode(`${prefix}-subgraph`, calledGraphId);
  const outputNode = makeGraphOutputNode(`${prefix}-output`, 'result', 'any');

  return {
    connections: [connect(subgraphNode.id, 'result', outputNode.id, 'value')],
    metadata: {
      description: '',
      id: graphId,
      name: graphId,
    },
    nodes: [subgraphNode, outputNode],
  };
}

function makeCircularExpressionGraph(graphId: GraphId): NodeGraph {
  const circularExpressionNode = makeExpressionNode(
    'subgraph2-circular-expression',
    '(() => { const value = {}; value.self = value; return value; })()',
  );
  const downstreamExpressionNode = makeExpressionNode(
    'subgraph2-downstream-expression',
    '{{input}} === {{input}}',
  );
  const outputNode = makeGraphOutputNode('subgraph2-output', 'result', 'any');

  return {
    connections: [
      connect(circularExpressionNode.id, 'output', downstreamExpressionNode.id, 'input'),
      connect(downstreamExpressionNode.id, 'output', outputNode.id, 'value'),
    ],
    metadata: {
      description: '',
      id: graphId,
      name: graphId,
    },
    nodes: [circularExpressionNode, downstreamExpressionNode, outputNode],
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

function makeGraphOutputNode(id: string, outputId: string, dataType: DataType): ChartNode {
  return {
    data: {
      dataType,
      id: outputId,
    },
    id: id as NodeId,
    title: 'Graph Output',
    type: 'graphOutput',
    visualData: { width: 240, x: 400, y: 0 },
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

describe('startDebuggerServer heartbeat', () => {
  it('exports centralized heartbeat defaults', () => {
    assert.equal(DEBUGGER_HEARTBEAT_INTERVAL_MS, 30_000);
    assert.equal(DEBUGGER_HEARTBEAT_TIMEOUT_MS, 10_000);
  });

  it('sends websocket pings and keeps responsive clients connected', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();

    startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 10,
      heartbeatTimeoutMs: 50,
    });

    server.connect(socket);

    await waitFor(() => assert.equal(socket.pingCount, 1));
    socket.emit('pong');
    await waitFor(() => assert.equal(socket.pingCount, 2));

    assert.equal(socket.terminated, false);
    socket.close();
    const pingCountAfterClose = socket.pingCount;
    await wait(25);
    assert.equal(socket.pingCount, pingCountAfterClose);
  });

  it('terminates clients that do not answer heartbeat pings', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();

    startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 10,
      heartbeatTimeoutMs: 15,
    });

    server.connect(socket);

    await waitFor(() => assert.equal(socket.pingCount, 1));
    await waitFor(() => assert.equal(socket.terminated, true));
  });

  it('keeps clients connected when outbound debugger traffic proves activity during a heartbeat wait', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 30,
    });

    server.connect(socket);

    await waitFor(() => assert.equal(socket.pingCount, 1));
    debuggerServer.broadcast(fakeProcessor(), 'trace', 'activity');
    await wait(45);

    assert.equal(socket.terminated, false);
    socket.close();
  });

  it('keeps clients connected when a graph run emits debugger traffic during a heartbeat wait', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 30,
    });
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
      remoteDebugger: debuggerServer,
    });

    server.connect(socket);

    await waitFor(() => assert.equal(socket.pingCount, 1));
    await processor.run();
    await wait(45);

    assert.equal(socket.terminated, false);
    socket.close();
  });

  it('keeps clients connected when inbound debugger traffic proves activity during a heartbeat wait', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();

    startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 30,
    });

    server.connect(socket);

    await waitFor(() => assert.equal(socket.pingCount, 1));
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'pause', data: null })));
    await wait(45);

    assert.equal(socket.terminated, false);
    socket.close();
  });

  it('can disable heartbeat when a host owns websocket liveness itself', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();

    startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });

    server.connect(socket);
    await wait(25);

    assert.equal(socket.pingCount, 0);
    assert.equal(socket.terminated, false);
    socket.close();
  });
});

describe('startDebuggerServer broadcast', () => {
  it('keeps connection-time debugger messages best-effort when the websocket send throws', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const errors: Error[] = [];
    socket.sendThrowError = new Error('synthetic handshake send failure');
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      allowGraphUpload: true,
      heartbeatIntervalMs: 0,
    });
    debuggerServer.on('error', (error) => {
      errors.push(error);
    });

    assert.doesNotThrow(() => {
      server.connect(socket);
    });

    assert.equal(socket.terminated, true);
    await waitFor(() => assert.equal(errors.length, 1));
  });

  it('keeps broadcasts best-effort when one debugger client send throws', async () => {
    const server = new FakeWebSocketServer();
    const failingSocket = new FakeWebSocket();
    const healthySocket = new FakeWebSocket();
    const errors: Error[] = [];
    failingSocket.sendThrowError = new Error('synthetic send failure');
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    debuggerServer.on('error', (error) => {
      errors.push(error);
    });

    server.connect(failingSocket);
    server.connect(healthySocket);

    assert.doesNotThrow(() => {
      debuggerServer.broadcast(fakeProcessor(), 'trace', 'hello');
    });

    assert.equal(failingSocket.terminated, true);
    assert.equal(healthySocket.terminated, false);
    assert.equal(healthySocket.sentMessages.length, 1);
    assert.equal(JSON.parse(healthySocket.sentMessages[0]!).message, 'trace');
    await waitFor(() => assert.equal(errors.length, 1));
  });

  it('terminates only the failed debugger client when send reports an error', async () => {
    const server = new FakeWebSocketServer();
    const failingSocket = new FakeWebSocket();
    const healthySocket = new FakeWebSocket();
    const errors: Error[] = [];
    failingSocket.sendCallbackError = new Error('synthetic stale socket');
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    debuggerServer.on('error', (error) => {
      errors.push(error);
    });

    server.connect(failingSocket);
    server.connect(healthySocket);
    debuggerServer.broadcast(fakeProcessor(), 'trace', 'hello');

    assert.equal(failingSocket.terminated, true);
    assert.equal(healthySocket.terminated, false);
    assert.equal(healthySocket.sentMessages.length, 1);
    await waitFor(() => assert.equal(errors.length, 1));
  });

  it('sends lifecycle messages with circular payload branches instead of dropping them', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const errors: Error[] = [];
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    debuggerServer.on('error', (error) => {
      errors.push(error);
    });

    server.connect(socket);

    assert.doesNotThrow(() => {
      debuggerServer.broadcast(fakeProcessor(), 'nodeFinish', {
        execution: makeExecution(),
        node: { id: 'expression-1', type: 'expression' },
        outputs: {
          output: {
            type: 'any',
            value: circular,
          },
        },
        processId: 'process-1',
      });
    });

    assert.equal(socket.terminated, false);
    assert.equal(errors.length, 0);

    const nodeFinish = getSentDebuggerMessage(socket, 'nodeFinish');
    assert.equal(nodeFinish.data.node.id, 'expression-1');
    assert.equal(
      nodeFinish.data.outputs.output.value.self,
      '[Unserializable value: circular reference]',
    );
  });

  it('falls back to a warning lifecycle payload if safe serialization itself fails', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const errors: Error[] = [];
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const originalWeakSetHas = WeakSet.prototype.has;
    let throwOnce = true;
    debuggerServer.on('error', (error) => {
      errors.push(error);
    });

    server.connect(socket);

    try {
      WeakSet.prototype.has = function syntheticHasFailure(value: object) {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('synthetic sanitizer failure');
        }
        return originalWeakSetHas.call(this, value);
      };

      debuggerServer.broadcast(fakeProcessor(), 'nodeFinish', {
        execution: makeExecution(),
        node: { id: 'expression-1', type: 'expression' },
        outputs: {
          output: {
            type: 'any',
            value: { ok: true },
          },
        },
        processId: 'process-1',
      });
    } finally {
      WeakSet.prototype.has = originalWeakSetHas;
    }

    const nodeFinish = getSentDebuggerMessage(socket, 'nodeFinish');
    assert.equal(nodeFinish.data.node.id, 'expression-1');
    assert.equal(nodeFinish.data.outputs[WarningsPort].type, 'string[]');
    assert.match(nodeFinish.data.outputs[WarningsPort].value[0], /could not serialize/);
    await waitFor(() => assert.equal(errors.length, 1));
  });

  it('sends downstream events whose inputs include non-JSON-safe values', () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    server.connect(socket);

    debuggerServer.broadcast(fakeProcessor(), 'nodeStart', {
      execution: makeExecution(),
      inputs: {
        input: {
          type: 'any',
          value: circular,
        },
      },
      node: { id: 'downstream-expression', type: 'expression' },
      processId: 'process-2',
    });

    const nodeStart = getSentDebuggerMessage(socket, 'nodeStart');
    assert.equal(nodeStart.data.node.id, 'downstream-expression');
    assert.equal(nodeStart.data.inputs.input.value.self, '[Unserializable value: circular reference]');
  });

  it('honors JSON-compatible toJSON values in debugger payloads', () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });

    server.connect(socket);

    debuggerServer.broadcast(fakeProcessor(), 'nodeFinish', {
      execution: makeExecution(),
      node: { id: 'expression-1', type: 'expression' },
      outputs: {
        value: {
          type: 'any',
          value: {
            ignored: 'original value',
            toJSON: () => ({ serialized: true }),
          },
        },
      },
      processId: 'process-1',
    });

    const nodeFinish = getSentDebuggerMessage(socket, 'nodeFinish');
    assert.deepEqual(nodeFinish.data.outputs.value.value, { serialized: true });
  });

  it('preserves explicit undefined and replaces non-JSON primitives in debugger payloads', () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });

    server.connect(socket);

    debuggerServer.broadcast(fakeProcessor(), 'nodeFinish', {
      execution: makeExecution(),
      node: { id: 'expression-1', type: 'expression' },
      outputs: {
        value: {
          type: 'any',
          value: {
            bigint: 1n,
            fn: function namedFunction() {},
            infinity: Infinity,
            nan: NaN,
            symbol: Symbol('debugger-test'),
            undefinedValue: undefined,
          },
        },
      },
      processId: 'process-1',
    });

    const nodeFinish = decodeDebuggerTransportSentinels(getSentDebuggerMessage(socket, 'nodeFinish'));
    const outputValue = nodeFinish.data.outputs.value.value;
    assert.equal(outputValue.undefinedValue, undefined);
    assert.equal(outputValue.bigint, '[Unserializable bigint: 1]');
    assert.equal(outputValue.fn, '[Unserializable function: namedFunction]');
    assert.equal(outputValue.infinity, '[Unserializable number: Infinity]');
    assert.equal(outputValue.nan, '[Unserializable number: NaN]');
    assert.equal(outputValue.symbol, '[Unserializable symbol: Symbol(debugger-test)]');
  });

  it('preserves user values that match debugger sentinel envelopes', () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const sentinelShapedUserValue = {
      __rivetDebuggerTransportSentinel: {
        type: 'undefined',
        version: 1,
      },
    };

    server.connect(socket);

    debuggerServer.broadcast(fakeProcessor(), 'nodeFinish', {
      execution: makeExecution(),
      node: { id: 'expression-1', type: 'expression' },
      outputs: {
        value: {
          type: 'any',
          value: sentinelShapedUserValue,
        },
      },
      processId: 'process-1',
    });

    const nodeFinish = decodeDebuggerTransportSentinels(getSentDebuggerMessage(socket, 'nodeFinish'));
    assert.deepEqual(nodeFinish.data.outputs.value.value, sentinelShapedUserValue);
  });

  it('preserves user values that match debugger escaped-sentinel envelopes', () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const sentinelShapedUserValue = {
      __rivetDebuggerTransportSentinel: {
        type: 'escaped-sentinel',
        value: undefined,
        version: 1,
      },
    };

    server.connect(socket);

    debuggerServer.broadcast(fakeProcessor(), 'nodeFinish', {
      execution: makeExecution(),
      node: { id: 'expression-1', type: 'expression' },
      outputs: {
        value: {
          type: 'any',
          value: sentinelShapedUserValue,
        },
      },
      processId: 'process-1',
    });

    const nodeFinish = decodeDebuggerTransportSentinels(getSentDebuggerMessage(socket, 'nodeFinish'));
    assert.deepEqual(nodeFinish.data.outputs.value.value, sentinelShapedUserValue);
  });

  it('does not fail graph execution when debugger event sends fail', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    socket.sendThrowError = new Error('synthetic send failure');
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });

    server.connect(socket);

    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
      remoteDebugger: debuggerServer,
    });

    await assert.doesNotReject(() => processor.run());
    assert.equal(socket.terminated, true);
  });

  it('keeps nested subgraph debugger event streams complete when an expression returns a circular value', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const fixture = makeNestedCircularExpressionProject();

    server.connect(socket);

    const processor = createProcessor(fixture, {
      graph: 'main',
      remoteDebugger: debuggerServer,
    });

    await processor.run();

    const nodeStartMessages = getSentDebuggerMessages(socket, 'nodeStart');
    const nodeFinishMessages = getSentDebuggerMessages(socket, 'nodeFinish');
    assert.ok(
      nodeFinishMessages.some((message) => message.data.node.id === 'subgraph2-circular-expression'),
      'circular expression nodeFinish should be sent',
    );
    assert.ok(
      nodeStartMessages.some((message) => message.data.node.id === 'subgraph2-downstream-expression'),
      'downstream nodeStart should be sent even when its input includes the circular value',
    );
    assert.ok(
      nodeFinishMessages.some((message) => message.data.node.id === 'subgraph2-downstream-expression'),
      'downstream nodeFinish should be sent',
    );

    const circularFinish = nodeFinishMessages.find(
      (message) => message.data.node.id === 'subgraph2-circular-expression',
    )!;
    assert.equal(
      circularFinish.data.outputs.output.value.self,
      '[Unserializable value: circular reference]',
    );
  });

  it('forwards node error duration metadata to debugger clients', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const fixture = makeThrowingCodeProject();

    server.connect(socket);

    const processor = createProcessor(fixture.project, {
      graph: fixture.graphId,
      remoteDebugger: debuggerServer,
      captureNodeTimings: true,
    });

    await assert.rejects(() => processor.run(), /failed to process due to errors in nodes/);

    const nodeErrorMessage = getSentDebuggerMessage(socket, 'nodeError');
    assert.equal(nodeErrorMessage?.data.node.id, 'throwing-code');
    assert.equal(typeof nodeErrorMessage?.data.durationMs, 'number');
    assert.ok(nodeErrorMessage.data.durationMs >= 0);
  });

  it('removes processor event listeners on detach and keeps detach idempotent', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });

    server.connect(socket);
    debuggerServer.attach(processor.processor);
    debuggerServer.detach(processor.processor);
    debuggerServer.detach(processor.processor);

    await processor.run();

    assert.equal(socket.sentMessages.length, 0);
  });

  it('automatically detaches processors after graph execution finishes', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const processorCounts: number[] = [];
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
      getProcessorsForClient: (_client, processors) => {
        processorCounts.push(processors.length);
        return processors;
      },
    });

    server.connect(socket);

    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
      remoteDebugger: debuggerServer,
    });

    await processor.run();
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'pause', data: null })));

    await waitFor(() => assert.equal(processorCounts.at(-1), 0));
  });

  it('passes processor-routing callbacks a snapshot of attached processors', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const processorCounts: number[] = [];
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
      getProcessorsForClient: (_client, processors) => {
        processorCounts.push(processors.length);
        processors.pop();
        return [];
      },
    });

    server.connect(socket);
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });
    debuggerServer.attach(processor.processor);

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'pause', data: null })));
    await waitFor(() => assert.equal(processorCounts.length, 1));
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'pause', data: null })));
    await waitFor(() => assert.equal(processorCounts.length, 2));

    assert.deepEqual(processorCounts, [1, 1]);
    debuggerServer.detach(processor.processor);
  });

  it('reattaches createProcessor remote debugger listeners for repeated runs', async () => {
    const server = new FakeWebSocketServer();
    const socket = new FakeWebSocket();
    const debuggerServer = startDebuggerServer({
      server: server as unknown as WebSocketServer,
      heartbeatIntervalMs: 0,
    });

    server.connect(socket);

    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
      remoteDebugger: debuggerServer,
    });

    await processor.run();
    const messagesAfterFirstRun = socket.sentMessages.length;
    await processor.run();

    assert.ok(messagesAfterFirstRun > 0);
    assert.ok(socket.sentMessages.length > messagesAfterFirstRun);
  });
});
