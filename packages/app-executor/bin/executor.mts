import {
  startDebuggerServer,
  currentDebuggerState,
  createProcessor,
  assembleRegistry,
  resolveBuiltInPlugin,
  DebuggerDatasetProvider,
  NodeProjectReferenceLoader,
} from '@rivet2/rivet-node';
import * as Rivet from '@rivet2/rivet-core';
import {
  getError,
  logRuntimeDebug,
  logRuntimeError,
  logRuntimeInfo,
  logRuntimeWarn,
  summarizePortMapForLog,
  type RivetPluginInitializer,
  type PluginLoadSpec,
} from '@rivet2/rivet-core';
import { match } from 'ts-pattern';
import { join } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { platform, homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AppExecutorWorkerCodeRunner } from './AppExecutorWorkerCodeRunner.mjs';
import { parseExecutorHostFromArgs, parseExecutorPortFromArgs } from './executorConfig.mjs';

const datasetProvider = new DebuggerDatasetProvider();
const editorExecutionCachesByProjectId = new Map<string, Map<string, unknown>>();

function getEditorExecutionCache(project: Rivet.Project) {
  let cache = editorExecutionCachesByProjectId.get(project.metadata.id);

  if (!cache) {
    cache = new Map<string, unknown>();
    editorExecutionCachesByProjectId.set(project.metadata.id, cache);
  }

  return cache;
}

/**
 * Dynamically import a module and resolve its default export. Handles the
 * CJS/ESM interop case where `import()` may wrap the real default in an
 * extra `{ default: ... }` layer depending on the module format of the target.
 */
async function importPluginInitializer(specifier: string, pluginId: string): Promise<RivetPluginInitializer> {
  const imported = (await import(specifier)) as {
    default: RivetPluginInitializer | { default: RivetPluginInitializer };
  };
  const mod =
    typeof imported.default === 'function'
      ? imported.default
      : (imported.default as { default: RivetPluginInitializer }).default;
  if (typeof mod !== 'function') {
    throw new Error(`Plugin ${pluginId} does not export a valid initializer function`);
  }
  return mod;
}

// Roughly https://github.com/demurgos/appdata-path/blob/master/lib/index.js but appdata local and .local/share, try to match `dirs` from rust
function getAppDataLocalPath() {
  const identifier = 'com.valerypopoff.rivet2';
  return match(platform())
    .with('win32', () => join(homedir(), 'AppData', 'Local', identifier))
    .with('darwin', () => join(homedir(), 'Library', 'Application Support', identifier))
    .with('linux', () => join(homedir(), '.local', 'share', identifier))
    .otherwise(() => {
      if (platform().startsWith('win')) {
        return join(homedir(), 'AppData', 'Local', identifier);
      } else {
        return join(homedir(), '.local', 'share', identifier);
      }
    });
}

const executorArgs = process.argv.slice(2);
const port = parseExecutorPortFromArgs(executorArgs);
const host = parseExecutorHostFromArgs(executorArgs);
const executorReadyMessage = `Rivet app executor websocket listening on ${host}:${port}`;
let executorWebSocketReady = false;
let exitingAfterStartupError = false;

process.on('unhandledRejection', (reason) => {
  handleTopLevelSidecarError('Unhandled promise rejection in app executor sidecar.', reason);
});

process.on('uncaughtException', (error) => {
  handleTopLevelSidecarError('Uncaught exception in app executor sidecar.', error);
});

function handleTopLevelSidecarError(message: string, error: unknown) {
  logRuntimeError(message, error);

  if (!executorWebSocketReady && !exitingAfterStartupError) {
    exitingAfterStartupError = true;
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  }
}

function sendGraphRunError(client: { send(data: string): void }, requestId: Rivet.RemoteRunRequestId, error: unknown) {
  try {
    client.send(
      JSON.stringify({
        message: 'error',
        data: {
          error: getError(error).toString(),
        },
        requestId,
      }),
    );
  } catch (sendError) {
    logRuntimeError('Failed to report graph run error to executor client.', sendError, { requestId });
  }
}

