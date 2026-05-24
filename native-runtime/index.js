import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export async function createNativeGraphRunner(request) {
  const backendPreference = process.env.RIVET_NATIVE_RUNTIME_BACKEND ?? 'auto';

  if (backendPreference !== 'js') {
    const rustRunner = await createRustWorkerGraphRunner(request);
    if (rustRunner.supported || backendPreference === 'rust') {
      return rustRunner;
    }
  }

  return createJsGraphRunner(request);
}

const MISSING = Symbol('missing');

async function createJsGraphRunner(request) {
  const prepared = prepareRequest(request);
  if (!prepared.supported) {
    return prepared;
  }

  let disposed = false;

  return {
    backend: 'js-adapter',
    supported: true,
    runner: {
      dispose() {
        disposed = true;
      },
      async run(options = {}) {
        if (disposed) {
          throw new Error('Cannot run a disposed native graph runner.');
        }

        if (options.abortSignal?.aborted) {
          throw new Error('Aborted');
        }

        return runGraph(prepared.graphs, prepared.rootGraphId, options.inputs ?? {}, options.context ?? {}, {
          abortSignal: options.abortSignal,
        });
      },
    },
  };
}

async function createRustWorkerGraphRunner(request) {
  const workerBinary = await resolveRustWorkerBinary();
  if (!workerBinary) {
    return unsupported('rust-worker-not-built');
  }

  const worker = createRustWorkerProcess(workerBinary);

  try {
    const createResult = await worker.send({
      request,
      type: 'create',
    });

    if (!createResult.ok) {
      worker.dispose();
      return unsupported(createResult.reason ?? 'rust-worker-create-rejected');
    }
  } catch (error) {
    worker.dispose();
    return unsupported(`rust-worker-create-failed:${getErrorMessage(error)}`);
  }

  let disposed = false;

  return {
    backend: 'rust-worker',
    supported: true,
    runner: {
      dispose() {
        disposed = true;
        worker.dispose();
      },
      async run(options = {}) {
        if (disposed) {
          throw new Error('Cannot run a disposed native graph runner.');
        }

        if (options.abortSignal?.aborted) {
          throw new Error('Aborted');
        }

        const runResult = await worker.send({
          context: options.context ?? {},
          inputs: options.inputs ?? {},
          type: 'run',
        });

        if (!runResult.ok) {
          throw new Error(runResult.reason ?? 'Rust native worker run failed.');
        }

        return runResult.outputs ?? {};
      },
    },
  };
}

async function resolveRustWorkerBinary() {
  const explicitBinary = process.env.RIVET_NATIVE_RUNTIME_BINARY;
  const executableName = `rivet2_native_runtime_worker${process.platform === 'win32' ? '.exe' : ''}`;
  const packageDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    explicitBinary,
    join(packageDirectory, 'native', 'target', 'release', executableName),
    join(packageDirectory, 'native', 'target', 'debug', executableName),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      // Try the next explicit/native build location.
    }
  }

  return undefined;
}

