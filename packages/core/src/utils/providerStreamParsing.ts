import { logRuntimeDebug, summarizeErrorForLog } from './runtimeLogging.js';

export function parseProviderJsonChunk<T>(provider: string, chunk: string): T {
  try {
    return JSON.parse(chunk) as T;
  } catch (error) {
    logRuntimeDebug('Provider stream JSON parse failed', {
      provider,
      chunkLength: chunk.length,
      error: summarizeErrorForLog(error),
    });
    throw error;
  }
}
