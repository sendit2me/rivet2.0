/**
 * Feature 003 — Presets: headless validation harness (request-body capturing).
 *
 * Proves, end-to-end through the real GraphProcessor + ChatNodeBase:
 *   1. Two Presets on two Chat nodes in ONE graph each expand to the correct Profile
 *      (connection) + Skill (system pre-prompt) — one pick applies BOTH.
 *   2. A default preset (isDefault) auto-applies to a node that selects nothing.
 *   3. The sacred rail: with NO default preset defined, a node that selects nothing falls
 *      back to global — byte-identical to the no-preset path.
 *
 * Mock-based (the build VM can't reach oMLX); real-model preset validation is a follow-up.
 * Chat nodes use `systemPromptMode: 'system'` (clean `system` role) and resolve to o1-family
 * models (non-streaming path) so the mock can reply with plain JSON.
 *
 * Run:  yarn workspace @valerypopoff/rivet2-node exec tsx scripts/feature-003-two-presets-harness.ts
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  runGraph,
  globalRivetNodeRegistry,
  type LlmPreset,
  type LlmProfile,
  type LlmSkill,
  type Project,
} from '../src/index.js';

type CapturedRequest = {
  url: string | undefined;
  authorization: string | undefined;
  body: { model?: string; messages?: Array<{ role: string; content: unknown }> };
};

const captured: CapturedRequest[] = [];

function startMockServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      captured.push({
        url: req.url,
        authorization: req.headers['authorization'] as string | undefined,
        body: body ? JSON.parse(body) : {},
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function chatNodeData(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    model: '', // blank -> profile/preset defaultModel
    useModelInput: false,
    temperature: 0.5,
    useTemperatureInput: false,
    top_p: 1,
    useTopPInput: false,
    useTopP: false,
    useUseTopPInput: false,
    maxTokens: 1024,
    useMaxTokensInput: false,
    useStop: false,
    useStopInput: false,
    usePresencePenaltyInput: false,
    useFrequencyPenaltyInput: false,
    cache: false,
    systemPromptMode: 'system',
    ...overrides,
  };
}

/** Text("ping") fans out to one Chat node per spec -> a Graph Output each. */
function buildProject(chatSpecs: Array<{ id: string; data: Record<string, unknown> }>): {
  project: Project;
  graphId: string;
} {
  const textNode = {
    id: 'text-node',
    type: 'text',
    title: 'Text',
    data: { text: 'ping' },
    visualData: { x: 0, y: 0, width: 200 },
  };

  const nodes: unknown[] = [textNode];
  const connections: unknown[] = [];
  let y = 0;
  for (const spec of chatSpecs) {
    const chatId = `chat-${spec.id}`;
    const outId = `out-${spec.id}`;
    nodes.push({ id: chatId, type: 'chat', title: `Chat ${spec.id}`, data: spec.data, visualData: { x: 300, y, width: 200 } });
    nodes.push({
      id: outId,
      type: 'graphOutput',
      title: `Output ${spec.id}`,
      data: { id: spec.id, dataType: 'string' },
      visualData: { x: 600, y, width: 200 },
    });
    connections.push({ outputNodeId: textNode.id, outputId: 'output', inputNodeId: chatId, inputId: 'prompt' });
    connections.push({ outputNodeId: chatId, outputId: 'response', inputNodeId: outId, inputId: 'value' });
    y += 150;
  }

  const graphId = 'harness-graph';
  const project = {
    metadata: { id: 'harness-project', title: 'Harness', description: '', mainGraphId: graphId },
    graphs: { [graphId]: { metadata: { id: graphId, name: 'Harness Graph', description: '' }, nodes, connections } },
    plugins: [],
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

function byUrlContains(fragment: string): CapturedRequest | undefined {
  return captured.find((r) => (r.url ?? '').includes(fragment));
}
function systemContents(req: CapturedRequest): unknown[] {
  return (req.body.messages ?? []).filter((m) => m.role === 'system').map((m) => m.content);
}

async function main(): Promise<void> {
  const server = await startMockServer();
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const profiles: LlmProfile[] = [
    { id: 'p-qwen', name: 'Qwen', endpoint: `${base}/qwen/v1/chat/completions`, apiKey: 'key-qwen', defaultModel: 'o1-mini' },
    { id: 'p-opus', name: 'Opus', endpoint: `${base}/opus/v1/chat/completions`, apiKey: 'key-opus', defaultModel: 'o1-preview' },
  ];
  const skills: LlmSkill[] = [
    { id: 'developer', name: 'Developer', systemPrompt: 'You are a developer.' },
    { id: 'reviewer', name: 'Reviewer', systemPrompt: 'You are a reviewer.' },
  ];
  const presets: LlmPreset[] = [
    { id: 'qwen-developer', name: 'local-Qwen-developer', profileId: 'p-qwen', skillId: 'developer' },
    { id: 'opus-reviewer', name: 'opus-reviewer', profileId: 'p-opus', skillId: 'reviewer' },
  ];

  try {
    // --- Two presets on two nodes in one graph ---
    captured.length = 0;
    {
      const { project, graphId } = buildProject([
        { id: 'dev', data: chatNodeData({ llmPresetId: 'qwen-developer' }) },
        { id: 'rev', data: chatNodeData({ llmPresetId: 'opus-reviewer' }) },
      ]);
      await runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry, llmProfiles: profiles, llmSkills: skills, llmPresets: presets });
    }
    console.log('\n[Graph] two presets on two nodes:');
    const dev = byUrlContains('/qwen')!;
    const rev = byUrlContains('/opus')!;
    assert(captured.length === 2, `both nodes fired (got ${captured.length} requests)`);
    assert(!!dev && !!rev, 'each preset routed to its own endpoint');
    console.log("  'qwen-developer' preset:");
    assert(dev.authorization === 'Bearer key-qwen', `  applied the qwen profile key (got ${dev?.authorization})`);
    assert(dev.body.model === 'o1-mini', `  applied the qwen defaultModel (got ${dev?.body.model})`);
    assert(systemContents(dev).includes('You are a developer.'), '  applied the developer skill prompt');
    console.log("  'opus-reviewer' preset:");
    assert(rev.authorization === 'Bearer key-opus', `  applied the opus profile key (got ${rev?.authorization})`);
    assert(rev.body.model === 'o1-preview', `  applied the opus defaultModel (got ${rev?.body.model})`);
    assert(systemContents(rev).includes('You are a reviewer.'), '  applied the reviewer skill prompt');
    console.log('\n[Cross-check] one preset pick applied BOTH a connection and a skill, divergently:');
    assert(dev.url !== rev.url && dev.authorization !== rev.authorization, '  connections diverge');
    assert(
      JSON.stringify(systemContents(dev)) !== JSON.stringify(systemContents(rev)),
      '  system pre-prompts diverge',
    );

    // --- Default preset auto-applies to a node that selects nothing ---
    captured.length = 0;
    {
      const defaultPresets: LlmPreset[] = [{ ...presets[0]!, isDefault: true }, presets[1]!];
      const { project, graphId } = buildProject([{ id: 'none', data: chatNodeData({}) }]);
      await runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry, llmProfiles: profiles, llmSkills: skills, llmPresets: defaultPresets });
    }
    console.log('\n[Default] node selects nothing + a default preset exists:');
    const def = captured.at(-1)!;
    assert((def.url ?? '').includes('/qwen'), `  inherited the default preset connection (got ${def.url})`);
    assert(systemContents(def).includes('You are a developer.'), '  inherited the default preset skill prompt');

    // --- Regression: no default preset defined -> global (byte-identical rail) ---
    captured.length = 0;
    {
      const { project, graphId } = buildProject([{ id: 'none', data: chatNodeData({ model: 'o1-mini' }) }]);
      await runGraph(project, {
        graph: graphId,
        registry: globalRivetNodeRegistry,
        llmProfiles: profiles,
        llmSkills: skills,
        llmPresets: presets, // none flagged isDefault
        openAiEndpoint: `${base}/global/v1/chat/completions`,
        openAiKey: 'key-GLOBAL',
      });
    }
    console.log('\n[Regression] node selects nothing + NO default preset:');
    const none = captured.at(-1)!;
    assert((none.url ?? '').includes('/global'), `  fell back to global (got ${none.url})`);
    assert(none.authorization === 'Bearer key-GLOBAL', `  used the global key (got ${none.authorization})`);
    assert(systemContents(none).length === 0, '  injected no system message');
  } finally {
    server.close();
  }

  if (failures > 0) {
    console.error(`\nHARNESS FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nHARNESS PASSED: one preset pick applies both connection + skill; default opt-in works; no-default is byte-identical.');
}

await main();
