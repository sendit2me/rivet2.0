/**
 * Feature 008b — chat-v2 model-config + extraBody escape hatch: LIVE oMLX verification.
 *
 * The end-to-end proof that the whole 008 chain works against the real model: a project-embedded
 * modelConfig (a custom Profile at oMLX + a Skill whose base.extraBody carries the thinking toggle +
 * a Preset bundling them) drives an `llmChatV2` node selected by `llmPresetId`, through the real
 * GraphProcessor → 006 assembleModelConfig → the 008 pre-pass → the untouched runtime → the pipeline →
 * oMLX. Headless (no browser, so no CORS).
 *
 * Two runs assert BOTH the wire and the behaviour:
 *   - enable_thinking:false → the request body carries chat_template_kwargs.enable_thinking === false,
 *     AND the node's `reasoning` output is empty (no thinking) while `response` is non-empty.
 *   - enable_thinking:true  → the body carries …:true, AND `reasoning` comes back non-empty.
 *
 * Body capture: we wrap globalThis.fetch (the @ai-sdk/openai-compatible custom provider uses the SDK
 * global fetch — createChatV2Model passes no custom fetch) to record the JSON body before forwarding.
 *
 * Env (defaults target the standard VM → Mac-host oMLX):
 *   OMLX_HOST   default host.lima.internal
 *   OMLX_PORT   default 9090
 *   OMLX_MODEL  a Qwen3-family id that honours chat_template_kwargs (default Qwen3.6-35B-A3B-nvfp4)
 *   OMLX_API_KEY  any non-empty value (default not-needed)
 *   OMLX_PROMPT   the test prompt
 *   OMLX_MAX_TOKENS default 2048 (reasoning models need room to think AND answer)
 *
 * Run:
 *   OMLX_HOST=host.lima.internal OMLX_PORT=9090 OMLX_MODEL=Qwen3.6-35B-A3B-nvfp4 \
 *   yarn workspace @valerypopoff/rivet2-node exec tsx scripts/feature-008-chatv2-omlx-verify.ts
 */
import {
  runGraph,
  globalRivetNodeRegistry,
  type LlmPreset,
  type LlmProfile,
  type LlmSkill,
  type ModelConfig,
  type Project,
} from '../src/index.js';

const HOST = process.env.OMLX_HOST ?? 'host.lima.internal';
const PORT = process.env.OMLX_PORT ?? '9090';
const MODEL = process.env.OMLX_MODEL ?? 'Qwen3.6-35B-A3B-nvfp4';
const API_KEY = process.env.OMLX_API_KEY ?? 'not-needed';
const MAX_TOKENS = Number(process.env.OMLX_MAX_TOKENS ?? 2048);
const PROMPT = process.env.OMLX_PROMPT ?? 'In one short sentence: why does a stone arch stand up?';
const BASE_URL = `http://${HOST}:${PORT}/v1`;

// The custom provider reads its key from this env var (the node-data default name); set it so the
// key resolution does not throw when the server needs no real key.
process.env.CUSTOM_PROVIDER_API_KEY = process.env.CUSTOM_PROVIDER_API_KEY ?? API_KEY;

// --- Body capture: wrap the global fetch the SDK uses for the custom provider -----------------
type CapturedBody = { url: string; body: Record<string, unknown> };
const captured: CapturedBody[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (init?.body && typeof init.body === 'string' && url.includes('/chat/completions')) {
    try {
      captured.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    } catch {
      /* non-JSON body — ignore */
    }
  }
  return realFetch(input as Request | string | URL, init);
}) as typeof fetch;

// --- The 008a-authored config: custom Profile @ oMLX + Skill(base.extraBody) + Preset ---------
function buildModelConfig(enableThinking: boolean): ModelConfig {
  const profile: LlmProfile = {
    id: 'omlx',
    name: 'oMLX (local)',
    provider: 'custom',
    customProviderBaseURL: BASE_URL,
    defaultModel: MODEL,
  };
  const skill: LlmSkill = {
    id: 'thinking-toggle',
    name: enableThinking ? 'Thinking on' : 'Thinking off',
    base: { extraBody: { chat_template_kwargs: { enable_thinking: enableThinking } } },
  };
  const preset: LlmPreset = { id: 'coder', name: 'Coder (oMLX)', profileId: 'omlx', skillId: 'thinking-toggle' };
  return { profiles: [profile], skills: [skill], presets: [preset] };
}

