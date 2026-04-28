import {
  startDebuggerServer,
  currentDebuggerState,
  createProcessor,
  assembleRegistry,
  resolveBuiltInPlugin,
  DebuggerDatasetProvider,
  NodeProjectReferenceLoader,
} from '@ironclad/rivet-node';
import * as Rivet from '@ironclad/rivet-core';
import {
  logRuntimeDebug,
  logRuntimeError,
  logRuntimeInfo,
  logRuntimeWarn,
  summarizePortMapForLog,
  type RivetPluginInitializer,
  type PluginLoadSpec,
} from '@ironclad/rivet-core';
import { match } from 'ts-pattern';
import { join } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { platform, homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AppExecutorWorkerCodeRunner } from './AppExecutorWorkerCodeRunner.mjs';

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
  const identifier = 'com.ironcladapp.rivet';
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

function parsePortFromArgs(argv: string[]) {
  const defaultPort = 21889;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--port' || arg === '-p') {
      const value = argv[index + 1];
      const parsed = Number(value);
      if (!value || Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid port value: ${value ?? '(missing)'}`);
      }
      return parsed;
    }

    if (arg?.startsWith('--port=')) {
      const value = arg.slice('--port='.length);
      const parsed = Number(value);
      if (!value || Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid port value: ${value || '(missing)'}`);
      }
      return parsed;
    }
  }

  return defaultPort;
}

const port = parsePortFromArgs(process.argv.slice(2));

const rivetDebugger = startDebuggerServer({
  port,
  allowGraphUpload: true,
  datasetProvider,
  dynamicGraphRun: async ({
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
      return;
    }

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

    try {
      const processor = createProcessor(project, {
        graph: graphId,
        inputs,
        ...currentDebuggerState.settings!,
        remoteDebugger: rivetDebugger,
        remoteDebuggerRequestId: requestId,
        registry,
        datasetProvider,
        codeRunner: new AppExecutorWorkerCodeRunner(),
        editorExecutionCache: useEditorCache ? getEditorExecutionCache(project) : undefined,
        onTrace: (trace) => {
          logRuntimeDebug('Graph trace', { trace });
        },
        context: contextValues,
        projectPath,
        projectReferenceLoader: new NodeProjectReferenceLoader(),
      });

      if (runToNodeIds) {
        processor.processor.runToNodeIds = runToNodeIds;
      }

      if (runFromNodeId) {
        processor.processor.runFromNodeId = runFromNodeId;
      }

      await processor.run();
    } catch (err) {
      logRuntimeError(`Graph ${graphId} failed.`, err, { requestId });
      throw err;
    }
  },
});

process.on('SIGTERM', () => {
  rivetDebugger.webSocketServer.close();
});

logRuntimeInfo(`Node.js executor started on port ${port}.`);
