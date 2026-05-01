import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  DEFAULT_APP_EXECUTOR_HOST,
  DEFAULT_APP_EXECUTOR_PORT,
  parseExecutorHostFromArgs,
  parseExecutorPortFromArgs,
} from './executorConfig.mjs';

void describe('executorConfig', () => {
  void it('uses safe desktop defaults', () => {
    assert.equal(parseExecutorHostFromArgs([], {}), DEFAULT_APP_EXECUTOR_HOST);
    assert.equal(parseExecutorPortFromArgs([], {}), DEFAULT_APP_EXECUTOR_PORT);
  });

  void it('accepts host and port from arguments', () => {
    assert.equal(parseExecutorHostFromArgs(['--host', '0.0.0.0'], {}), '0.0.0.0');
    assert.equal(parseExecutorHostFromArgs(['--host=localhost'], {}), 'localhost');
    assert.equal(parseExecutorPortFromArgs(['--port', '3000']), 3000);
    assert.equal(parseExecutorPortFromArgs(['--port=3001']), 3001);
    assert.equal(parseExecutorPortFromArgs(['-p', '3002']), 3002);
  });

  void it('uses executor environment variables when arguments are not provided', () => {
    assert.equal(
      parseExecutorHostFromArgs([], { RIVET_EXECUTOR_HOST: '0.0.0.0', RIVET_EXECUTOR_PORT: '4000' }),
      '0.0.0.0',
    );
    assert.equal(
      parseExecutorPortFromArgs([], { RIVET_EXECUTOR_HOST: '0.0.0.0', RIVET_EXECUTOR_PORT: '4000' }),
      4000,
    );
  });

  void it('rejects invalid host and port values', () => {
    assert.throws(() => parseExecutorHostFromArgs(['--host'], {}), /Invalid host value/);
    assert.throws(() => parseExecutorPortFromArgs(['--port', '0']), /Invalid port value/);
    assert.throws(() => parseExecutorPortFromArgs(['--port', '70000']), /Invalid port value/);
    assert.throws(() => parseExecutorPortFromArgs(['--port', 'abc']), /Invalid port value/);
    assert.throws(() => parseExecutorPortFromArgs([], { RIVET_EXECUTOR_PORT: 'abc' }), /Invalid port value/);
  });
});
