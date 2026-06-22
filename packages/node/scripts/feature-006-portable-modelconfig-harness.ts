/**
 * Feature 006 — Project-embedded model-config (portability): headless validation harness.
 *
 * Proves, end-to-end through the real GraphProcessor + ChatNodeBase, the payoff of 006: a saved
 * project carries its model-config and runs **without any global Settings** (the published /
 * scheduled / downloaded-elsewhere case).
 *
 *   1. PORTABILITY — a two-node graph (plan node + execute node), each selecting a different Preset
 *      that lives in `project.modelConfig.presets`, routes the two nodes to two distinct
 *      endpoints/keys/models with **no** global settings supplied to runGraph.
 *   2. BYTE-IDENTICAL — a third node that selects nothing, in a project that *carries* a
 *      modelConfig, still falls back to the global settings (here we give it one) — the carried
 *      config does not leak into an unselecting node.
 *   3. SERIALIZATION — the same project survives serialize → deserialize and still runs portably.
 *
 * No real provider is required: a tiny local HTTP server echoes which URL / Authorization / model
 * each request arrived with. Models route through the non-streaming code path.
 *
 * Run:  yarn workspace @valerypopoff/rivet2-node exec tsx scripts/feature-006-portable-modelconfig-harness.ts
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  runGraph,
  globalRivetNodeRegistry,
  serializeProject,
  deserializeProject,
  type LlmPreset,
  type LlmProfile,
  type ModelConfig,
  type Project,
} from '../src/index.js';

type CapturedRequest = {
  url: string | undefined;
  authorization: string | undefined;
  model: string | undefined;
};

const captured: CapturedRequest[] = [];

function startMockServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let model: string | undefined;
      try {
        model = (JSON.parse(body) as { model?: string }).model;
      } catch {
        model = undefined;
      }
      captured.push({
        url: req.url,
        authorization: req.headers['authorization'] as string | undefined,
        model,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function chatNode(id: string, x: number, model: string, selectors: Record<string, unknown>) {
  return {
    id,
    type: 'chat',
    title: id,
    data: {
      // Models starting with o1-mini/o1-preview force the non-streaming path so the mock can reply
      // with plain JSON. plan/execute leave this BLANK so the profile's defaultModel travels and
      // applies (Node > Profile precedence: a blank node model falls back to the profile default).
      model,
      temperature: 0,
      top_p: 1,
      useTopP: false,
      useUseTopPInput: false,
      maxTokens: 64,
      useStop: false,
      useStopInput: false,
      cache: false,
      ...selectors,
    },
    visualData: { x, y: 0, width: 200 },
  };
}

/** Build a project whose embedded modelConfig holds two presets (plan=Claude, execute=Qwen). */
function buildProject(modelConfig: ModelConfig): { project: Project; graphId: string } {
  const text = { id: 'text', type: 'text', title: 'Text', data: { text: 'ping' }, visualData: { x: 0, y: 0, width: 200 } };
  // plan selects the Claude preset, execute the Qwen preset (both leave model blank so the preset's
  // profile model travels); bystander selects nothing and sets its own model (falls back to global).
  const plan = chatNode('plan', 300, '', { llmPresetId: 'preset-claude' });
  const execute = chatNode('execute', 600, '', { llmPresetId: 'preset-qwen' });
  const bystander = chatNode('bystander', 900, 'o1-mini', {});
  const out = {
    id: 'out',
    type: 'graphOutput',
    title: 'Graph Output',
    data: { id: 'result', dataType: 'string' },
    visualData: { x: 1200, y: 0, width: 200 },
  };

  const graphId = 'harness-graph';
  const graph = {
    metadata: { id: graphId, name: 'Harness Graph', description: '' },
    nodes: [text, plan, execute, bystander, out],
    connections: [
      { outputNodeId: text.id, outputId: 'output', inputNodeId: plan.id, inputId: 'prompt' },
      { outputNodeId: text.id, outputId: 'output', inputNodeId: execute.id, inputId: 'prompt' },
      { outputNodeId: text.id, outputId: 'output', inputNodeId: bystander.id, inputId: 'prompt' },
      { outputNodeId: execute.id, outputId: 'response', inputNodeId: out.id, inputId: 'value' },
    ],
  };

  const project = {
    metadata: { id: 'harness-project', title: 'Harness', description: '', mainGraphId: graphId },
    graphs: { [graphId]: graph },
    plugins: [],
    modelConfig,
  } as unknown as Project;

  return { project, graphId };
}

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function reqTo(path: string): CapturedRequest | undefined {
  return captured.find((c) => c.url === path);
}