function createRustWorkerProcess(workerBinary) {
  const child = spawn(workerBinary, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const pendingMessages = new Map();
  const stderrChunks = [];
  let disposed = false;
  let closed = false;
  let nextMessageId = 1;

  child.stderr?.on('data', (chunk) => {
    stderrChunks.push(chunk.toString());
    if (stderrChunks.length > 20) {
      stderrChunks.shift();
    }
  });

  createInterface({ input: child.stdout }).on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      closed = true;
      rejectAllPendingMessages(`invalid-rust-worker-response:${getErrorMessage(error)}`);
      child.kill();
      return;
    }

    const pending = pendingMessages.get(message.id);
    if (!pending) {
      return;
    }

    pendingMessages.delete(message.id);
    pending.resolve(message);
  });

  child.on('error', (error) => {
    closed = true;
    rejectAllPendingMessages(`rust-worker-error:${getErrorMessage(error)}`);
  });

  child.on('exit', (code, signal) => {
    closed = true;
    if (disposed) {
      return;
    }

    const stderr = stderrChunks.join('').trim();
    rejectAllPendingMessages(
      `rust-worker-exited:code=${code ?? '<none>'}:signal=${signal ?? '<none>'}${stderr ? `:${stderr}` : ''}`,
    );
  });

  function rejectAllPendingMessages(reason) {
    for (const pending of pendingMessages.values()) {
      pending.reject(new Error(reason));
    }
    pendingMessages.clear();
  }

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      closed = true;
      try {
        child.stdin?.write(`${JSON.stringify({ id: nextMessageId++, type: 'dispose' })}\n`);
      } catch {
        // The process may already be gone.
      }

      rejectAllPendingMessages('rust-worker-disposed');
      child.kill();
    },
    send(message) {
      if (disposed) {
        return Promise.reject(new Error('rust-worker-disposed'));
      }

      if (closed) {
        return Promise.reject(new Error('rust-worker-closed'));
      }

      const id = nextMessageId++;
      const payload = `${JSON.stringify({ ...message, id })}\n`;

      return new Promise((resolve, reject) => {
        pendingMessages.set(id, { reject, resolve });
        try {
          child.stdin.write(payload, (error) => {
            if (!error) {
              return;
            }

            pendingMessages.delete(id);
            reject(error);
          });
        } catch (error) {
          pendingMessages.delete(id);
          reject(error);
        }
      });
    },
  };
}

function prepareRequest(request) {
  if (!request || typeof request !== 'object') {
    return unsupported('invalid-request');
  }

  if (typeof request.graphId !== 'string' || !Array.isArray(request.graphs)) {
    return unsupported('invalid-request-shape');
  }

  const graphs = new Map();

  for (const graph of request.graphs) {
    const prepared = prepareGraph(graph);
    if (!prepared.supported) {
      return prepared;
    }

    if (graphs.has(prepared.graph.graphId)) {
      return unsupported(`duplicate-graph:${prepared.graph.graphId}`);
    }

    graphs.set(prepared.graph.graphId, prepared.graph);
  }

  if (!graphs.has(request.graphId)) {
    return unsupported(`missing-root-graph:${request.graphId}`);
  }

  return {
    graphs,
    rootGraphId: request.graphId,
    supported: true,
  };
}

function prepareGraph(graph) {
  if (!graph || typeof graph !== 'object' || typeof graph.graphId !== 'string') {
    return unsupported('invalid-graph');
  }

  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) {
    return unsupported(`invalid-graph-shape:${graph.graphId}`);
  }

  const nodesById = new Map();
  const incomingByNodeId = new Map();
  const dependenciesByNodeId = new Map();
  const dependentsByNodeId = new Map();

  for (const node of graph.nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string') {
      return unsupported(`invalid-node:${graph.graphId}`);
    }

    if (!isSupportedNodeType(node.type)) {
      return unsupported(`unsupported-node:${graph.graphId}:${node.type ?? '<missing>'}:${node.id}`);
    }

    const nodeValidation = validateNode(node, graph.graphId);
    if (!nodeValidation.supported) {
      return nodeValidation;
    }

    if (nodesById.has(node.id)) {
      return unsupported(`duplicate-node:${graph.graphId}:${node.id}`);
    }

    nodesById.set(node.id, node);
    incomingByNodeId.set(node.id, []);
    dependenciesByNodeId.set(node.id, new Set());
    dependentsByNodeId.set(node.id, new Set());
  }

  for (const connection of graph.connections) {
    if (!isConnection(connection)) {
      return unsupported(`invalid-connection:${graph.graphId}`);
    }

    if (!nodesById.has(connection.outputNodeId) || !nodesById.has(connection.inputNodeId)) {
      return unsupported(`stale-connection:${graph.graphId}`);
    }

    incomingByNodeId.get(connection.inputNodeId).push(connection);

    if (connection.outputNodeId !== connection.inputNodeId) {
      dependenciesByNodeId.get(connection.inputNodeId).add(connection.outputNodeId);
      dependentsByNodeId.get(connection.outputNodeId).add(connection.inputNodeId);
    }
  }

  const missingRequiredInput = getMissingRequiredInput(graph.nodes, graph.connections, graph.graphId);
  if (missingRequiredInput) {
    return missingRequiredInput;
  }

  const readyNodeIds = graph.nodes
    .filter((node) => dependenciesByNodeId.get(node.id).size === 0)
    .map((node) => node.id);

  return {
    graph: {
      dependenciesByNodeId,
      dependentsByNodeId,
      graphId: graph.graphId,
      incomingByNodeId,
      nodes: graph.nodes,
      nodesById,
      readyNodeIds,
    },
    supported: true,
  };
}