const rivetDebugger = startDebuggerServer({
  port,
  host,
  allowGraphUpload: true,
  datasetProvider,
  dynamicGraphRun: async ({
    client,
    requestId,
    graphId,
    inputs,
    runToNodeIds,
    contextValues,
    runFromNodeId,
    projectPath,
    useEditorCache,
  }) => {
    logRuntimeInfo(`Running graph ${graphId}`, {
      requestId,
      inputCount: Object.keys(inputs ?? {}).length,
      runToNodeCount: runToNodeIds?.length ?? 0,
      hasRunFromNode: runFromNodeId != null,
      contextValueCount: Object.keys(contextValues ?? {}).length,
      hasProjectPath: projectPath != null,
    });
    logRuntimeDebug('Graph input summary', {
      requestId,
      inputs: summarizePortMapForLog(inputs),
    });

    const project = currentDebuggerState.uploadedProject;

    if (project === undefined) {
      logRuntimeWarn(`Cannot run graph ${graphId} because no project is uploaded.`);
      sendGraphRunError(client, requestId, new Error(`Cannot run graph ${graphId} because no project is uploaded.`));
      return;
    }

    let processorForConsole: ReturnType<typeof createProcessor>['processor'] | undefined;

    try {
      const { registry, results } = await assembleRegistry(project.plugins ?? [], async (spec: PluginLoadSpec) => {
        return match(spec)
          .with({ type: 'built-in' }, async (s) => resolveBuiltInPlugin(s.id))
          .with({ type: 'uri' }, async (s) => {
            const mod = await importPluginInitializer(s.uri, s.id);
            const initialized = mod(Rivet);
            if (!initialized?.id) {
              throw new Error(`Plugin ${s.id} does not have an id`);
            }
            return initialized;
          })
          .with({ type: 'package' }, async (s) => {
            const localDataDir = getAppDataLocalPath();
            const pluginDir = join(localDataDir, `plugins/${s.package}-${s.tag}/package`);
            const packageJsonPath = join(pluginDir, 'package.json');

            try {
              await access(packageJsonPath);
            } catch (err) {
              throw new Error(`Plugin ${s.id} is not installed, could not access ${packageJsonPath}`);
            }

            const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
            if (packageJson.name !== s.package) {
              throw new Error(`Plugin ${s.id} is not installed, found ${packageJson.name} instead of ${s.package}`);
            }

            const mainPath = join(pluginDir, packageJson.main);
            const mod = await importPluginInitializer(pathToFileURL(mainPath).href, s.id);
            const initialized = mod(Rivet);
            if (!initialized?.id) {
              throw new Error(`Plugin ${s.id} does not have an id`);
            }
            return initialized;
          })
          .exhaustive();
      });

      for (const plugin of results.loaded) {
        logRuntimeInfo(`Enabled plugin ${plugin.id}.`);
      }
      for (const fail of results.failed) {
        logRuntimeError(`Failed to enable plugin ${fail.id}.`, fail.error);
      }

      const codeRunner = new AppExecutorWorkerCodeRunner((message) => {
        if (processorForConsole) {
          rivetDebugger.broadcast(processorForConsole, 'codeConsole', message, requestId);
        }
      });

      const processor = createProcessor(project, {
        graph: graphId,
        inputs,
        ...currentDebuggerState.settings!,
        remoteDebugger: rivetDebugger,
        remoteDebuggerRequestId: requestId,
        registry,
        datasetProvider,
        codeRunner,
        editorExecutionCache: useEditorCache ? getEditorExecutionCache(project) : undefined,
        onTrace: (trace) => {
          logRuntimeDebug('Graph trace', { trace });
        },
        context: contextValues,
        projectPath,
        projectReferenceLoader: new NodeProjectReferenceLoader(),
      });
      processorForConsole = processor.processor;

      if (runToNodeIds) {
        processor.processor.runToNodeIds = runToNodeIds;
      }

      if (runFromNodeId) {
        processor.processor.runFromNodeId = runFromNodeId;
      }

      await processor.run();
    } catch (err) {
      logRuntimeError(`Graph ${graphId} failed.`, err, { requestId });
      sendGraphRunError(client, requestId, err);
    } finally {
      if (processorForConsole) {
        rivetDebugger.detach(processorForConsole);
      }
    }
  },
});

process.on('SIGTERM', () => {
  rivetDebugger.webSocketServer.close();
});

function announceExecutorReady() {
  executorWebSocketReady = true;
  logRuntimeInfo(executorReadyMessage);
}

if (rivetDebugger.webSocketServer.address()) {
  announceExecutorReady();
} else {
  rivetDebugger.webSocketServer.once('listening', () => {
    announceExecutorReady();
  });
}
