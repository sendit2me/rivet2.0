/**
 * Feature 004 — Reasoning + ExtraBody: headless validation harness (request-body capturing).
 *
 * Proves, end-to-end through the real GraphProcessor + ChatNodeBase:
 *   1. A Skill carrying `extraBody:{chat_template_kwargs:{enable_thinking:false}}` puts that nested
 *      object into the request body.
 *   2. A node-level `extraBody` deep-merges over the Skill's (per-key, node wins).
 *   3. `extraBody` cannot override transport: a malicious `model` in extraBody is ignored.
 *   4. `outputReasoning` surfaces the model's reasoning_content on the `reasoning` port.
 *   5. Byte-identical rail: no extraBody anywhere → no `chat_template_kwargs` in the body.
 *
 * Mock-based (no network); the live-oMLX reproduction is feature-004-omlx-repro.ts.
 *
 * Run:  yarn workspace @valerypopoff/rivet2-node exec tsx scripts/feature-004-reasoning-extrabody-harness.ts
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  runGraph,
  globalRivetNodeRegistry,
  type LlmSkill,
  type Project,
} from '../src/index.js';

let lastBody: Record<string, unknown> = {};

function startMockServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      lastBody = body ? JSON.parse(body) : {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Non-streaming response (o1-mini path) carrying reasoning_content.
      res.end(JSON.stringify({ choices: [{ message: { content: 'answer', reasoning_content: 'thinking hard' } }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function buildProject(chatData: Record<string, unknown>): { project: Project; graphId: string } {
  const textNode = { id: 'text', type: 'text', title: 'Text', data: { text: 'ping' }, visualData: { x: 0, y: 0, width: 200 } };
  const chatNode = {
    id: 'chat',
    type: 'chat',
    title: 'Chat',
    data: {
      model: 'o1-mini', // non-streaming path
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
      ...chatData,
    },
    visualData: { x: 300, y: 0, width: 200 },
  };
  const respOut = { id: 'respOut', type: 'graphOutput', title: 'resp', data: { id: 'response', dataType: 'string' }, visualData: { x: 600, y: 0, width: 200 } };
  const reasonOut = { id: 'reasonOut', type: 'graphOutput', title: 'reason', data: { id: 'reasoning', dataType: 'string' }, visualData: { x: 600, y: 150, width: 200 } };
  const graphId = 'g';
  const project = {
    metadata: { id: 'p', title: 'Harness', description: '', mainGraphId: graphId },
    graphs: {
      [graphId]: {
        metadata: { id: graphId, name: 'g', description: '' },
        nodes: [textNode, chatNode, respOut, reasonOut],
        connections: [
          { outputNodeId: 'text', outputId: 'output', inputNodeId: 'chat', inputId: 'prompt' },
          { outputNodeId: 'chat', outputId: 'response', inputNodeId: 'respOut', inputId: 'value' },
          { outputNodeId: 'chat', outputId: 'reasoning', inputNodeId: 'reasonOut', inputId: 'value' },
        ],
      },
    },
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

async function main(): Promise<void> {
  const server = await startMockServer();
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/v1/chat/completions`;
  const terseFast: LlmSkill = {
    id: 'terse-fast',
    name: 'Terse Fast',
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  };

  const run = async (chatData: Record<string, unknown>, skills: LlmSkill[] = []) => {
    const { project, graphId } = buildProject({ endpoint: base, ...chatData });
    return runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry, modelConfig: { skills } });
  };

  try {
    // 1) Skill extraBody disables thinking via the request body
    console.log("\n[1] Skill 'terse-fast' extraBody (chat_template_kwargs.enable_thinking=false):");
    await run({ llmSkillId: 'terse-fast', outputReasoning: true }, [terseFast]);
    assert(
      JSON.stringify((lastBody['chat_template_kwargs'] as Record<string, unknown>) ?? {}) === JSON.stringify({ enable_thinking: false }),
      `body carries the nested extraBody (got ${JSON.stringify(lastBody['chat_template_kwargs'])})`,
    );

    // 2) Node-level extraBody deep-merges over the Skill's (node wins per key)
    console.log('\n[2] Node extraBody deep-merges over the Skill:');
    await run(
      { llmSkillId: 'terse-fast', extraBody: { chat_template_kwargs: { add_generation_prompt: true }, top_k: 5 } },
      [terseFast],
    );
    assert(
      JSON.stringify(lastBody['chat_template_kwargs']) === JSON.stringify({ enable_thinking: false, add_generation_prompt: true }),
      `nested objects combine (got ${JSON.stringify(lastBody['chat_template_kwargs'])})`,
    );
    assert(lastBody['top_k'] === 5, `node added top_k (got ${lastBody['top_k']})`);

    // 3) extraBody cannot override transport (model re-asserted)
    console.log('\n[3] extraBody.model is ignored (transport protected):');
    await run({ extraBody: { model: 'evil-model', temperature: 0.0 } });
    assert(lastBody['model'] === 'o1-mini', `model stayed the node's (got ${lastBody['model']})`);
    assert(lastBody['temperature'] === 0.0, `but a managed param (temperature) was overridden (got ${lastBody['temperature']})`);

    // 4) outputReasoning surfaces reasoning_content
    console.log('\n[4] outputReasoning surfaces the reasoning port:');
    const outWith = await run({ outputReasoning: true });
    assert((outWith['reasoning']?.value as string) === 'thinking hard', `reasoning port carried reasoning_content (got ${JSON.stringify(outWith['reasoning']?.value)})`);

    // 5) Byte-identical rail: no extraBody → no chat_template_kwargs in the body
    console.log('\n[5] Byte-identical rail (no extraBody, outputReasoning off):');
    const outBare = await run({});
    assert(!('chat_template_kwargs' in lastBody), 'no extraBody keys leaked into the body');
    assert(outBare['reasoning'] === undefined, 'no reasoning output when outputReasoning is off');
  } finally {
    server.close();
  }

  if (failures > 0) {
    console.error(`\nHARNESS FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nHARNESS PASSED: extraBody deep-merges into the body (transport protected); reasoning surfaces opt-in; no-set is byte-identical.');
}

await main();