async function runGraph(graphs, graphId, inputs, context, runState) {
  const graph = graphs.get(graphId);
  if (!graph) {
    throw new Error(`Native graph ${graphId} is not loaded.`);
  }

  const outputsByNodeId = new Map();
  const graphInputs = createRecord();
  const graphOutputs = createRecord();
  const remainingDependencies = new Map();
  const readyNodeIds = [...graph.readyNodeIds];

  for (const [nodeId, dependencies] of graph.dependenciesByNodeId) {
    remainingDependencies.set(nodeId, new Set(dependencies));
  }

  while (readyNodeIds.length > 0) {
    if (runState.abortSignal?.aborted) {
      throw new Error('Aborted');
    }

    const nodeId = readyNodeIds.shift();
    const node = graph.nodesById.get(nodeId);
    const nodeInputs = resolveNodeInputs(graph.incomingByNodeId.get(nodeId) ?? [], outputsByNodeId);
    const nodeOutputs = await runNode(node, {
      context,
      graphInputs,
      graphOutputs,
      graphs,
      inputs,
      nodeInputs,
      runState,
    });

    outputsByNodeId.set(nodeId, nodeOutputs);

    for (const dependentId of graph.dependentsByNodeId.get(nodeId) ?? []) {
      const remaining = remainingDependencies.get(dependentId);
      remaining.delete(nodeId);
      if (remaining.size === 0) {
        readyNodeIds.push(dependentId);
      }
    }
  }

  if (outputsByNodeId.size !== graph.nodes.length) {
    throw new Error(`Native graph ${graphId} did not process every node.`);
  }

  return toPlainRecord(graphOutputs);
}

async function runNode(node, state) {
  switch (node.type) {
    case 'graphInput':
      return runGraphInputNode(node, state);
    case 'text':
      return runTextNode(node, state);
    case 'join':
      return runJoinNode(node, state);
    case 'coalesce':
      return runCoalesceNode(node, state);
    case 'destructure':
      return runDestructureNode(node, state);
    case 'extractObjectPath':
      return runExtractObjectPathNode(node, state);
    case 'graphOutput':
      return runGraphOutputNode(node, state);
    case 'subGraph':
      return runSubGraphNode(node, state);
    default:
      throw new Error(`Unsupported native node type: ${node.type}`);
  }
}

function runGraphInputNode(node, state) {
  const input = getRecordValue(state.inputs, node.inputId);
  let inputValue = input == null ? undefined : coerceDataValue(input, node.dataType);

  if (inputValue == null) {
    inputValue = coerceDataValue(inferDataValue(node.defaultValue), node.dataType) || getDefaultValue(node.dataType);
  }

  const value = {
    type: node.dataType,
    value: inputValue,
  };
  state.graphInputs[node.inputId] = value;

  return {
    data: value,
  };
}

