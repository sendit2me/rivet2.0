import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { type GraphProcessor } from '@valerypopoff/rivet2-core';
import WebSocket, { type WebSocketServer } from 'ws';
import {
  DEBUGGER_HEARTBEAT_INTERVAL_MS,
  DEBUGGER_HEARTBEAT_TIMEOUT_MS,
  startDebuggerServer,
} from '../src/debugger.js';
import { createProcessor } from '../src/api.js';
import { loadTestGraphs } from './testUtils.js';

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

  it('reports serialization failures without disconnecting healthy debugger clients', async () => {
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
      debuggerServer.broadcast(fakeProcessor(), 'trace', circular);
    });

    assert.equal(socket.terminated, false);
    assert.equal(socket.sentMessages.length, 0);
    await waitFor(() => assert.equal(errors.length, 1));
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
