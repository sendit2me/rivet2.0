import { serve as serveHono } from '@hono/node-server';
import { createProcessor, getSingleNodeStream, loadProjectFromFile } from '@valerypopoff/rivet2-node';
import type {
  LooseDataValue,
  NodeCreateProcessorOptions,
  Outputs,
  Project,
  RivetEventStreamFilterSpec,
} from '@valerypopoff/rivet2-node';
import chalk from 'chalk';
import didYouMean from 'didyoumean2';
import { configDotenv } from 'dotenv';
import { Hono } from 'hono';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type * as yargs from 'yargs';
import { parseJsonInputRecord } from '../commandInputs.js';

type ServeArgs = {
  port: number;
  projectFile: string | undefined;
  dev: boolean;
  graph: string | undefined;
  allowSpecifyingGraphId: boolean;
  openaiApiKey: string | undefined;
  openaiEndpoint: string | undefined;
  openaiOrganization: string | undefined;
  exposeCost: boolean;
  stream: string | undefined;
  streamNode: string | undefined;
};

type GraphRunArgs = {
  exposeCost: boolean;
  graph: string | undefined;
  inputs: Record<string, LooseDataValue>;
  openaiApiKey: string | undefined;
  openaiEndpoint: string | undefined;
  openaiOrganization: string | undefined;
  project: Project;
};

type GraphProcessorArgs = Omit<GraphRunArgs, 'exposeCost' | 'project'>;

export function makeCommand<T>(y: yargs.Argv<T>) {
  return y
    .option('port', {
      describe: 'The port to serve on',
      type: 'number',
      default: 3000,
    })
    .option('dev', {
      describe: 'Run in development mode: rereads the project file on each request',
      type: 'boolean',
      default: false,
    })
    .option('graph', {
      describe: 'The ID or name of the graph to run. If omitted, the main graph is used.',
      type: 'string',
      demandOption: false,
    })
    .option('allow-specifying-graph-id', {
      describe: 'Allow specifying the graph ID in the URL path',
      type: 'boolean',
      default: false,
    })
    .option('openai-api-key', {
      describe:
        'The OpenAI API key to use for the project. If omitted, the environment variable OPENAI_API_KEY is used.',
      type: 'string',
      demandOption: false,
    })
    .option('openai-endpoint', {
      describe:
        'The OpenAI API endpoint to use for the project. If omitted, the environment variable OPENAI_ENDPOINT is used.',
      type: 'string',
      demandOption: false,
    })
    .option('openai-organization', {
      describe:
        'The OpenAI organization to use for the project. If omitted, the environment variable OPENAI_ORGANIZATION is used.',
      type: 'string',
      demandOption: false,
    })
    .option('expose-cost', {
      describe: 'Expose the cost of the graph run in the response',
      type: 'boolean',
      default: false,
    })
    .option('stream', {
      describe:
        'Turns on streaming mode. Rivet events will be sent to the client using SSE (Server-Sent Events). If this is set to a Node ID or node title, only events for that node will be sent.',
      type: 'string',
      demandOption: false,
    })
    .option('stream-node', {
      describe: 'Streams the partial outputs of a specific node. Requires --stream to be set.',
      type: 'string',
      demandOption: false,
    })
    .positional('projectFile', {
      describe:
        'The project file to serve. If omitted, the project file in the current directory is used. There cannot be multiple project files in the current directory.',
      type: 'string',
      demandOption: false,
    });
}