function runTextNode(node, state) {
  const inputMap = createRecord();

  for (const [key, value] of Object.entries(state.nodeInputs)) {
    inputMap[key] = coerceDataValue(value, 'string') ?? '';
  }

  let output = interpolate(node.template, inputMap, state.graphInputs, state.context);
  if (node.normalizeLineEndings) {
    output = output.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  return {
    output: {
      type: 'string',
      value: output,
    },
  };
}

function runJoinNode(node, state) {
  const inputKeys = Object.keys(state.nodeInputs).filter((key) => key.startsWith('input'));
  const inputValueStrings = [];

  for (let i = 1; i <= inputKeys.length; i += 1) {
    const inputValue = state.nodeInputs[`input${i}`];
    if (isArrayDataValue(inputValue) && node.flatten) {
      const scalarType = inputValue.type.endsWith('[]') ? inputValue.type.slice(0, -2) : 'any';
      for (const value of inputValue.value) {
        inputValueStrings.push(coerceDataValue({ type: scalarType, value }, 'string') ?? '');
      }
    } else if (inputValue) {
      inputValueStrings.push(coerceDataValue(inputValue, 'string') ?? '');
    }
  }

  return {
    output: {
      type: 'string',
      value: inputValueStrings.join(handleEscapeCharacters(node.joinString)),
    },
  };
}

function runCoalesceNode(node, state) {
  if (state.nodeInputs.conditional?.type === 'control-flow-excluded') {
    return {
      output: {
        type: 'control-flow-excluded',
        value: undefined,
      },
    };
  }

  const inputCount = Object.keys(state.nodeInputs).reduce((maxInputNumber, inputId) => {
    const inputNumber = getDynamicInputNumber(inputId);
    return inputNumber == null ? maxInputNumber : Math.max(maxInputNumber, inputNumber);
  }, 0);

  for (let i = 1; i <= inputCount; i += 1) {
    const inputValue = state.nodeInputs[`input${i}`];
    if (inputValue && inputValue.type !== 'control-flow-excluded' && !shouldSkipCoalesceInputValue(node, inputValue)) {
      return {
        output: inputValue,
      };
    }
  }

  return {
    output: {
      type: 'control-flow-excluded',
      value: undefined,
    },
  };
}

function runDestructureNode(node, state) {
  const outputs = createRecord();
  const objectInput = state.nodeInputs.object;

  if (objectInput?.type === 'control-flow-excluded') {
    for (const selection of node.paths) {
      outputs[selection.outputId] = {
        type: 'control-flow-excluded',
        value: undefined,
      };
    }
    return outputs;
  }

  const objectValue = coerceDataValue(objectInput, 'object') ?? null;
  for (const selection of node.paths) {
    outputs[selection.outputId] = {
      type: 'any',
      value: getSimpleJsonPathValue(objectValue, selection.path),
    };
  }

  return outputs;
}

function runExtractObjectPathNode(node, state) {
  const objectInput = state.nodeInputs.object;

  if (objectInput?.type === 'control-flow-excluded') {
    return {
      all_matches: {
        type: 'control-flow-excluded',
        value: undefined,
      },
      match: {
        type: 'control-flow-excluded',
        value: undefined,
      },
    };
  }

  const objectValue = coerceDataValue(objectInput, 'object') ?? null;
  const match = getSimpleJsonPathMatch(objectValue, node.path);
  if (!match) {
    return {
      all_matches: {
        type: 'any[]',
        value: [],
      },
      match: {
        type: 'control-flow-excluded',
        value: undefined,
      },
    };
  }

  return {
    all_matches: {
      type: 'any[]',
      value: [match.value],
    },
    match: {
      type: 'any',
      value: match.value,
    },
  };
}

function runGraphOutputNode(node, state) {
  const hasValueInput = hasRecordValue(state.nodeInputs, 'value');
  const value = hasValueInput ? getRecordValue(state.nodeInputs, 'value') : { type: 'any', value: undefined };
  let currentOutput = getRecordValue(state.graphOutputs, node.outputId);

  if ((currentOutput == null || currentOutput.type === 'control-flow-excluded') && hasValueInput) {
    currentOutput = value;
    setRecordValue(state.graphOutputs, node.outputId, value);
  }

  return {
    valueOutput: currentOutput,
  };
}

async function runSubGraphNode(node, state) {
  const subgraphInputs = createRecord();
  copyRecordEntries(subgraphInputs, node.inputData ?? {});
  copyRecordEntries(subgraphInputs, state.nodeInputs);
  const startTime = Date.now();
  const outputs = await runGraph(state.graphs, node.graphId, subgraphInputs, state.context, state.runState);

  if (outputs.cost == null) {
    outputs.cost = {
      type: 'number',
      value: 0,
    };
  }

  if (outputs.duration == null) {
    outputs.duration = {
      type: 'number',
      value: Date.now() - startTime,
    };
  }

  return outputs;
}

function shouldSkipCoalesceInputValue(node, inputValue) {
  return (
    (node.ignoreNull === true && inputValue.value === null) ||
    (node.ignoreUndefined === true && inputValue.value === undefined)
  );
}

function getDynamicInputNumber(inputId) {
  const match = /^input([1-9]\d*)$/.exec(inputId);
  if (!match) {
    return undefined;
  }

  const inputNumber = Number(match[1]);
  return Number.isSafeInteger(inputNumber) ? inputNumber : undefined;
}

function getSimpleJsonPathValue(value, path) {
  return getSimpleJsonPathMatch(value, path)?.value;
}

function getSimpleJsonPathMatch(value, path) {
  const segments = parseSimpleJsonPath(path);
  if (!segments) {
    return undefined;
  }

  let current = value;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }

    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) {
        return undefined;
      }
      current = current[segment];
      continue;
    }

    if (
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = current[segment];
  }

  return {
    value: current,
  };
}