function buildProject(enableThinking: boolean): { project: Project; graphId: string } {
  const text = { id: 'prompt', type: 'text', title: 'Prompt', data: { text: PROMPT }, visualData: { x: 0, y: 0, width: 200 } };

  // The node selects only the Preset; its own provider stays the default 'openai' — the pre-pass must
  // flip it to 'custom' from the Profile (proving Profile-owned provider live). outputReasoning on so
  // we can read the reasoning delta. Default node data comes from the registry (no need to expose the
  // factory): createDynamic('llmChatV2') yields a node with createLLMChatV2NodeData() defaults.
  const chatBase = globalRivetNodeRegistry.createDynamic('llmChatV2');
  const chat = {
    ...chatBase,
    id: 'chat',
    title: 'LLM Chat',
    data: { ...chatBase.data, llmPresetId: 'coder', outputReasoning: true, maxTokens: MAX_TOKENS },
    visualData: { x: 300, y: 0, width: 220 },
  };
  const outResponse = {
    id: 'out-response',
    type: 'graphOutput',
    title: 'Response',
    data: { id: 'response', dataType: 'string' },
    visualData: { x: 650, y: 0, width: 200 },
  };
  const outReasoning = {
    id: 'out-reasoning',
    type: 'graphOutput',
    title: 'Reasoning',
    data: { id: 'reasoning', dataType: 'string' },
    visualData: { x: 650, y: 200, width: 200 },
  };

  const graphId = 'verify-graph';
  const graph = {
    metadata: { id: graphId, name: 'Verify Graph', description: '' },
    nodes: [text, chat, outResponse, outReasoning],
    connections: [
      { outputNodeId: text.id, outputId: 'output', inputNodeId: chat.id, inputId: 'prompt' },
      { outputNodeId: chat.id, outputId: 'response', inputNodeId: outResponse.id, inputId: 'value' },
      { outputNodeId: chat.id, outputId: 'reasoning', inputNodeId: outReasoning.id, inputId: 'value' },
    ],
  };

  const project = {
    metadata: { id: 'verify-project', title: 'Verify', description: '', mainGraphId: graphId },
    graphs: { [graphId]: graph },
    plugins: [],
    modelConfig: buildModelConfig(enableThinking),
  } as unknown as Project;

  return { project, graphId };
}

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failures++;
  }
}

function reasoningText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('');
  return '';
}

async function runOnce(enableThinking: boolean): Promise<void> {
  captured.length = 0;
  const { project, graphId } = buildProject(enableThinking);
  const label = enableThinking ? 'enable_thinking: TRUE' : 'enable_thinking: FALSE';
  console.log(`\n[Run] ${label} — ${BASE_URL} model=${MODEL}`);

  const outputs = await runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry });

  // (1) THE WIRE — chat_template_kwargs.enable_thinking landed in the request body.
  const body = captured.find((c) => 'chat_template_kwargs' in c.body)?.body;
  const ctk = body?.['chat_template_kwargs'] as { enable_thinking?: boolean } | undefined;
  assert(!!body, 'a request body carrying chat_template_kwargs reached oMLX');
  assert(ctk?.enable_thinking === enableThinking, `body chat_template_kwargs.enable_thinking === ${enableThinking} (got ${ctk?.enable_thinking})`);
  assert((body?.['model'] as string) === MODEL, `body model is the profile's custom model '${MODEL}' (got ${body?.['model']})`);

  // (2) THE BEHAVIOUR — reasoning follows the toggle; response always present.
  const response = reasoningText(outputs['response']?.value);
  const reasoning = reasoningText(outputs['reasoning']?.value);
  console.log(`     response (${response.length} chars): ${response.slice(0, 120).replace(/\n/g, ' ')}`);
  console.log(`     reasoning (${reasoning.length} chars): ${reasoning.slice(0, 120).replace(/\n/g, ' ')}`);
  assert(response.trim().length > 0, 'response is non-empty');
  if (enableThinking) {
    assert(reasoning.trim().length > 0, 'reasoning is non-empty when thinking is ON');
  } else {
    assert(reasoning.trim().length === 0, 'reasoning is empty when thinking is OFF');
  }
}

async function main(): Promise<void> {
  console.log(`Feature 008b — chat-v2 + extraBody escape hatch, live against oMLX (${BASE_URL}).`);
  await runOnce(false);
  await runOnce(true);

  if (failures > 0) {
    console.error(`\nVERIFY FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log(
    '\nVERIFY PASSED: the authored Preset resolved through the full headless chain; the custom-provider '
      + 'extraBody escape hatch put chat_template_kwargs.enable_thinking in the request body, and the '
      + 'reasoning output followed the toggle.',
  );
}

await main();
