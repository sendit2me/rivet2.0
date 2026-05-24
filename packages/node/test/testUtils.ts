import { loadProjectFromFile, type ProcessContext, type Project } from '../src/index.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const localNativeRuntimeModuleUrl = new URL('../../../native-runtime/index.js', import.meta.url).href;

export async function loadTestGraphs(): Promise<Project> {
  return loadProjectFromFile(join(testDir, './test-graphs.rivet-project'));
}

export function testProcessContext(): ProcessContext {
  return {
    settings: {
      openAiKey: process.env.OPENAI_API_KEY,
      openAiOrganization: process.env.OPENAI_ORG_ID,
      openAiEndpoint: process.env.OPENAI_API_ENDPOINT,
    },
  };
}

export async function withLocalNativeFastAdapterEnv<T>(run: () => Promise<T>): Promise<T> {
  const previousNativeRuntimeModule = process.env.RIVET_NATIVE_RUNTIME_MODULE;
  const previousNativeRuntimeBackend = process.env.RIVET_NATIVE_RUNTIME_BACKEND;
  process.env.RIVET_NATIVE_RUNTIME_MODULE = localNativeRuntimeModuleUrl;
  process.env.RIVET_NATIVE_RUNTIME_BACKEND = 'js';

  try {
    return await run();
  } finally {
    if (previousNativeRuntimeModule == null) {
      delete process.env.RIVET_NATIVE_RUNTIME_MODULE;
    } else {
      process.env.RIVET_NATIVE_RUNTIME_MODULE = previousNativeRuntimeModule;
    }

    if (previousNativeRuntimeBackend == null) {
      delete process.env.RIVET_NATIVE_RUNTIME_BACKEND;
    } else {
      process.env.RIVET_NATIVE_RUNTIME_BACKEND = previousNativeRuntimeBackend;
    }
  }
}