function parseSimpleJsonPath(path) {
  if (typeof path !== 'string') {
    return undefined;
  }

  const source = path.trim();
  if (!source || source[0] !== '$') {
    return undefined;
  }

  const segments = [];
  let index = 1;

  while (index < source.length) {
    if (source[index] === '.') {
      index += 1;
      if (!/[A-Za-z_$]/.test(source[index] ?? '')) {
        return undefined;
      }

      const keyStart = index;
      index += 1;
      while (/[A-Za-z0-9_$]/.test(source[index] ?? '')) {
        index += 1;
      }
      segments.push(source.slice(keyStart, index));
      continue;
    }

    if (source[index] === '[') {
      index += 1;
      const indexStart = index;
      while (/[0-9]/.test(source[index] ?? '')) {
        index += 1;
      }

      if (index === indexStart || source[index] !== ']') {
        return undefined;
      }

      const arrayIndex = Number(source.slice(indexStart, index));
      if (!Number.isSafeInteger(arrayIndex)) {
        return undefined;
      }

      segments.push(arrayIndex);
      index += 1;
      continue;
    }

    return undefined;
  }

  return segments;
}

function resolveNodeInputs(connections, outputsByNodeId) {
  const inputs = createRecord();

  for (const connection of connections) {
    const sourceOutputs = outputsByNodeId.get(connection.outputNodeId);
    const sourceValue =
      sourceOutputs && hasRecordValue(sourceOutputs, connection.outputId)
        ? getRecordValue(sourceOutputs, connection.outputId)
        : MISSING;

    if (sourceValue !== MISSING) {
      inputs[connection.inputId] = sourceValue;
    }
  }

  return inputs;
}

function interpolate(template, variables, graphInputValues, contextValues) {
  return replaceInterpolationTokens(template, (rawInner) => {
    const parts = rawInner.split('|').map((part) => part.trim());
    const expression = parts[0] ?? '';
    const processingChain = parts.slice(1).join('|');
    let resolvedValue;

    if (expression.startsWith('@graphInputs.')) {
      resolvedValue = resolveExpressionToString(graphInputValues, expression.slice('@graphInputs.'.length));
    } else if (expression.startsWith('@context.')) {
      resolvedValue = resolveExpressionToString(contextValues, expression.slice('@context.'.length));
    } else if (hasRecordValue(variables, expression)) {
      resolvedValue = String(unwrapPotentialDataValue(getRecordValue(variables, expression)) ?? '');
    }

    if (resolvedValue === undefined) {
      return '';
    }

    return processingChain ? applyProcessing(resolvedValue, processingChain) : resolvedValue;
  });
}

