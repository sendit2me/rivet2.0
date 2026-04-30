import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as process from 'node:process';

const DEFAULT_CODE_RUNNER_REQUIRE_ANCHOR = '__rivet_node_code_runner__.cjs';

type CodeRunnerRequireEnv = Record<string, string | undefined>;

export function getCodeRunnerRequireRoot(
  env: CodeRunnerRequireEnv = process.env as CodeRunnerRequireEnv,
  cwd = process.cwd(),
) {
  const configuredRoot = env.RIVET_CODE_RUNNER_REQUIRE_ROOT?.trim();
  return configuredRoot || cwd;
}

export function getCodeRunnerRequireAnchorPath(
  env: CodeRunnerRequireEnv = process.env as CodeRunnerRequireEnv,
  cwd = process.cwd(),
) {
  const configuredAnchor = env.RIVET_CODE_RUNNER_REQUIRE_ANCHOR?.trim();
  if (configuredAnchor) {
    return configuredAnchor;
  }

  return join(getCodeRunnerRequireRoot(env, cwd), DEFAULT_CODE_RUNNER_REQUIRE_ANCHOR);
}

export function createCodeRunnerRequire(
  env: CodeRunnerRequireEnv = process.env as CodeRunnerRequireEnv,
  cwd = process.cwd(),
) {
  return createRequire(getCodeRunnerRequireAnchorPath(env, cwd));
}
