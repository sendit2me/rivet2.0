import WebSocket, { WebSocketServer } from 'ws';
import {
  type GraphId,
  type GraphProcessor,
  type Project,
  getError,
  type Settings,
  type GraphInputs,
  type NodeId,
  type StringArrayDataValue,
  type DataId,
  type DataValue,
  type Outputs,
  type RemoteRunRequestId,
} from '@valerypopoff/rivet2-core';
import { match } from 'ts-pattern';
import Emittery from 'emittery';
import { type DebuggerDatasetProvider } from './index.js';

export const DEBUGGER_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEBUGGER_HEARTBEAT_TIMEOUT_MS = 10_000;

export interface RivetDebuggerServer {
  on: Emittery<DebuggerEvents>['on'];
  off: Emittery<DebuggerEvents>['off'];

  webSocketServer: WebSocketServer;

  broadcast(processor: GraphProcessor, message: string, data: unknown, requestId?: RemoteRunRequestId): void;

  attach(processor: GraphProcessor, requestId?: RemoteRunRequestId): void;
  detach(processor: GraphProcessor): void;
}

export interface DebuggerEvents {
  error: Error;
}

export const currentDebuggerState = {
  uploadedProject: undefined as Project | undefined,
  settings: undefined as Settings | undefined,
};

export type DynamicGraphRunOptions = {
  client: WebSocket;
  requestId: RemoteRunRequestId;
  graphId: GraphId;
  inputs?: GraphInputs;
  runToNodeIds?: NodeId[];
  preloadData?: Record<NodeId, Outputs>;
  contextValues: Record<string, DataValue>;
  projectPath: string | undefined;
  useEditorCache?: boolean;
};

export type DynamicGraphRun = (data: DynamicGraphRunOptions) => Promise<void>;

