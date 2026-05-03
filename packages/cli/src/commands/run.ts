import { createProcessor, loadProjectFromFile, type LooseDataValue } from '@valerypopoff/rivet2-node';
import { resolve } from 'node:path';
import type * as yargs from 'yargs';
import { parseJsonInputRecord, parseKeyValueInputRecord } from '../commandInputs.js';

export function makeCommand<T>(y: yargs.Argv<T>) {
  return y
    .positional('projectFile', {
      describe: 'The project file to run',
      type: 'string',
      demandOption: true,
    })
    .positional('graphName', {
      describe: 'The name of the graph to run',
      type: 'string',
    })
    .option('inputs-stdin', {
      describe: 'Read inputs from stdin as JSON',
      type: 'boolean',
      default: false,
    })
    .option('include-cost', {
      describe: 'Include the total cost in the output',
      type: 'boolean',
      default: false,
    })
    .option('context', {
      describe: 'Adds a context value to the graph run',
      type: 'string',
      array: true,
      default: [],
    })
    .option('input', {
      describe: 'Adds an input to the graph run',
      type: 'string',
      array: true,
      default: [],
    });
}

export async function run(args: {
  projectFile: string;
  graphName: string | undefined;
  inputsStdin: boolean;
  includeCost: boolean;
  context: string[];
  input: string[];
}) {
  try {
    const projectPath = resolve(process.cwd(), args.projectFile);
    const project = await loadProjectFromFile(projectPath);

    if (!args.graphName && !project.metadata.mainGraphId) {
      const validGraphs = Object.values(project.graphs).map((graph) => [graph.metadata!.id!, graph.metadata!.name!]);
      const validGraphNames = validGraphs.map(([id, name]) => `- "${name}" (${id})`);

      console.error(
        `No graph name provided, and project does not specify a main graph. Valid graphs are: \n${validGraphNames.join(
          '\n',
        )}\n\nUse either the graph's name or its ID. For example, \`rivet run my-project.rivet-project my-graph\` or \`rivet run my-project.rivet-project 1234abcd\``,
      );
      process.exit(1);
    }

    let inputs: Record<string, LooseDataValue>;

    if (args.inputsStdin) {
      const stdin = process.stdin;
      stdin.setEncoding('utf8');

      let inputText = '';
      for await (const chunk of stdin) {
        inputText += chunk;
      }

      inputs = parseJsonInputRecord(inputText, 'Input stdin');
    } else {
      inputs = parseKeyValueInputRecord(args.input, 'input');
    }

    const contextValues = parseKeyValueInputRecord(args.context, 'context');

    const { run } = createProcessor(project, {
      graph: args.graphName,
      inputs,
      context: contextValues,
    });

    const outputs = await run();

    if (!args.includeCost) {
      delete outputs.cost;
    }

    console.log(JSON.stringify(outputs, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
