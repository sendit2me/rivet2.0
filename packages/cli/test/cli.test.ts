import assert from 'node:assert/strict';
import test from 'node:test';
import yargs from 'yargs';
import { makeCommand as makeRunCommand } from '../src/commands/run.js';
import { makeCommand as makeServeCommand } from '../src/commands/serve.js';

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