export function startDebuggerServer(
  options: {
    getClientsForProcessor?: (processor: GraphProcessor, allClients: WebSocket[]) => WebSocket[];
    getProcessorsForClient?: (client: WebSocket, allProcessors: GraphProcessor[]) => GraphProcessor[];
    datasetProvider?: DebuggerDatasetProvider;
    server?: WebSocketServer;
    port?: number;
    dynamicGraphRun?: DynamicGraphRun;
    allowGraphUpload?: boolean;
    throttlePartialOutputs?: number;
    host?: string;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
  } = {},
): RivetDebuggerServer {
  const { port = 21888, throttlePartialOutputs = 100, host = 'localhost' } = options;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs == null || !Number.isFinite(options.heartbeatIntervalMs)
      ? DEBUGGER_HEARTBEAT_INTERVAL_MS
      : options.heartbeatIntervalMs;
  const heartbeatTimeoutMs =
    options.heartbeatTimeoutMs && Number.isFinite(options.heartbeatTimeoutMs) && options.heartbeatTimeoutMs > 0
      ? options.heartbeatTimeoutMs
      : DEBUGGER_HEARTBEAT_TIMEOUT_MS;

  const server = options.server ?? new WebSocketServer({ port, host });

  const emitter = new Emittery<DebuggerEvents>();

  const attachedProcessors: GraphProcessor[] = [];
  const requestIdsByProcessorId = new Map<string, RemoteRunRequestId | undefined>();
  const processorEventCleanupsByProcessorId = new Map<string, Array<() => void>>();
  const socketHeartbeats = new WeakMap<WebSocket, DebuggerSocketHeartbeat>();

  server.on('connection', (socket) => {
    const heartbeat = startDebuggerSocketHeartbeat(socket, {
      intervalMs: heartbeatIntervalMs,
      timeoutMs: heartbeatTimeoutMs,
    });
    socketHeartbeats.set(socket, heartbeat);

    socket.once('close', () => {
      socketHeartbeats.delete(socket);
    });

    if (options.datasetProvider) {
      options.datasetProvider.onrequest = (type, data) => {
        const payload = stringifyDebuggerMessage(
          {
            message: type,
            data,
          },
          emitter,
        );
        if (payload) {
          sendDebuggerMessage(socket, payload, emitter, socketHeartbeats.get(socket));
        }
      };
    }

    const handleMessage = async (data: WebSocket.RawData) => {
      try {
        const stringData = data.toString();

        if (stringData.startsWith('set-static-data:')) {
          const [, id, value] = stringData.split(':');

          if (currentDebuggerState.uploadedProject) {
            currentDebuggerState.uploadedProject.data ??= {};
            currentDebuggerState.uploadedProject.data![id as DataId] = value!;
          }
          return;
        }

        const message = JSON.parse(data.toString()) as { type: string; data: unknown };

        await match(message)
          .with({ type: 'run' }, async () => {
            const runData = message.data as {
              requestId: RemoteRunRequestId;
              graphId: GraphId;
              inputs: GraphInputs;
              runToNodeIds?: NodeId[];
              preloadData?: Record<NodeId, Outputs>;
              contextValues: Record<string, DataValue>;
              projectPath: string | undefined;
              useEditorCache?: boolean;
            };
            const {
              requestId,
              graphId,
              inputs,
              runToNodeIds,
              contextValues,
              preloadData,
              projectPath,
              useEditorCache,
            } = runData;

            await options.dynamicGraphRun?.({
              client: socket,
              requestId,
              graphId,
              inputs,
              runToNodeIds,
              contextValues,
              preloadData,
              projectPath,
              useEditorCache,
            });
          })
          .with({ type: 'set-dynamic-data' }, async () => {
            if (options.allowGraphUpload) {
              const { project, settings } = message.data as {
                project: Project;
                settings: Settings;
                datasets: string;
              };
              currentDebuggerState.uploadedProject = project;
              currentDebuggerState.settings = settings;
            }
          })
          .with({ type: 'datasets:response' }, async () => {
            options.datasetProvider?.handleResponse(message.type, message.data as any);
          })
          .otherwise(async () => {
            const processors = options.getProcessorsForClient?.(socket, attachedProcessors) ?? attachedProcessors;

            for (const processor of processors) {
              await match(message)
                .with({ type: 'abort' }, async () => {
                  await processor.abort();
                })
                .with({ type: 'pause' }, async () => {
                  processor.pause();
                })
                .with({ type: 'resume' }, async () => {
                  processor.resume();
                })
                .with({ type: 'user-input' }, async () => {
                  const { nodeId, answers } = message.data as { nodeId: NodeId; answers: StringArrayDataValue };
                  processor.userInput(nodeId, answers);
                })
                .with({ type: 'preload' }, async () => {
                  const data = (message.data as { nodeData: Record<NodeId, Outputs> }).nodeData;

                  for (const [nodeId, outputs] of Object.entries(data)) {
                    processor.preloadNodeData(nodeId as NodeId, outputs);
                  }
                })
                .otherwise(async () => {
                  throw new Error(`Unknown message type: ${message.type}`);
                });
            }
          });
      } catch (err) {
        emitDebuggerError(emitter, err);
      }
    };

    socket.on('message', (data) => {
      void handleMessage(data);
    });

    if (options.allowGraphUpload) {
      const payload = stringifyDebuggerMessage(
        {
          message: 'graph-upload-allowed',
          data: {},
        },
        emitter,
      );
      if (payload) {
        sendDebuggerMessage(socket, payload, emitter, socketHeartbeats.get(socket));
      }
    }
  });

  const debuggerServer: RivetDebuggerServer = {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),

    webSocketServer: server,

    /** Given an event on a processor, sends that processor's events to the correct debugger clients (allows routing debugger). */
    broadcast(processor: GraphProcessor, message: string, data: unknown, requestId?: RemoteRunRequestId) {
      const clients = options.getClientsForProcessor?.(processor, [...server.clients]) ?? [...server.clients];
      const resolvedRequestId = requestId ?? requestIdsByProcessorId.get(processor.id);
      const payload = stringifyDebuggerMessage({ message, data, requestId: resolvedRequestId }, emitter);

      if (!payload) {
        return;
      }

      clients.forEach((client) => sendDebuggerMessage(client, payload, emitter, socketHeartbeats.get(client)));
    },

    attach(processor: GraphProcessor, requestId?: RemoteRunRequestId) {
      if (attachedProcessors.find((p) => p.id === processor.id)) {
        return;
      }

      const lastPartialOutputsTimePerNode: Record<NodeId, number> = {};
      const cleanups: Array<() => void> = [];
      attachedProcessors.push(processor);
      requestIdsByProcessorId.set(processor.id, requestId);
      processorEventCleanupsByProcessorId.set(processor.id, cleanups);

      cleanups.push(
        processor.on('nodeStart', (data) => {
          debuggerServer.broadcast(processor, 'nodeStart', data);
        }),
      );
      cleanups.push(
        processor.on('nodeFinish', (data) => {
          debuggerServer.broadcast(processor, 'nodeFinish', data);
        }),
      );
      cleanups.push(
        processor.on('nodeError', ({ node, error, processId, execution }) => {
          debuggerServer.broadcast(processor, 'nodeError', {
            node,
            error: typeof error === 'string' ? error : error.toString(),
            processId,
            execution,
          });
        }),
      );
      cleanups.push(
        processor.on('error', ({ error }) => {
          debuggerServer.broadcast(processor, 'error', {
            error: typeof error === 'string' ? error : error.toString(),
          });
        }),
      );
      cleanups.push(
        processor.on('graphError', ({ graph, error, execution }) => {
          debuggerServer.broadcast(processor, 'graphError', {
            graph,
            error: typeof error === 'string' ? error : error.toString(),
            execution,
          });
        }),
      );
      cleanups.push(
        processor.on('nodeExcluded', (data) => {
          debuggerServer.broadcast(processor, 'nodeExcluded', data);
        }),
      );
      cleanups.push(
        processor.on('start', (data) => {
          debuggerServer.broadcast(processor, 'start', data);
        }),
      );
      cleanups.push(
        processor.on('done', (data) => {
          debuggerServer.broadcast(processor, 'done', data);
        }),
      );
      cleanups.push(
        processor.on('partialOutput', (data) => {
          // Throttle the partial outputs because they can get ridiculous on the serdes side
          if (
            lastPartialOutputsTimePerNode[data.node.id] == null ||
            (lastPartialOutputsTimePerNode[data.node.id] ?? 0) + throttlePartialOutputs < Date.now()
          ) {
            debuggerServer.broadcast(processor, 'partialOutput', data);
            lastPartialOutputsTimePerNode[data.node.id] = Date.now();
          }
        }),
      );
      cleanups.push(
        processor.on('abort', () => {
          debuggerServer.broadcast(processor, 'abort', null);
        }),
      );
      cleanups.push(
        processor.on('graphAbort', (data) => {
          debuggerServer.broadcast(processor, 'graphAbort', data);
        }),
      );
      cleanups.push(
        processor.on('trace', (message) => {
          debuggerServer.broadcast(processor, 'trace', message);
        }),
      );
      cleanups.push(
        processor.on('nodeOutputsCleared', (data) => {
          debuggerServer.broadcast(processor, 'nodeOutputsCleared', data);
        }),
      );
      cleanups.push(
        processor.on('graphStart', (data) => {
          debuggerServer.broadcast(processor, 'graphStart', data);
        }),
      );
      cleanups.push(
        processor.on('graphFinish', (data) => {
          debuggerServer.broadcast(processor, 'graphFinish', data);
        }),
      );
      cleanups.push(
        processor.on('pause', () => {
          debuggerServer.broadcast(processor, 'pause', null);
        }),
      );
      cleanups.push(
        processor.on('resume', () => {
          debuggerServer.broadcast(processor, 'resume', null);
        }),
      );
      cleanups.push(
        processor.on('userInput', (data) => {
          debuggerServer.broadcast(processor, 'userInput', data);
        }),
      );
      cleanups.push(
        processor.on('finish', () => {
          debuggerServer.detach(processor);
        }),
      );
    },

    detach(processor: GraphProcessor) {
      const cleanups = processorEventCleanupsByProcessorId.get(processor.id);
      processorEventCleanupsByProcessorId.delete(processor.id);

      for (const cleanup of cleanups ?? []) {
        try {
          cleanup();
        } catch (err) {
          emitDebuggerError(emitter, err);
        }
      }

      const processorIndex = attachedProcessors.findIndex((p) => p.id === processor.id);
      if (processorIndex !== -1) {
        attachedProcessors.splice(processorIndex, 1);
      }
      requestIdsByProcessorId.delete(processor.id);
    },
  };

  return debuggerServer;
}