function replaceInterpolationTokens(template, getReplacement) {
  const protectedTemplate = protectEscapedInterpolationTokens(template);
  const spans = findInterpolationTokenSpans(protectedTemplate);

  if (spans.length === 0) {
    return restoreEscapedInterpolationTokens(protectedTemplate);
  }

  let result = '';
  let cursor = 0;

  for (const span of spans) {
    result += protectedTemplate.slice(cursor, span.start);
    result += getReplacement(span.rawInner);
    cursor = span.end;
  }

  result += protectedTemplate.slice(cursor);
  return restoreEscapedInterpolationTokens(result);
}

function findInterpolationTokenSpans(template) {
  const spans = [];
  let searchIndex = 0;

  while (searchIndex < template.length) {
    const openIndex = template.indexOf('{{', searchIndex);
    if (openIndex === -1) {
      break;
    }

    const closeIndex = template.indexOf('}}', openIndex + 2);
    if (closeIndex === -1) {
      break;
    }

    const nestedOpenIndex = template.indexOf('{{', openIndex + 2);
    if (nestedOpenIndex !== -1 && nestedOpenIndex < closeIndex) {
      searchIndex = nestedOpenIndex;
      continue;
    }

    spans.push({
      end: closeIndex + 2,
      rawInner: template.slice(openIndex + 2, closeIndex),
      start: openIndex,
    });
    searchIndex = closeIndex + 2;
  }

  return spans;
}

function protectEscapedInterpolationTokens(template) {
  return template.replace(/\{\{\{([^}]+?)\}\}\}/g, (_match, expression) => `\\{\\{${expression}\\}\\}`);
}

function restoreEscapedInterpolationTokens(template) {
  return template.replace(/\\\{\\\{([^}]+?)\\\}\\\}/g, (_match, expression) => `{{${expression}}}`);
}

function resolveExpressionToString(source, expression) {
  const value = resolveExpressionRawValue(source, expression);
  if (value === undefined) {
    return undefined;
  }

  if (value !== null && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object Object]';
    }
  }

  return String(value);
}

