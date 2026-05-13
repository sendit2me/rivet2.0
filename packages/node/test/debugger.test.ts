import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import WebSocket, { type WebSocketServer } from 'ws';
import {
  DEBUGGER_HEARTBEAT_INTERVAL_MS,
  DEBUGGER_HEARTBEAT_TIMEOUT_MS,
  startDebuggerServer,
} from '../src/debugger.js';

class FakeWebSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  pingCount = 0;
  sentMessages: string[] = [];
  terminated = false;

  ping() {
    this.pingCount += 1;
  }

  send(message: string) {
    this.sentMessages.push(message);
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
