/**
 * Feature 001 — LLM Profiles: headless validation harness.
 *
 * Proves, end-to-end through the real GraphProcessor + ChatNodeBase, that:
 *   1. Two different LLM Profiles route a Chat node to two distinct endpoints AND credentials.
 *   2. With NO profile selected, resolution falls back byte-faithfully to the global settings
 *      (backward compatibility — the live counterpart to the unit regression snapshot).
 *
 * No real provider is required: a tiny local HTTP server stands in for the OpenAI-compatible
 * API and echoes back which URL / Authorization / custom header each request arrived with.
 * The Chat node uses model `o1-mini`, which routes through the non-streaming code path so the
 * mock only needs to return a plain JSON chat-completion body.
 *
 * Run:  yarn workspace @valerypopoff/rivet2-node exec tsx scripts/feature-001-two-profiles-harness.ts
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { runGraph, globalRivetNodeRegistry, type LlmProfile, type Project } from '../src/index.js';

type CapturedRequest = {
  url: string | undefined;
  authorization: string | undefined;
  organization: string | undefined;
  profileHeader: string | undefined;
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
        organization: req.headers['openai-organization'] as string | undefined,
        profileHeader: req.headers['x-profile'] as string | undefined,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Minimal valid non-streaming OpenAI chat-completion response.
      res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Build a one-Chat-node project: Text("ping") -> Chat -> Graph Output. */
function buildProject(llmProfileId: string | undefined): { project: Project; graphId: string } {
  const textNode = {
    id: 'text-node',
    type: 'text',
    title: 'Text',
    data: { text: 'ping' },
    visualData: { x: 0, y: 0, width: 200 },
  };

  const chatNode = {
    id: 'chat-node',
    type: 'chat',
    title: 'Chat',
    data: {
      // o1-mini forces the non-streaming path so the mock can reply with plain JSON.
      model: 'o1-mini',
      useModelInput: false,
      temperature: 0,
      useTemperatureInput: false,
      top_p: 1,
      useTopPInput: false,
      useTopP: false,
      useUseTopPInput: false,
      maxTokens: 64,
      useMaxTokensInput: false,
      useStop: false,
      useStopInput: false,
      usePresencePenaltyInput: false,
      useFrequencyPenaltyInput: false,
      cache: false,
      // The field under test:
      llmProfileId,
    },
    visualData: { x: 300, y: 0, width: 200 },
  };

  const outputNode = {
    id: 'output-node',
    type: 'graphOutput',
    title: 'Graph Output',
    data: { id: 'result', dataType: 'string' },
    visualData: { x: 600, y: 0, width: 200 },
  };

  const graphId = 'harness-graph';
  const graph = {
    metadata: { id: graphId, name: 'Harness Graph', description: '' },
    nodes: [textNode, chatNode, outputNode],
    connections: [
      { outputNodeId: textNode.id, outputId: 'output', inputNodeId: chatNode.id, inputId: 'prompt' },
      { outputNodeId: chatNode.id, outputId: 'response', inputNodeId: outputNode.id, inputId: 'value' },
    ],
  };

  const project = {
    metadata: { id: 'harness-project', title: 'Harness', description: '', mainGraphId: graphId },
    graphs: { [graphId]: graph },
    plugins: [],
  } as unknown as Project;

  return { project, graphId };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

let failures = 0;

async function main(): Promise<void> {
  const server = await startMockServer();
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const profileA: LlmProfile = {
    id: 'A',
    name: 'Profile A',
    endpoint: `${base}/profileA/v1/chat/completions`,
    apiKey: 'key-A',
    headers: { 'x-profile': 'A' },
  };
  const profileB: LlmProfile = {
    id: 'B',
    name: 'Profile B',
    endpoint: `${base}/profileB/v1/chat/completions`,
    apiKey: 'key-B',
    headers: { 'x-profile': 'B' },
  };
  const llmProfiles = [profileA, profileB];

  try {
    // --- Run 1: profile A ---
    captured.length = 0;
    {
      const { project, graphId } = buildProject('A');
      await runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry, llmProfiles });
    }
    console.log('\n[Run 1] Chat node selects profile A:');
    const reqA = captured.at(-1)!;
    assert(captured.length === 1, 'exactly one upstream request was made');
    assert(reqA.url === '/profileA/v1/chat/completions', `routed to profile A endpoint (got ${reqA.url})`);
    assert(reqA.authorization === 'Bearer key-A', `sent profile A key (got ${reqA.authorization})`);
    assert(reqA.profileHeader === 'A', `sent profile A header (got ${reqA.profileHeader})`);

    // --- Run 2: profile B ---
    captured.length = 0;
    {
      const { project, graphId } = buildProject('B');
      await runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry, llmProfiles });
    }
    console.log('\n[Run 2] Chat node selects profile B:');
    const reqB = captured.at(-1)!;
    assert(reqB.url === '/profileB/v1/chat/completions', `routed to profile B endpoint (got ${reqB.url})`);
    assert(reqB.authorization === 'Bearer key-B', `sent profile B key (got ${reqB.authorization})`);
    assert(reqB.profileHeader === 'B', `sent profile B header (got ${reqB.profileHeader})`);

    // --- Run 3: no profile -> global settings (backward compatibility) ---
    captured.length = 0;
    {
      const { project, graphId } = buildProject(undefined);
      await runGraph(project, {
        graph: graphId,
        registry: globalRivetNodeRegistry,
        llmProfiles,
        openAiEndpoint: `${base}/global/v1/chat/completions`,
        openAiKey: 'key-GLOBAL',
      });
    }
    console.log('\n[Run 3] Chat node selects NO profile -> global settings:');
    const reqG = captured.at(-1)!;
    assert(reqG.url === '/global/v1/chat/completions', `routed to global endpoint (got ${reqG.url})`);
    assert(reqG.authorization === 'Bearer key-GLOBAL', `sent global key (got ${reqG.authorization})`);
    assert(reqG.profileHeader === undefined, 'no profile header leaked into the global path');

    console.log('\n[Cross-check] the two profiles reached DISTINCT endpoints and credentials:');
    assert(reqA.url !== reqB.url, `endpoints differ (${reqA.url} != ${reqB.url})`);
    assert(reqA.authorization !== reqB.authorization, 'credentials differ');
  } finally {
    server.close();
  }

  if (failures > 0) {
    console.error(`\nHARNESS FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nHARNESS PASSED: two profiles route to two endpoints/keys; no-profile falls back to global.');
}

await main();
