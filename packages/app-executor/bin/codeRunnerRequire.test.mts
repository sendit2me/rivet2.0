import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { getCodeRunnerRequireAnchorPath, getCodeRunnerRequireRoot } from './codeRunnerRequire.mjs';

void describe('app-executor codeRunnerRequire', () => {
  void it('matches the public Node code-runner require env contract', () => {
    assert.equal(getCodeRunnerRequireRoot({}, '/workspace/project'), '/workspace/project');
    assert.equal(
      getCodeRunnerRequireAnchorPath({ RIVET_CODE_RUNNER_REQUIRE_ROOT: '/data/runtime-libraries/current' }, '/ignored'),
      join('/data/runtime-libraries/current', '__rivet_node_code_runner__.cjs'),
    );
    assert.equal(
      getCodeRunnerRequireAnchorPath({
        RIVET_CODE_RUNNER_REQUIRE_ANCHOR: '/data/runtime-libraries/current/custom-anchor.cjs',
        RIVET_CODE_RUNNER_REQUIRE_ROOT: '/ignored',
      }),
      '/data/runtime-libraries/current/custom-anchor.cjs',
    );
  });
});
