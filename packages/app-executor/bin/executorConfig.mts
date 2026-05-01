export const DEFAULT_APP_EXECUTOR_HOST = '127.0.0.1';
export const DEFAULT_APP_EXECUTOR_PORT = 21889;

type ExecutorEnv = Record<string, string | undefined>;

export function parseExecutorPortFromArgs(argv: string[], env: ExecutorEnv = process.env as ExecutorEnv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--port' || arg === '-p') {
      return parsePortValue(argv[index + 1]);
    }

    if (arg?.startsWith('--port=')) {
      return parsePortValue(arg.slice('--port='.length));
    }
  }

  if (env.RIVET_EXECUTOR_PORT?.trim()) {
    return parsePortValue(env.RIVET_EXECUTOR_PORT);
  }

  return DEFAULT_APP_EXECUTOR_PORT;
}

export function parseExecutorHostFromArgs(argv: string[], env: ExecutorEnv = process.env as ExecutorEnv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--host') {
      return parseHostValue(argv[index + 1]);
    }

    if (arg?.startsWith('--host=')) {
      return parseHostValue(arg.slice('--host='.length));
    }
  }

  const envHost = env.RIVET_EXECUTOR_HOST?.trim();
  return envHost || DEFAULT_APP_EXECUTOR_HOST;
}

function parsePortValue(value: string | undefined) {
  const parsed = Number(value);
  if (!value || Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port value: ${value ?? '(missing)'}`);
  }
  return parsed;
}

function parseHostValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Invalid host value: ${value ?? '(missing)'}`);
  }
  return trimmed;
}
