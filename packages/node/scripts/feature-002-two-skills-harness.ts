/**
 * Feature 002 — Skills: headless validation harness (request-body capturing).
 *
 * Proves, end-to-end through the real GraphProcessor + ChatNodeBase:
 *   1. Two Skills on ONE Profile diverge — each injects its own system pre-prompt into the
 *      request body for the same input.
 *   2. No-Skill is byte-faithful: no system message is injected.
 * And, since we capture the body, it also closes the two carried-over 001 checks:
 *   3. A Profile's `defaultModel` reaches the request body when the node leaves model blank.
 *   4. An `extends` Profile routes end-to-end (child inherits endpoint/key/defaultModel).
 *
 * A local HTTP server stands in for the OpenAI-compatible API and records each request's URL,
 * Authorization, and parsed JSON body. The Chat node uses `systemPromptMode: 'system'` so the
 * injected pre-prompt appears as a `system` role in the body, and resolves to model `o1-mini`
 * (non-streaming path) so the mock can reply with plain JSON.
 *
 * Run:  yarn workspace @valerypopoff/rivet2-node exec tsx scripts/feature-002-two-skills-harness.ts
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  runGraph,
  globalRivetNodeRegistry,
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

/** Text("ping") -> Chat(model blank -> profile.defaultModel) -> Graph Output. */
function buildProject(llmProfileId: string, llmSkillId: string | undefined): { project: Project; graphId: string } {
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
      model: '', // blank -> falls back to the profile's defaultModel
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
      systemPromptMode: 'system', // inject the skill prompt as a `system` role for a clean assert
      llmProfileId,
      llmSkillId,
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

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function systemContents(req: CapturedRequest): unknown[] {
  return (req.body.messages ?? []).filter((m) => m.role === 'system').map((m) => m.content);
}

async function main(): Promise<void> {
  const server = await startMockServer();
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  // One base profile (with defaultModel) and a child that extends it (inherits everything).
  const baseProfile: LlmProfile = {
    id: 'p-base',
    name: 'Base',
    endpoint: `${base}/base/v1/chat/completions`,
    apiKey: 'key-base',
    defaultModel: 'o1-mini',
  };
  const childProfile: LlmProfile = { id: 'p-child', name: 'Child', extends: 'p-base' };
  const llmProfiles = [baseProfile, childProfile];

  const terse: LlmSkill = { id: 'terse', name: 'Terse', systemPrompt: 'Be terse.' };
  const verbose: LlmSkill = { id: 'verbose', name: 'Verbose', systemPrompt: 'Be verbose and detailed.' };
  const llmSkills = [terse, verbose];

  const run = async (profileId: string, skillId: string | undefined) => {
    const { project, graphId } = buildProject(profileId, skillId);
    await runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry, llmProfiles, llmSkills });
    return captured.at(-1)!;
  };

  try {
    // --- Run A: base profile + 'terse' skill ---
    captured.length = 0;
    const reqA = await run('p-base', 'terse');
    console.log("\n[Run A] profile p-base + skill 'terse' (node model blank):");
    assert(reqA.url === '/base/v1/chat/completions', `routed to base endpoint (got ${reqA.url})`);
    assert(reqA.authorization === 'Bearer key-base', `sent base key (got ${reqA.authorization})`);
    assert(reqA.body.model === 'o1-mini', `profile defaultModel reached the body (got ${reqA.body.model})`);
    assert(systemContents(reqA).includes('Be terse.'), 'injected the terse skill system prompt');

    // --- Run B: same profile + 'verbose' skill ---
    const reqB = await run('p-base', 'verbose');
    console.log("\n[Run B] profile p-base + skill 'verbose' (same profile):");
    assert(systemContents(reqB).includes('Be verbose and detailed.'), 'injected the verbose skill system prompt');
    assert(!systemContents(reqB).includes('Be terse.'), 'did not leak the terse prompt');

    console.log('\n[Cross-check] two skills diverge on ONE profile:');
    assert(
      JSON.stringify(systemContents(reqA)) !== JSON.stringify(systemContents(reqB)),
      'the two requests carry different system pre-prompts',
    );

    // --- Run C: extends profile routes (child inherits endpoint/key/defaultModel), No-Skill ---
    const reqC = await run('p-child', undefined);
    console.log('\n[Run C] profile p-child (extends p-base), No-Skill:');
    assert(reqC.url === '/base/v1/chat/completions', `child routed via inherited endpoint (got ${reqC.url})`);
    assert(reqC.authorization === 'Bearer key-base', `child inherited the base key (got ${reqC.authorization})`);
    assert(reqC.body.model === 'o1-mini', `child inherited defaultModel (got ${reqC.body.model})`);

    // --- Run D: No-Skill regression (message axis) ---
    const reqD = await run('p-base', undefined);
    console.log('\n[Run D] profile p-base + No-Skill (regression):');
    assert(systemContents(reqD).length === 0, 'no system message injected when No-Skill');
  } finally {
    server.close();
  }

  if (failures > 0) {
    console.error(`\nHARNESS FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nHARNESS PASSED: two skills diverge on one profile; defaultModel + extends-profile reach the body; No-Skill injects nothing.');
}

await main();
