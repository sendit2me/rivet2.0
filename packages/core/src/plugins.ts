import anthropicPlugin from './plugins/anthropic/index.js';
import autoevalsPlugin from './plugins/autoevals/index.js';
import assemblyAiPlugin from './plugins/assemblyAi/index.js';
import { huggingFacePlugin } from './plugins/huggingface/plugin.js';
import pineconePlugin from './plugins/pinecone/index.js';
// eslint-disable-next-line import/no-cycle -- Gentrace depends on GraphProcessor for local test execution.
import gentracePlugin from './plugins/gentrace/index.js';
export { getGentracePipelines, runGentraceTests, runRemoteGentraceTests } from './plugins/gentrace/plugin.js';
import { openAIPlugin } from './plugins/openai/plugin.js';
import { googlePlugin } from './plugins/google/plugin.js';

export {
  anthropicPlugin,
  autoevalsPlugin,
  assemblyAiPlugin,
  pineconePlugin,
  huggingFacePlugin,
  gentracePlugin,
  googlePlugin,
};

export const plugins = {
  anthropic: anthropicPlugin,
  autoevals: autoevalsPlugin,
  assemblyAi: assemblyAiPlugin,
  pinecone: pineconePlugin,
  huggingFace: huggingFacePlugin,
  gentrace: gentracePlugin,
  openai: openAIPlugin,
  google: googlePlugin,
};