function resolveExpressionRawValue(source, expression) {
  if (!source) {
    return undefined;
  }

  const trimmed = expression.trim();
  const match = trimmed.match(/^([^[.\s]+)\s*(.*)$/);
  const key = match?.[1] ?? trimmed;
  const rawPath = match?.[2] ?? '';
  const topLevelValue = getRecordValue(source, key);
  if (topLevelValue === undefined) {
    return undefined;
  }

  let value = unwrapPotentialDataValue(topLevelValue);
  const path = rawPath.trim().replace(/\s*(\.|\[|\])\s*/g, '$1');

  if (path) {
    value = getByPath(value, path);
    value = unwrapPotentialDataValue(value);
  }

  return value;
}

function getByPath(value, path) {
  let current = value;
  const matcher = /(?:\.?([^.[\]]+))|\[(?:"([^"]+)"|'([^']+)'|([^\]]+))\]/g;
  let match;

  while ((match = matcher.exec(path)) !== null) {
    const key = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (current == null) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function applyProcessing(value, processingChain) {
  return processingChain
    .split('|')
    .map((instruction) => instruction.trim())
    .filter(Boolean)
    .reduce((result, instruction) => {
      const [name, parameter] = instruction.split(/\s+/);
      const numberParameter = parameter ? Number.parseInt(parameter, 10) : undefined;
      const parameterOrDefault = (defaultValue) => (numberParameter === undefined ? defaultValue : numberParameter);

      switch (name) {
        case 'indent':
          return result
            .split('\n')
            .map((line) => `${' '.repeat(parameterOrDefault(0))}${line}`)
            .join('\n');
        case 'quote':
          return result
            .split('\n')
            .map((line) => `${'> '.repeat(parameterOrDefault(1))}${line}`)
            .join('\n');
        case 'uppercase':
          return result.toUpperCase();
        case 'lowercase':
          return result.toLowerCase();
        case 'trim':
          return result.trim();
        case 'truncate':
          return result.length <= parameterOrDefault(50) ? result : `${result.slice(0, parameterOrDefault(50))}...`;
        case 'list':
          return result
            .split('\n')
            .map((line) => `${'  '.repeat(parameterOrDefault(1) - 1)}- ${line}`)
            .join('\n');
        case 'sort':
          return result.split('\n').sort().join('\n');
        case 'dedent':
          return dedent(result);
        case 'wrap':
          return wrapText(result, parameterOrDefault(80));
        default:
          return result;
      }
    }, value);
}

function wrapText(input, width) {
  const lines = [];
  let currentLine = '';

  for (const word of input.split(/\s+/)) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += `${currentLine ? ' ' : ''}${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

function dedent(value) {
  const lines = value
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n');
  const indentation = lines
    .filter((line) => line.trim().length > 0)
    .reduce((minimum, line) => Math.min(minimum, line.match(/^ */)?.[0].length ?? 0), Number.POSITIVE_INFINITY);

  if (!Number.isFinite(indentation) || indentation === 0) {
    return lines.join('\n');
  }

  return lines.map((line) => line.slice(indentation)).join('\n');
}

function handleEscapeCharacters(input) {
  return input
    .replace(/([^\\]|^)\\n/g, '$1\n')
    .replace(/([^\\]|^)\\t/g, '$1\t')
    .replace(/([^\\]|^)\\r/g, '$1\r')
    .replace(/([^\\]|^)\\f/g, '$1\f')
    .replace(/([^\\]|^)\\b/g, '$1\b')
    .replace(/([^\\]|^)\\v/g, '$1\v');
}

function coerceDataValue(value, type) {
  const dataValue = isDataValue(value) ? value : inferDataValue(value);

  switch (type) {
    case 'any':
      return dataValue.value;
    case 'string':
      return coerceToString(dataValue);
    case 'number':
      return coerceToNumber(dataValue);
    case 'boolean':
      return coerceToBoolean(dataValue);
    default:
      return dataValue.value;
  }
}

function coerceToString(dataValue) {
  if (!dataValue) {
    return '';
  }

  if (isArrayDataValue(dataValue)) {
    const scalarType = dataValue.type.endsWith('[]') ? dataValue.type.slice(0, -2) : 'any';
    return dataValue.value.map((value) => coerceDataValue({ type: scalarType, value }, 'string')).join('\n');
  }

  if (dataValue.type === 'string') {
    return dataValue.value;
  }

  if (dataValue.type === 'boolean' || dataValue.type === 'number') {
    return dataValue.value.toString();
  }

  if (dataValue.value == null) {
    return undefined;
  }

  if (typeof dataValue.value === 'object') {
    try {
      return JSON.stringify(dataValue.value);
    } catch {
      return '[object Object]';
    }
  }

  return String(dataValue.value);
}

function coerceToNumber(dataValue) {
  if (!dataValue || dataValue.value == null || isArrayDataValue(dataValue)) {
    return undefined;
  }

  if (dataValue.type === 'number') {
    return dataValue.value;
  }

  if (dataValue.type === 'boolean') {
    return dataValue.value ? 1 : 0;
  }

  if (dataValue.type === 'string') {
    return Number.parseFloat(dataValue.value);
  }

  if (dataValue.type === 'any' || dataValue.type === 'object') {
    return coerceToNumber(inferDataValue(dataValue.value));
  }

  return undefined;
}

function coerceToBoolean(dataValue) {
  if (!dataValue || !dataValue.value) {
    return false;
  }

  if (isArrayDataValue(dataValue)) {
    const scalarType = dataValue.type.endsWith('[]') ? dataValue.type.slice(0, -2) : 'any';
    return dataValue.value.every((value) => coerceDataValue({ type: scalarType, value }, 'boolean'));
  }

  if (dataValue.type === 'string') {
    return dataValue.value.length > 0 && dataValue.value !== 'false';
  }

  if (dataValue.type === 'boolean') {
    return dataValue.value;
  }

  if (dataValue.type === 'number') {
    return dataValue.value !== 0;
  }

  return Boolean(dataValue.value);
}

function inferDataValue(value) {
  if (value === undefined) {
    return { type: 'any', value: undefined };
  }

  if (value === null) {
    return { type: 'any', value: null };
  }

  if (typeof value === 'string') {
    return { type: 'string', value };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }

  if (typeof value === 'number') {
    return { type: 'number', value };
  }

  if (Array.isArray(value)) {
    return {
      type: value.length === 0 ? 'any[]' : `${inferDataValue(value[0]).type}[]`,
      value,
    };
  }

  return { type: 'object', value };
}

function getDefaultValue(type) {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      return {};
    case 'any':
    default:
      return undefined;
  }
}

function isArrayDataValue(value) {
  return isDataValue(value) && (value.type.endsWith('[]') || Array.isArray(value.value));
}

function isDataValue(value) {
  return value != null && typeof value === 'object' && typeof value.type === 'string' && 'value' in value;
}

function unwrapPotentialDataValue(value) {
  return isDataValue(value) ? value.value : value;
}

function createRecord() {
  return Object.create(null);
}

function copyRecordEntries(target, source) {
  if (!source || typeof source !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}

function getRecordValue(record, key) {
  return hasRecordValue(record, key) ? record[key] : undefined;
}

function hasRecordValue(record, key) {
  return record != null && typeof record === 'object' && Object.prototype.hasOwnProperty.call(record, key);
}

function setRecordValue(record, key, value) {
  record[key] = value;
}

function toPlainRecord(record) {
  return Object.fromEntries(Object.entries(record));
}

function isSupportedNodeType(type) {
  return (
    type === 'graphInput' ||
    type === 'text' ||
    type === 'join' ||
    type === 'coalesce' ||
    type === 'destructure' ||
    type === 'extractObjectPath' ||
    type === 'graphOutput' ||
    type === 'subGraph'
  );
}

function validateNode(node, graphId) {
  switch (node.type) {
    case 'destructure':
      if (!Array.isArray(node.paths)) {
        return unsupported(`invalid-node:${graphId}:destructure:${node.id}`);
      }

      for (const selection of node.paths) {
        if (
          !selection ||
          typeof selection !== 'object' ||
          typeof selection.outputId !== 'string' ||
          selection.outputId.length === 0 ||
          typeof selection.path !== 'string' ||
          !parseSimpleJsonPath(selection.path)
        ) {
          return unsupported(`invalid-node:${graphId}:destructure:${node.id}`);
        }
      }

      return { supported: true };
    case 'extractObjectPath':
      if (typeof node.path !== 'string' || !parseSimpleJsonPath(node.path)) {
        return unsupported(`invalid-node:${graphId}:extractObjectPath:${node.id}`);
      }

      return { supported: true };
    default:
      return { supported: true };
  }
}

function getMissingRequiredInput(nodes, connections, graphId) {
  const connectedInputs = new Set(connections.map((connection) => `${connection.inputNodeId}:${connection.inputId}`));
  for (const node of nodes) {
    if (
      (node.type === 'destructure' || node.type === 'extractObjectPath') &&
      !connectedInputs.has(`${node.id}:object`)
    ) {
      return unsupported(`missing-required-input:${graphId}:${node.id}:object`);
    }
  }

  return undefined;
}

function isConnection(connection) {
  return (
    connection != null &&
    typeof connection === 'object' &&
    typeof connection.inputId === 'string' &&
    typeof connection.inputNodeId === 'string' &&
    typeof connection.outputId === 'string' &&
    typeof connection.outputNodeId === 'string'
  );
}

function unsupported(reason) {
  return {
    reason,
    supported: false,
  };
}