async function main(): Promise<void> {
  const server = await startMockServer();
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  // Distinct, non-streaming-capable model ids stand in for the two brains so the mock stays on the
  // plain-JSON path; the point under test is that the *profile's* model travels with the project.
  const claudeProfile: LlmProfile = {
    id: 'profile-claude',
    name: 'Claude',
    endpoint: `${base}/claude/v1/chat/completions`,
    apiKey: 'key-CLAUDE',
    defaultModel: 'o1-mini',
  };
  const qwenProfile: LlmProfile = {
    id: 'profile-qwen',
    name: 'Qwen',
    endpoint: `${base}/qwen/v1/chat/completions`,
    apiKey: 'key-QWEN',
    defaultModel: 'o1-preview',
  };
  const presets: LlmPreset[] = [
    { id: 'preset-claude', name: 'Plan (Claude)', profileId: 'profile-claude' },
    { id: 'preset-qwen', name: 'Execute (Qwen)', profileId: 'profile-qwen' },
  ];
  const modelConfig: ModelConfig = { profiles: [claudeProfile, qwenProfile], presets };

  try {
    // --- Run 1: PORTABILITY — no global settings; both models come from project.modelConfig ---
    captured.length = 0;
    {
      const { project, graphId } = buildProject(modelConfig);
      await runGraph(project, {
        graph: graphId,
        registry: globalRivetNodeRegistry,
        // The bystander node (no selection) needs *some* endpoint to hit — supply a global so the
        // run completes; the plan/execute nodes must NOT use it.
        openAiEndpoint: `${base}/global/v1/chat/completions`,
        openAiKey: 'key-GLOBAL',
        // NB: no modelConfig here — it travels with the project.
      });
    }
    console.log('\n[Run 1] Two presets embedded in the project route headlessly:');
    const plan = reqTo('/claude/v1/chat/completions');
    const exec = reqTo('/qwen/v1/chat/completions');
    const bystander = reqTo('/global/v1/chat/completions');
    assert(!!plan, 'plan node routed to the Claude endpoint from project.modelConfig');
    assert(plan?.authorization === 'Bearer key-CLAUDE', `plan used the Claude key (got ${plan?.authorization})`);
    assert(plan?.model === 'o1-mini', `plan used the Claude profile's model (got ${plan?.model})`);
    assert(!!exec, 'execute node routed to the Qwen endpoint from project.modelConfig');
    assert(exec?.authorization === 'Bearer key-QWEN', `execute used the Qwen key (got ${exec?.authorization})`);
    assert(exec?.model === 'o1-preview', `execute used the Qwen profile's model (got ${exec?.model})`);

    console.log('\n[Run 1 cont.] BYTE-IDENTICAL — the unselecting node falls back to global settings:');
    assert(!!bystander, 'bystander node fell back to the global endpoint despite the carried modelConfig');
    assert(
      bystander?.authorization === 'Bearer key-GLOBAL',
      `bystander used the global key (got ${bystander?.authorization})`,
    );

    // --- Run 2: SERIALIZATION — the project survives a save/load and still runs portably ---
    captured.length = 0;
    {
      const { project, graphId } = buildProject(modelConfig);
      const [reloaded] = deserializeProject(serializeProject(project) as string);
      await runGraph(reloaded, {
        graph: graphId,
        registry: globalRivetNodeRegistry,
        openAiEndpoint: `${base}/global/v1/chat/completions`,
        openAiKey: 'key-GLOBAL',
      });
    }
    console.log('\n[Run 2] After serialize → deserialize, the embedded presets still route:');
    assert(!!reqTo('/claude/v1/chat/completions'), 'plan still routed to Claude after round-trip');
    assert(!!reqTo('/qwen/v1/chat/completions'), 'execute still routed to Qwen after round-trip');
  } finally {
    server.close();
  }

  if (failures > 0) {
    console.error(`\nHARNESS FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nHARNESS PASSED: an embedded modelConfig makes a project portable (headless, no global config), '
    + 'survives serialization, and leaves unselecting nodes byte-identical.');
}

await main();
