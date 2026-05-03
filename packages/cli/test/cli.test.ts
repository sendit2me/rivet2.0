import assert from 'node:assert/strict';
import test from 'node:test';
import yargs from 'yargs';
import { parseJsonInputRecord, parseKeyValueInputRecord } from '../src/commandInputs.js';
import { makeCommand as makeRunCommand } from '../src/commands/run.js';
import { buildStreamEventFilter, makeCommand as makeServeCommand } from '../src/commands/serve.js';

test('run command builder registers its default option values', async () => {
  const command = makeRunCommand(yargs([])).exitProcess(false);
  const options = command.getOptions();

  assert.deepEqual(options.default.input, []);
  assert.deepEqual(options.default.context, []);
  assert.equal(options.key.input, true);
  assert.equal(options.key.context, true);
  assert.equal(options.key['include-cost'], true);
  assert.equal(options.key['inputs-stdin'], true);
});

test('serve command exposes its expected defaults', async () => {
  const argv = await makeServeCommand(yargs([]))
    .exitProcess(false)
    .parse();

  assert.equal(argv.port, 3000);
  assert.equal(argv.dev, false);
  assert.equal(argv.allowSpecifyingGraphId, false);
  assert.equal(argv.exposeCost, false);
});

test('parseKeyValueInputRecord keeps empty and equals-containing values', () => {
  assert.deepEqual(parseKeyValueInputRecord(['name=Rivet=2', 'empty='], 'input'), {
    name: 'Rivet=2',
    empty: '',
  });
});

test('parseKeyValueInputRecord rejects entries without a key separator', () => {
  assert.throws(() => parseKeyValueInputRecord(['missing'], 'input'), /Expected key=value/);
  assert.throws(() => parseKeyValueInputRecord(['=value'], 'input'), /Expected key=value/);
});

test('parseJsonInputRecord accepts objects and treats empty request bodies as no inputs', () => {
  assert.deepEqual(parseJsonInputRecord('', 'Request body'), {});
  assert.deepEqual(parseJsonInputRecord('{"input":"value"}', 'Request body'), { input: 'value' });
});

test('parseJsonInputRecord rejects arrays and primitive JSON values', () => {
  assert.throws(() => parseJsonInputRecord('[1,2]', 'Request body'), /must be a JSON object/);
  assert.throws(() => parseJsonInputRecord('"value"', 'Request body'), /must be a JSON object/);
});

test('buildStreamEventFilter filters SSE events when --stream names a node', () => {
  assert.deepEqual(buildStreamEventFilter(undefined), {
    nodeStart: true,
    nodeFinish: true,
    partialOutputs: true,
  });

  assert.deepEqual(buildStreamEventFilter(' Chat Node '), {
    nodeStart: ['Chat Node'],
    nodeFinish: ['Chat Node'],
    partialOutputs: ['Chat Node'],
  });
});