type DebuggerSocketHeartbeat = {
  markActivity: () => void;
};

function stringifyDebuggerMessage(message: unknown, emitter: Emittery<DebuggerEvents>): string | undefined {
  try {
    return JSON.stringify(message);
  } catch (err) {
    emitDebuggerError(emitter, err);
    return undefined;
  }
}

function sendDebuggerMessage(
  socket: WebSocket,
  payload: string,
  emitter: Emittery<DebuggerEvents>,
  heartbeat?: DebuggerSocketHeartbeat,
) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(payload, (err) => {
      if (err) {
        emitDebuggerError(emitter, err);
        terminateDebuggerSocket(socket);
        return;
      }

      heartbeat?.markActivity();
    });
    heartbeat?.markActivity();
    return true;
  } catch (err) {
    emitDebuggerError(emitter, err);
    terminateDebuggerSocket(socket);
    return false;
  }
}

function emitDebuggerError(emitter: Emittery<DebuggerEvents>, error: unknown) {
  void emitter.emit('error', getError(error)).catch(() => {
    // noop, just prevent unhandled rejection
  });
}

function terminateDebuggerSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  try {
    socket.terminate();
  } catch {
    // noop; send failures should not escape debugger transport cleanup
  }
}

function startDebuggerSocketHeartbeat(
  socket: WebSocket,
  options: {
    intervalMs: number;
    timeoutMs: number;
  },
): DebuggerSocketHeartbeat {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    return {
      markActivity: () => {},
    };
  }

  let awaitingPong = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const clearHeartbeatTimeout = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  const markAlive = () => {
    awaitingPong = false;
    clearHeartbeatTimeout();
  };

  const terminateUnresponsiveSocket = () => {
    if (!awaitingPong) {
      return;
    }

    timeout = undefined;
    terminateDebuggerSocket(socket);
  };

  const sendPing = () => {
    if (socket.readyState !== WebSocket.OPEN || awaitingPong) {
      return;
    }

    awaitingPong = true;
    try {
      socket.ping();
    } catch {
      awaitingPong = false;
      terminateDebuggerSocket(socket);
      return;
    }

    timeout = setTimeout(terminateUnresponsiveSocket, options.timeoutMs);
    unrefTimer(timeout);
  };

  const interval = setInterval(sendPing, options.intervalMs);
  unrefTimer(interval);

  const cleanup = () => {
    clearInterval(interval);
    clearHeartbeatTimeout();
    socket.off('pong', markAlive);
    socket.off('message', markAlive);
    socket.off('close', cleanup);
    socket.off('error', cleanup);
  };

  socket.on('pong', markAlive);
  socket.on('message', markAlive);
  socket.once('close', cleanup);
  socket.once('error', cleanup);

  return {
    markActivity: markAlive,
  };
}

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>) {
  (timer as { unref?: () => void }).unref?.();
}