export async function serve(args: ServeArgs) {
  try {
    configDotenv();

    const app = new Hono();
    const projectFilePath = await getProjectFile(args.projectFile);
    const initialProject = await loadProjectFromFile(projectFilePath);

    throwIfNoMainGraph(initialProject, args.graph, projectFilePath);
    throwIfInvalidGraph(initialProject, args.graph);

    if (args.stream != null) {
      console.log('Streaming is enabled');
    }

    if (args.streamNode != null) {
      if (args.stream == null) {
        throw new Error('--stream-node requires --stream.');
      }

      console.log(`Streaming node ${chalk.bold(args.streamNode)}`);
    }

    app.post('/', async (c) => {
      const project = args.dev ? await loadProjectFromFile(projectFilePath) : initialProject;
      const inputs = parseJsonInputRecord(await c.req.text(), 'Request body');
      const graphRunArgs = buildGraphRunArgs(args, project, inputs, args.graph);

      if (args.stream != null) {
        const stream = await streamGraph({
          ...graphRunArgs,
          stream: args.stream,
          streamNode: args.streamNode,
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      return c.json(await runGraph(graphRunArgs));
    });

    if (args.allowSpecifyingGraphId) {
      app.post('/:graphId', async (c) => {
        const project = args.dev ? await loadProjectFromFile(projectFilePath) : initialProject;
        const graph = c.req.param('graphId');
        throwIfInvalidGraph(project, graph);

        const inputs = parseJsonInputRecord(await c.req.text(), 'Request body');
        return c.json(await runGraph(buildGraphRunArgs(args, project, inputs, graph)));
      });
    }

    const server = serveHono({
      port: args.port,
      fetch: app.fetch,
    });

    const servedGraphName = resolveServedGraphName(initialProject, args.graph);

    console.log(
      chalk.green(
        `Serving project file ${chalk.bold.white(projectFilePath)} on port ${chalk.bold.white(args.port)}.\nServing graph "${chalk.bold.white(servedGraphName)}".`,
      ),
    );

    function shutdown() {
      console.log('Shutting down...');

      server.close((err) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }

        process.exit(0);
      });
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error(chalk.red(err));
    process.exit(1);
  }
}

function buildGraphRunArgs(
  args: ServeArgs,
  project: Project,
  inputs: Record<string, LooseDataValue>,
  graph: string | undefined,
): GraphRunArgs {
  return {
    exposeCost: args.exposeCost,
    graph,
    inputs,
    openaiApiKey: args.openaiApiKey,
    openaiEndpoint: args.openaiEndpoint,
    openaiOrganization: args.openaiOrganization,
    project,
  };
}

async function streamGraph({
  project,
  inputs,
  graph,
  openaiApiKey,
  openaiEndpoint,
  openaiOrganization,
  stream,
  streamNode,
}: GraphRunArgs & { stream: string | undefined; streamNode: string | undefined }): Promise<ReadableStream> {
  const { run, processor, getSSEStream } = createProcessor(
    project,
    buildStreamingGraphProcessorOptions({
      graph,
      inputs,
      openaiApiKey,
      openaiEndpoint,
      openaiOrganization,
    }),
  );

  const responseStream = streamNode
    ? getSingleNodeStream(processor, streamNode)
    : getSSEStream(buildStreamEventFilter(stream));

  run().catch((err) => {
    console.error(err);
  });

  return responseStream;
}

export function buildGraphProcessorOptions({
  inputs,
  graph,
  openaiApiKey,
  openaiEndpoint,
  openaiOrganization,
}: GraphProcessorArgs): NodeCreateProcessorOptions {
  return {
    inputs,
    graph,
    openAiKey: openaiApiKey,
    openAiEndpoint: openaiEndpoint,
    openAiOrganization: openaiOrganization,
  };
}

export function buildStreamingGraphProcessorOptions(args: GraphProcessorArgs): NodeCreateProcessorOptions {
  return {
    ...buildGraphProcessorOptions(args),
    runtimeProfile: 'compatible',
  };
}

export function buildStreamEventFilter(stream: string | undefined): RivetEventStreamFilterSpec {
  const streamTarget = stream?.trim();

  if (!streamTarget) {
    return {
      nodeStart: true,
      nodeFinish: true,
      partialOutputs: true,
    };
  }

  return {
    nodeStart: [streamTarget],
    nodeFinish: [streamTarget],
    partialOutputs: [streamTarget],
  };
}

async function runGraph({
  project,
  inputs,
  graph,
  openaiApiKey,
  openaiEndpoint,
  openaiOrganization,
  exposeCost,
}: GraphRunArgs): Promise<Outputs> {
  const { run } = createProcessor(project, buildGraphProcessorOptions({
    graph,
    inputs,
    openaiApiKey,
    openaiEndpoint,
    openaiOrganization,
  }));

  const outputs = await run();

  if (!exposeCost) {
    delete outputs.cost;
  }

  return outputs;
}

function getGraphSummaries(project: Project): Array<{ id: string; name: string }> {
  return Object.values(project.graphs).map((graph) => ({
    id: graph.metadata!.id!,
    name: graph.metadata!.name!,
  }));
}

function findGraph(project: Project, graphIdOrName: string | undefined) {
  if (!graphIdOrName) {
    return undefined;
  }

  return getGraphSummaries(project).find((graph) => graph.id === graphIdOrName || graph.name === graphIdOrName);
}

function formatGraphList(project: Project): string {
  return getGraphSummaries(project)
    .map((graph) => `- "${graph.name}" (${graph.id})`)
    .join('\n');
}

function resolveServedGraphName(project: Project, graph: string | undefined) {
  const servedGraph = findGraph(project, graph ?? project.metadata.mainGraphId);

  if (!servedGraph) {
    throw new Error(`Project main graph "${project.metadata.mainGraphId}" was not found in the project file.`);
  }

  return servedGraph.name;
}

function throwIfNoMainGraph(project: Project, graph: string | undefined, projectFilePath: string) {
  if (project.metadata.mainGraphId || graph) {
    return;
  }

  const validGraphs = getGraphSummaries(project);

  if (validGraphs.length === 0) {
    throw new Error('No graphs found in the project file. Please edit the project file in Rivet and add a graph.');
  }

  const firstExample = `rivet serve ${projectFilePath} --graph ${validGraphs[0]!.id}`;
  const secondExample = `rivet serve ${projectFilePath} --graph "${validGraphs[0]!.name}"`;

  throw new Error(
    `No graph name provided, and project does not specify a main graph. Valid graphs are: \n\n${formatGraphList(
      project,
    )}\n\nUse either the graph's name or its ID. For example, \n- \`${chalk.bold(firstExample)}\` or\n- \`${chalk.bold(secondExample)}\``,
  );
}

function throwIfInvalidGraph(project: Project, graph: string | undefined) {
  if (!graph) {
    const mainGraphId = project.metadata.mainGraphId;

    if (!mainGraphId || findGraph(project, mainGraphId)) {
      return;
    }

    throw new Error(`Project main graph "${mainGraphId}" was not found in the project file.`);
  }

  if (findGraph(project, graph)) {
    return;
  }

  const validGraphsAndIds = getGraphSummaries(project).flatMap((graph) => [graph.id, graph.name]);
  const suggestion = didYouMean(graph, validGraphsAndIds);

  if (suggestion) {
    throw new Error(
      `Graph "${graph}" not found in project file. Did you mean \`${chalk.bold(`--graph "${suggestion}"`)}\`?`,
    );
  }

  throw new Error(`Graph "${graph}" not found in project file. Valid graphs are: \n${formatGraphList(project)}`);
}

async function getProjectFile(initialProjectFilePath: string | undefined): Promise<string> {
  let projectFilePath = resolve(
    process.cwd(),
    initialProjectFilePath ?? (await getProjectFilePathFromDirectory(process.cwd())),
  );

  await throwIfMissingFile(projectFilePath);

  if ((await stat(projectFilePath)).isDirectory()) {
    projectFilePath = await getProjectFilePathFromDirectory(projectFilePath);
  }

  return projectFilePath;
}

async function getProjectFilePathFromDirectory(directory: string): Promise<string> {
  const files = await readdir(directory);
  const projectFiles = files.filter((file) => extname(file).toLowerCase() === '.rivet-project');

  if (projectFiles.length === 0) {
    throw new Error('No project file found in the current directory. Project files should end with .rivet-project.');
  }

  if (projectFiles.length > 1) {
    throw new Error(
      `Multiple project files found in the current directory. Please specify which one to serve: \n${projectFiles.join(
        '\n',
      )}`,
    );
  }

  return join(directory, projectFiles[0]!);
}

async function throwIfMissingFile(filePath: string) {
  try {
    await stat(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }

    let possibleFiles: string[] = [];

    try {
      possibleFiles = await readdir(dirname(filePath));
    } catch {
      throw new Error(`Could not find project file "${filePath}".`);
    }

    const suggestion = didYouMean(basename(filePath), possibleFiles);

    if (suggestion) {
      throw new Error(
        `Could not find project file "${filePath}". Did you mean "${join(dirname(filePath), suggestion)}"?`,
      );
    }

    throw new Error(`Could not find project file "${filePath}".`);
  }
}
